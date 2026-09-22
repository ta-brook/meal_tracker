import csv
import io
import json
import zipfile
from xml.etree import ElementTree as ET


def _date(v):
    """Extract YYYY-MM-DD from various date strings."""
    if not v:
        return None
    v = str(v).strip()
    if len(v) >= 10:
        d = v[:10]
        if d[4] == "-" and d[7] == "-":
            return d
    return None


def _num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _detect_csv_type(rows):
    """Heuristically detect what kind of fitness CSV this is."""
    if not rows:
        return "unknown"
    headers = set(rows[0].keys())
    h = {k.lower().replace(" ", "").replace("_", "").replace("(", "").replace(")", "") for k in headers}

    # Garmin activities
    if h & {"activitytype", "activitytype", "activityname", "distance", "calories", "averagespeed"}:
        return "garmin_activities"
    # Garmin wellness / sleep
    if h & {"sleepingshours", "sleeptimeinbed", "sleepstarttime", "sleepscore", "deep", "light", "rem"}:
        return "garmin_sleep"
    # Garmin weight / body composition
    if h & {"weight", "bmi", "bodyfat", "bodywater", "bonemass", "musclemass"}:
        return "garmin_weight"
    # Garmin heart rate
    if h & {"heartrate", "restingheartrate", "minheartrate", "maxheartrate"}:
        return "garmin_hr"
    # Garmin steps
    if h & {"steps", "dailysteps", "stepcount", "distance", "floorsclimbed"}:
        return "garmin_steps"
    # Generic sleep
    if h & {"sleep", "sleeptime", "deepsleep", "lightsleep", "remsleep", "awaketime", "sleepdate"}:
        return "sleep"
    # Generic exercise
    if h & {"activity", "sport", "duration", "distance", "calories", "averagespeed", "type"}:
        return "exercise"
    return "unknown"


def _parse_garmin_activities(rows):
    """Parse Garmin Connect activities CSV."""
    exercises = []
    for r in rows:
        date = _date(r.get("Date") or r.get("Start Time") or r.get("Activity Date"))
        if not date:
            continue
        exercises.append({
            "date": date,
            "type": str(r.get("Activity Type") or r.get("ActivityName") or "Other").strip() or "Other",
            "duration": _num(r.get("Time") or r.get("Duration") or r.get("Moving Time")),
            "distance": _num(r.get("Distance")),
            "calories": _num(r.get("Calories")),
            "hr_avg": _num(r.get("Average HR") or r.get("Avg HR")),
        })
    return {"exercise": exercises}


def _parse_garmin_sleep(rows):
    """Parse Garmin wellness/sleep CSV."""
    sleep = []
    for r in rows:
        date = _date(r.get("Date") or r.get("Sleep Start Time"))
        if not date:
            continue
        # Garmin sleep durations are often in hours or minutes depending on export version
        hours = _num(r.get("Sleeping Hours") or r.get("Sleep Time") or r.get("Sleep Duration"))
        if hours > 24:  # probably minutes
            hours = hours / 60.0
        deep = _num(r.get("Deep (min)") or r.get("Deep Sleep"))
        light = _num(r.get("Light (min)") or r.get("Light Sleep"))
        rem = _num(r.get("REM (min)") or r.get("REM Sleep"))
        awake = _num(r.get("Awake (min)") or r.get("Awake"))
        score = _num(r.get("Sleep Score") or r.get("Score"))
        sleep.append({
            "date": date,
            "score": score,
            "hours": round(hours, 2),
            "deep": deep,
            "light": light,
            "rem": rem,
            "awake": awake,
        })
    return {"sleep": sleep}


def _parse_garmin_weight(rows):
    """Parse Garmin body composition / weight CSV."""
    weights = []
    for r in rows:
        date = _date(r.get("Date") or r.get("Time"))
        if not date:
            continue
        w = _num(r.get("Weight") or r.get("Weight (kg)"))
        if w > 1000:  # grams?
            w = w / 1000.0
        if w < 20 or w > 300:
            continue
        weights.append({"date": date, "weight": round(w, 2)})
    return {"weights": weights}


def _parse_garmin_hr(rows):
    """Parse Garmin heart rate CSV."""
    daily = {}
    for r in rows:
        date = _date(r.get("Date") or r.get("Time"))
        if not date:
            continue
        entry = daily.setdefault(date, {})
        resting = _num(r.get("Resting Heart Rate") or r.get("Resting HR"))
        avg = _num(r.get("Average Heart Rate") or r.get("Avg HR") or r.get("Heart Rate"))
        max_hr = _num(r.get("Max Heart Rate") or r.get("Max HR"))
        min_hr = _num(r.get("Min Heart Rate") or r.get("Min HR"))
        if resting:
            entry["resting_hr"] = resting
        if avg:
            entry["avg_hr"] = avg
        if max_hr:
            entry["max_hr"] = max_hr
        if min_hr:
            entry["min_hr"] = min_hr
    return {"daily": daily}


def _parse_garmin_steps(rows):
    """Parse Garmin steps CSV."""
    daily = {}
    for r in rows:
        date = _date(r.get("Date") or r.get("Time"))
        if not date:
            continue
        entry = daily.setdefault(date, {})
        steps = _num(r.get("Steps") or r.get("Daily Steps") or r.get("Step Count"))
        distance = _num(r.get("Distance") or r.get("Distance (km)"))
        active_cals = _num(r.get("Active Calories") or r.get("Active Energy") or r.get("Calories"))
        if steps:
            entry["steps"] = int(steps)
        if distance:
            entry["distance"] = round(distance, 2)
        if active_cals:
            entry["active_calories"] = round(active_cals, 1)
    return {"daily": daily}


def _parse_generic_sleep(rows):
    sleep = []
    for r in rows:
        date = _date(r.get("date") or r.get("sleep date") or r.get("start time"))
        if not date:
            continue
        hours = _num(r.get("hours") or r.get("sleep time") or r.get("total sleep time (hrs)"))
        if hours > 24:
            hours = hours / 60.0
        sleep.append({
            "date": date,
            "score": _num(r.get("score") or r.get("sleep score")),
            "hours": round(hours, 2),
            "deep": _num(r.get("deep") or r.get("deep sleep (min)")),
            "light": _num(r.get("light") or r.get("light sleep (min)")),
            "rem": _num(r.get("rem") or r.get("rem sleep (min)")),
            "awake": _num(r.get("awake") or r.get("awake (min)")),
        })
    return {"sleep": sleep}


def _parse_generic_exercise(rows):
    exercises = []
    for r in rows:
        date = _date(r.get("date") or r.get("activity date") or r.get("start"))
        if not date:
            continue
        exercises.append({
            "date": date,
            "type": str(r.get("type") or r.get("activity type") or r.get("sport") or "Other").strip() or "Other",
            "duration": _num(r.get("duration") or r.get("duration (min)")),
            "distance": _num(r.get("distance") or r.get("distance (km)")),
            "calories": _num(r.get("calories") or r.get("calories (kcal)") or r.get("energy")),
            "hr_avg": _num(r.get("hr_avg") or r.get("average hr") or r.get("avg hr") or r.get("hr")),
        })
    return {"exercise": exercises}


def parse_csv(text):
    """Parse a CSV string and detect its type, returning structured health data."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    f = io.StringIO(text)
    try:
        reader = csv.DictReader(f)
        rows = list(reader)
    except Exception:
        return {"type": "unknown", "sleep": [], "exercise": [], "weights": [], "daily": {}}

    csv_type = _detect_csv_type(rows)
    result = {"type": csv_type, "sleep": [], "exercise": [], "weights": [], "daily": {}}

    if csv_type == "garmin_activities":
        result.update(_parse_garmin_activities(rows))
    elif csv_type == "garmin_sleep":
        result.update(_parse_garmin_sleep(rows))
    elif csv_type == "garmin_weight":
        result.update(_parse_garmin_weight(rows))
    elif csv_type == "garmin_hr":
        result.update(_parse_garmin_hr(rows))
    elif csv_type == "garmin_steps":
        result.update(_parse_garmin_steps(rows))
    elif csv_type == "sleep":
        result.update(_parse_generic_sleep(rows))
    elif csv_type == "exercise":
        result.update(_parse_generic_exercise(rows))

    return result


# --- Apple Health XML ---

APPLE_TYPE_MAP = {
    "HKQuantityTypeIdentifierBodyMass": "weight",
    "HKQuantityTypeIdentifierStepCount": "steps",
    "HKQuantityTypeIdentifierHeartRate": "hr",
    "HKQuantityTypeIdentifierRestingHeartRate": "resting_hr",
    "HKQuantityTypeIdentifierActiveEnergyBurned": "active_calories",
    "HKQuantityTypeIdentifierBasalEnergyBurned": "basal_calories",
    "HKQuantityTypeIdentifierDistanceWalkingRunning": "distance",
    "HKQuantityTypeIdentifierDistanceCycling": "distance",
    "HKQuantityTypeIdentifierOxygenSaturation": "spo2",
    "HKQuantityTypeIdentifierRespiratoryRate": "respiratory_rate",
    "HKQuantityTypeIdentifierBodyTemperature": "temperature",
    "HKQuantityTypeIdentifierBloodPressureSystolic": "bp_systolic",
    "HKQuantityTypeIdentifierBloodPressureDiastolic": "bp_diastolic",
    "HKCategoryTypeIdentifierSleepAnalysis": "sleep",
    "HKQuantityTypeIdentifierWorkoutType": "workout",
}

SLEEP_VALUE_MAP = {
    "HKCategoryValueSleepAnalysisInBed": "in_bed",
    "HKCategoryValueSleepAnalysisAsleepUnspecified": "asleep",
    "HKCategoryValueSleepAnalysisAsleepCore": "light",
    "HKCategoryValueSleepAnalysisAsleepDeep": "deep",
    "HKCategoryValueSleepAnalysisAsleepREM": "rem",
    "HKCategoryValueSleepAnalysisAwake": "awake",
    "HKCategoryValueSleepAnalysisAsleep": "asleep",
}


def parse_apple_health_xml(file_bytes):
    """
    Parse an Apple Health export.xml (possibly inside a ZIP).
    Uses iterparse for memory efficiency with large files.
    Returns {"sleep": [...], "exercise": [...], "weights": [...], "daily": {...}}.
    """
    # If it's a ZIP, extract export.xml
    xml_bytes = file_bytes
    if file_bytes[:2] == b"PK":
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes), "r") as z:
                names = [n for n in z.namelist() if n.lower().endswith("export.xml")]
                if not names:
                    raise ValueError("ZIP does not contain export.xml")
                xml_bytes = z.read(names[0])
        except zipfile.BadZipFile:
            pass

    # Stream-parse the XML
    daily = {}
    weights = []
    exercises = []
    sleep_segments = []
    current_workout = None  # holds accumulating workout data while inside a Workout element

    try:
        context = ET.iterparse(io.BytesIO(xml_bytes), events=("start", "end"))
        context = iter(context)
        for event, elem in context:
            tag = elem.tag
            if event == "start":
                if tag == "Workout":
                    workout_type = elem.get("workoutActivityType", "Other")
                    start = elem.get("startDate", "")
                    duration = _num(elem.get("duration", 0))
                    duration_unit = elem.get("durationUnit", "min")
                    if duration_unit.lower() in ("hr", "hour", "hours"):
                        duration = duration * 60
                    current_workout = {
                        "date": _date(start),
                        "type": workout_type.replace("HKWorkoutActivityType", "").replace("(", "").replace(")", "") or "Other",
                        "duration": duration,
                        "distance": None,
                        "calories": None,
                        "hr_avg": None,
                    }
                continue

            # event == "end"
            if tag == "Record":
                type_attr = elem.get("type", "")
                start = elem.get("startDate", "")
                value = elem.get("value", "")
                unit = elem.get("unit", "")
                date = _date(start)
                if not date:
                    elem.clear()
                    continue

                mapped = APPLE_TYPE_MAP.get(type_attr)
                if not mapped:
                    elem.clear()
                    continue

                if mapped == "weight":
                    v = _num(value)
                    # Apple Health sometimes stores weight in pounds
                    if "lb" in unit.lower() or "pound" in unit.lower():
                        v = v * 0.453592
                    if 20 < v < 300:
                        weights.append({"date": date, "weight": round(v, 2)})
                elif mapped == "steps":
                    v = _num(value)
                    if v > 0:
                        daily.setdefault(date, {}).setdefault("steps", 0)
                        daily[date]["steps"] += int(v)
                elif mapped == "hr":
                    v = _num(value)
                    if v > 0:
                        daily.setdefault(date, {}).setdefault("hr_readings", [])
                        daily[date]["hr_readings"].append(v)
                elif mapped == "resting_hr":
                    v = _num(value)
                    if v > 0:
                        daily.setdefault(date, {})["resting_hr"] = v
                elif mapped == "active_calories":
                    v = _num(value)
                    if v > 0:
                        daily.setdefault(date, {}).setdefault("active_calories", 0)
                        daily[date]["active_calories"] += round(v, 1)
                elif mapped == "distance":
                    v = _num(value)
                    if v > 0:
                        if "mi" in unit.lower():
                            v = v * 1.60934
                        daily.setdefault(date, {}).setdefault("distance", 0)
                        daily[date]["distance"] += round(v, 2)
                elif mapped == "sleep":
                    # Some Apple Health exports represent sleep as Records rather than SleepAnalysis
                    stage = SLEEP_VALUE_MAP.get(value, "asleep")
                    end = elem.get("endDate", "")
                    sleep_segments.append({
                        "date": date,
                        "start": start,
                        "end": end,
                        "stage": stage,
                    })

            elif tag == "WorkoutStatistics":
                if current_workout is not None:
                    stat_type = elem.get("type", "")
                    stat_sum = elem.get("sum", "")
                    stat_avg = elem.get("average", "")
                    if "Distance" in stat_type and current_workout["distance"] is None:
                        current_workout["distance"] = _num(stat_sum)
                    if "EnergyBurned" in stat_type and current_workout["calories"] is None:
                        current_workout["calories"] = _num(stat_sum)
                    if "HeartRate" in stat_type and current_workout["hr_avg"] is None:
                        current_workout["hr_avg"] = _num(stat_avg)

            elif tag == "Workout":
                if current_workout is not None and current_workout["date"]:
                    exercises.append({
                        "date": current_workout["date"],
                        "type": current_workout["type"],
                        "duration": current_workout["duration"],
                        "distance": current_workout["distance"] or 0,
                        "calories": current_workout["calories"] or 0,
                        "hr_avg": current_workout["hr_avg"] or 0,
                    })
                current_workout = None

            elif tag == "SleepAnalysis":
                # Legacy Apple Health sleep format (some exports use this)
                start = elem.get("startDate", "")
                end = elem.get("endDate", "")
                value = elem.get("value", "")
                date = _date(start)
                if date:
                    sleep_segments.append({
                        "date": date,
                        "start": start,
                        "end": end,
                        "stage": SLEEP_VALUE_MAP.get(value, "unknown"),
                    })

            elem.clear()
    except ET.ParseError as e:
        raise ValueError(f"Invalid XML: {e}")

    # Post-process heart rate readings into averages
    for date, data in daily.items():
        readings = data.pop("hr_readings", [])
        if readings:
            data["avg_hr"] = round(sum(readings) / len(readings), 1)
            data["max_hr"] = round(max(readings), 1)
            data["min_hr"] = round(min(readings), 1)

    # Convert sleep segments into daily summaries
    sleep = _aggregate_sleep_segments(sleep_segments)

    return {
        "type": "apple_health",
        "sleep": sleep,
        "exercise": exercises,
        "weights": weights,
        "daily": daily,
    }


def _aggregate_sleep_segments(segments):
    """Aggregate Apple Health sleep segments into daily sleep records."""
    from collections import defaultdict
    days = defaultdict(lambda: {"deep": 0, "light": 0, "rem": 0, "awake": 0, "total_min": 0})

    for seg in segments:
        date = seg["date"]
        stage = seg["stage"]
        start = seg.get("start", "")
        end = seg.get("end", "")
        try:
            from datetime import datetime
            fmt = "%Y-%m-%d %H:%M:%S %z"
            # Handle various date formats
            s = datetime.fromisoformat(start.replace("Z", "+00:00"))
            e = datetime.fromisoformat(end.replace("Z", "+00:00"))
            mins = (e - s).total_seconds() / 60.0
        except Exception:
            continue

        days[date]["total_min"] += mins
        if stage in ("deep", "light", "rem", "awake"):
            days[date][stage] += mins

    sleep = []
    for date, data in sorted(days.items()):
        total = data["total_min"]
        sleep.append({
            "date": date,
            "score": 0,  # Apple Health doesn't export sleep scores natively
            "hours": round(total / 60.0, 2),
            "deep": round(data["deep"], 1),
            "light": round(data["light"], 1),
            "rem": round(data["rem"], 1),
            "awake": round(data["awake"], 1),
        })
    return sleep


def merge_health_import(user, import_result):
    """
    Merge import_result into a user dict (the normalized user object).
    Mutates user in place. Returns a summary dict.
    """
    user.setdefault("health", {"sleep": [], "exercise": []})
    user.setdefault("weights", [])
    user["health"].setdefault("sleep", [])
    user["health"].setdefault("exercise", [])
    user["health"].setdefault("daily", {})

    summary = {"sleep": 0, "exercise": 0, "weights": 0, "daily": 0}

    # Merge sleep (dedupe by date)
    sleep_seen = {s["date"]: s for s in user["health"]["sleep"]}
    for s in import_result.get("sleep", []):
        if s["date"] not in sleep_seen:
            sleep_seen[s["date"]] = s
            summary["sleep"] += 1
    user["health"]["sleep"] = sorted(sleep_seen.values(), key=lambda x: x["date"])

    # Merge exercise (dedupe by date+type)
    ex_seen = {e["date"] + e.get("type", "Other"): e for e in user["health"]["exercise"]}
    for e in import_result.get("exercise", []):
        key = e["date"] + e.get("type", "Other")
        if key not in ex_seen:
            ex_seen[key] = e
            summary["exercise"] += 1
    user["health"]["exercise"] = sorted(ex_seen.values(), key=lambda x: x["date"])

    # Merge weights (dedupe by date, prefer imported if newer logic not needed)
    w_seen = {w["date"]: w for w in user["weights"]}
    for w in import_result.get("weights", []):
        # Allow update if same date but different value? For now dedupe by date.
        if w["date"] not in w_seen:
            w_seen[w["date"]] = w
            summary["weights"] += 1
        else:
            # Update if imported value is more precise (has decimals) or just replace
            w_seen[w["date"]] = w
    user["weights"] = sorted(w_seen.values(), key=lambda x: x["date"])

    # Merge daily metrics
    daily = user["health"]["daily"]
    for date, metrics in import_result.get("daily", {}).items():
        if date not in daily:
            daily[date] = {}
            summary["daily"] += 1
        for k, v in metrics.items():
            if k not in daily[date]:
                daily[date][k] = v
            else:
                # For counters, sum; for averages, keep existing or use latest
                if k in ("steps", "active_calories", "distance"):
                    daily[date][k] = round(daily[date][k] + v, 2) if k != "steps" else daily[date][k] + v
                else:
                    daily[date][k] = v
    user["health"]["daily"] = daily

    return summary
