import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from api import config, github, state

STRAVA_API = "https://www.strava.com/api/v3"


def _req(method, path, token, body=None):
    """Make an authenticated Strava API request."""
    url = STRAVA_API + path
    data = None
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, method=method, data=data)
    req.add_header("Authorization", "Bearer " + token)
    if data:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def _post_form(url, data):
    """POST application/x-www-form-urlencoded data."""
    encoded = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=encoded, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def exchange_code(code):
    """Exchange an OAuth authorization code for tokens."""
    if not config.STRAVA_CLIENT_ID or not config.STRAVA_CLIENT_SECRET:
        raise RuntimeError("Strava client credentials are not configured")
    return _post_form("https://www.strava.com/oauth/token", {
        "client_id": config.STRAVA_CLIENT_ID,
        "client_secret": config.STRAVA_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
    })


def refresh_token(refresh_token_str):
    """Refresh an access token. Returns the full token response."""
    if not config.STRAVA_CLIENT_ID or not config.STRAVA_CLIENT_SECRET:
        raise RuntimeError("Strava client credentials are not configured")
    return _post_form("https://www.strava.com/oauth/token", {
        "client_id": config.STRAVA_CLIENT_ID,
        "client_secret": config.STRAVA_CLIENT_SECRET,
        "refresh_token": refresh_token_str,
        "grant_type": "refresh_token",
    })


def get_athlete(token):
    return _req("GET", "/athlete", token)


def get_activities(token, after=None, before=None, per_page=30):
    """Fetch athlete activities. after/before are Unix timestamps."""
    qs = ["per_page=" + str(per_page)]
    if after:
        qs.append("after=" + str(int(after)))
    if before:
        qs.append("before=" + str(int(before)))
    path = "/athlete/activities?" + "&".join(qs)
    return _req("GET", path, token)


def get_activity(token, activity_id):
    return _req("GET", f"/activities/{activity_id}", token)


def activity_to_exercise(activity):
    """Convert a Strava activity dict to our exercise schema."""
    start = activity.get("start_date_local", activity.get("start_date", ""))
    date = start[:10] if len(start) >= 10 else None
    if not date:
        return None
    # Duration is in seconds
    duration_sec = activity.get("moving_time", activity.get("elapsed_time", 0))
    distance_m = activity.get("distance", 0)
    calories = activity.get("calories", 0)
    hr_avg = activity.get("average_heartrate", 0)
    return {
        "date": date,
        "type": activity.get("type", "Other"),
        "duration": round(duration_sec / 60.0, 1),  # minutes
        "distance": round(distance_m / 1000.0, 2),   # km
        "calories": round(calories, 1) if calories else 0,
        "hr_avg": round(hr_avg, 1) if hr_avg else 0,
    }


def sync_user(uid):
    """Fetch latest Strava activities for a user and merge them into health data.

    Returns (summary, error).
    """
    user, _ = state.read_user(uid)
    strava_meta = user.get("strava") or {}
    access_token = strava_meta.get("access_token")
    refresh_token_str = strava_meta.get("refresh_token")
    expires_at = strava_meta.get("expires_at", 0)

    if not access_token:
        return None, "Strava not connected"

    # Refresh if expired
    if expires_at and datetime.now(timezone.utc).timestamp() >= expires_at - 300:
        try:
            refreshed = refresh_token(refresh_token_str)
            access_token = refreshed["access_token"]
            strava_meta["access_token"] = access_token
            strava_meta["refresh_token"] = refreshed["refresh_token"]
            strava_meta["expires_at"] = refreshed["expires_at"]
        except Exception as e:
            return None, f"Token refresh failed: {e}"

    # Fetch recent activities (last 30 days)
    after = datetime.now(timezone.utc).timestamp() - 30 * 86400
    try:
        activities = get_activities(access_token, after=after, per_page=50)
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return None, "Strava token expired or revoked"
        raise

    from api import import_handlers
    exercises = [activity_to_exercise(a) for a in activities if activity_to_exercise(a)]
    result = {"type": "strava", "sleep": [], "exercise": exercises, "weights": [], "daily": {}}
    summary = import_handlers.merge_health_import(user, result)

    # Save updated user
    user["strava"] = strava_meta
    rel = config.USER_FILES[uid]
    new_content = json.dumps(user, ensure_ascii=False, indent=2)
    if config.persistent():
        if github.read_file_text(rel) != new_content:
            github.commit_files({rel: new_content}, f"Sync Strava activities for {user['name']}")
    else:
        github.write_files_local({rel: new_content})

    return summary, None


def build_auth_url(redirect_uri, state_str=""):
    if not config.STRAVA_CLIENT_ID:
        raise RuntimeError("STRAVA_CLIENT_ID is not configured")
    params = {
        "client_id": config.STRAVA_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "approval_prompt": "auto",
        "scope": "activity:read_all",
    }
    if state_str:
        params["state"] = state_str
    return "https://www.strava.com/oauth/authorize?" + urllib.parse.urlencode(params)
