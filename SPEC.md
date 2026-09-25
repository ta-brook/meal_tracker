# SPEC — Per-User Login Page (Ticket #7)

## Goal
Replace the single shared `APP_PASSWORD` with per-user passwords and add a proper login screen before the app UI.

## Scope

### IN
- Per-user password env vars (`BOOK_PASSWORD`, `JINGJING_PASSWORD`)
- Keep `APP_PASSWORD` as a master fallback
- New `/api/login` endpoint: accepts `{user, password}`, returns `{ok, user}`
- Login overlay in `index.html`: profile selection + password input + remember me
- Frontend login flow in `app.js`: validate → store token → unlock app
- Login card styled in `style.css` (pastel theme, centered, modal-like)
- `localStorage` persistence for "remember me"

### OUT
- No database migration
- No OAuth / Google / third-party auth
- No registration (still 2 hardcoded users)
- No session cookies or JWT (keep header-based auth)
- No encryption at rest (GitHub already private)

## Backend changes

### `api/config.py`
Add:
```python
BOOK_PASSWORD = os.getenv("BOOK_PASSWORD")
JINGJING_PASSWORD = os.getenv("JINGJING_PASSWORD")
USER_PASSWORDS = {
    "book": BOOK_PASSWORD,
    "jingjing": JINGJING_PASSWORD,
}
```

### `api/index.py`
Replace `check_password()` with:
```python
def check_password(supplied=None, user=None):
    if not config.APP_PASSWORD and not any(config.USER_PASSWORDS.values()):
        return True
    if supplied == config.APP_PASSWORD:
        return True
    if user and supplied == config.USER_PASSWORDS.get(user):
        return True
    return False
```

Add endpoint:
```python
@app.post("/api/login")
def login():
    body = request.get_json(force=True) or {}
    uid = str(body.get("user", "")).strip()
    pw = str(body.get("password", "")).strip()
    if uid not in config.USER_FILES:
        return jsonify(error="Invalid user"), 400
    if not check_password(pw, uid):
        return jsonify(error="Invalid password"), 401
    return jsonify(ok=True, user=uid)
```

Update all existing `check_password()` calls to pass the user's password header where applicable. For endpoints that don't have a user context (like `/api/state` GET), we keep checking the master password or any valid user password via header.

Wait — actually, to keep it simple: **all endpoints continue to use the same `X-App-Password` header**. The frontend just knows which user's password to send. The `/api/login` endpoint is purely for validation; after login, the frontend sends the same password header on every request.

So `check_password()` becomes:
```python
def check_password(supplied=None, user=None):
    if not config.APP_PASSWORD and not any(config.USER_PASSWORDS.values()):
        return True
    if not supplied:
        return False
    if supplied == config.APP_PASSWORD:
        return True
    if user and supplied == config.USER_PASSWORDS.get(user):
        return True
    # If no user specified but the password matches any user's password, allow it
    if any(supplied == p for p in config.USER_PASSWORDS.values() if p):
        return True
    return False
```

This means:
- `/api/login` passes `user` explicitly to validate that specific user's password
- All other endpoints just check the header against any valid password

## Frontend changes

### `templates/index.html`
Add a login overlay `<div id="loginOverlay">` as the first child of `<body>`:
- App logo + title
- Two profile buttons: "book" and "jingjing" (with icons)
- Password input
- "Remember me" checkbox
- "Sign in" button
- Error message area

The overlay has `display:none` once logged in.

### `static/app.js`
New global:
```js
let loginToken = localStorage.getItem("mealTrackerLogin") || "";
let loggedInUser = null;
```

On boot (`init()`):
1. Show login overlay
2. If `loginToken` exists in `localStorage` and has a `user:password` format, try auto-login
3. On profile button click, set `selectedUser`
4. On "Sign in", POST `/api/login` with `{user, password}`
5. On success: hide overlay, set `loginToken = password`, store if remember me, call `loadCloud()`

Update `api()` helper to always include `X-App-Password: loginToken` if set.

Update `loadCloud()` to use the logged-in user as `active_user` if not already set.

Add logout button in Settings.

### `static/style.css`
Add:
- `.login-overlay` — fixed full-screen, flex center, soft background blur or solid cream background
- `.login-card` — white card, large radius, shadow, max-width 360px
- `.login-profiles` — two big tap targets for profile selection
- `.login-profile.active` — highlighted state
- Input + button styles reuse existing tokens

## Data model
No changes to JSON schema.

## Testing
1. `flask --app api/index.py run`
2. Open `http://127.0.0.1:5000/`
3. See login overlay
4. Pick "book", enter wrong password → error
5. Enter correct password (or if no env set, any password works) → app loads
6. Check "remember me" → close tab → reopen → still logged in
7. Click logout → back to login overlay
8. Test that all existing tabs/features still work

## Files
- `api/config.py`
- `api/index.py`
- `templates/index.html`
- `static/app.js`
- `static/style.css`
- `state.md`
- `TASKS.md`
