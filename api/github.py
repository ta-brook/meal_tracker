import base64
import json
import urllib.error
import urllib.request

from api import config


def gh(method, path, payload=None):
    """Low-level GitHub API call. Returns parsed JSON. payload is a dict."""
    if not config.GITHUB_TOKEN:
        raise RuntimeError("GITHUB_TOKEN is not configured")
    req = urllib.request.Request("https://api.github.com" + path, method=method)
    req.add_header("Authorization", "Bearer " + config.GITHUB_TOKEN)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if payload is not None:
        raw = json.dumps(payload, ensure_ascii=False).encode()
        req.data = raw
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())


def get_contents(relative_path, binary=False):
    """Read a repo file via the Contents API. Returns (decoded, sha).

    Text is decoded with utf-8-sig (handles the CSV BOM); binary=True returns bytes.
    """
    r = gh("GET", f"/repos/{config.GITHUB_REPO}/contents/{relative_path}?ref={config.GITHUB_BRANCH}")
    raw = base64.b64decode(r["content"])
    return (raw if binary else raw.decode("utf-8-sig")), r["sha"]


def get_contents_or_none(relative_path, binary=False):
    """Like get_contents, but returns (None, None) on 404 (file does not exist yet)."""
    try:
        return get_contents(relative_path, binary=binary)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None, None
        raise


def put_contents(relative_path, content, sha, message, binary=False):
    """Write a repo file via the Contents API. content is str or bytes.

    Creates one commit for this file; pass the previous sha for updates.
    """
    if not isinstance(content, bytes):
        content = content.encode()
    payload = {
        "message": message,
        "content": base64.b64encode(content).decode(),
        "branch": config.GITHUB_BRANCH,
    }
    if sha:
        payload["sha"] = sha
    gh("PUT", f"/repos/{config.GITHUB_REPO}/contents/{relative_path}", payload)