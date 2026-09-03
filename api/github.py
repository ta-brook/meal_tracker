import base64
import json
import os
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


def read_file_text(relative_path):
    """Return the current file text (GitHub or local fallback), or None if missing."""
    if config.persistent():
        try:
            text, _ = get_contents(relative_path)
            return text
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise
        except Exception:
            return None
    local_path = os.path.join(config.DATA_ROOT, relative_path)
    try:
        with open(local_path, encoding="utf-8-sig") as f:
            return f.read()
    except Exception:
        return None


def write_files_local(changes):
    """Write files to the local data/ fallback. changes: {relative_path: str|bytes}."""
    for rel_path, content in changes.items():
        local_path = os.path.join(config.DATA_ROOT, rel_path)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        if isinstance(content, bytes):
            with open(local_path, "wb") as f:
                f.write(content)
        else:
            with open(local_path, "w", encoding="utf-8") as f:
                f.write(content)


# --- Atomic multi-file commits via the Git Data API ---
# commit_files() writes every changed file in a SINGLE commit: either all files
# update or none do. This avoids the partial-write state of two separate PUTs.


def _get_ref():
    return gh("GET", f"/repos/{config.GITHUB_REPO}/git/ref/heads/{config.GITHUB_BRANCH}")


def _create_blob(content):
    payload = {"content": base64.b64encode(content).decode(), "encoding": "base64"}
    return gh("POST", f"/repos/{config.GITHUB_REPO}/git/blobs", payload)["sha"]


def _get_tree(sha):
    return gh("GET", f"/repos/{config.GITHUB_REPO}/git/trees/{sha}?recursive=1")


def _create_tree(base_tree, entries):
    payload = {"base_tree": base_tree, "tree": entries}
    return gh("POST", f"/repos/{config.GITHUB_REPO}/git/trees", payload)["sha"]


def _create_commit(tree, parents, message):
    payload = {"message": message, "tree": tree, "parents": parents}
    return gh("POST", f"/repos/{config.GITHUB_REPO}/git/commits", payload)["sha"]


def _update_ref(commit_sha, expect_sha):
    payload = {"sha": commit_sha, "force": False}
    try:
        gh("PATCH", f"/repos/{config.GITHUB_REPO}/git/refs/heads/{config.GITHUB_BRANCH}", payload)
    except urllib.error.HTTPError as e:
        if e.code == 409 and expect_sha:
            raise RuntimeError("CONFLICT")
        raise


def commit_files(changes, message):
    """Create one atomic commit updating all files in `changes`.

    changes: dict of {relative_path: str|bytes}. Retries once if the branch ref
    moved concurrently (409); raises RuntimeError("CONFLICT") if it persists.
    """
    ref = _get_ref()
    head_sha = ref["object"]["sha"]
    tree = _get_tree(head_sha)
    entries = []
    for rel_path, content in changes.items():
        if not isinstance(content, bytes):
            content = content.encode()
        blob_sha = _create_blob(content)
        entries.append({"path": rel_path, "mode": "100644", "type": "blob", "sha": blob_sha})
    new_tree = _create_tree(tree["sha"], entries)
    commit = _create_commit(new_tree, [head_sha], message)
    try:
        _update_ref(commit, head_sha)
    except RuntimeError:
        # Branch moved while we worked: re-read and retry once.
        ref = _get_ref()
        head_sha = ref["object"]["sha"]
        new_tree = _create_tree(_get_tree(head_sha)["sha"], entries)
        commit = _create_commit(new_tree, [head_sha], message)
        _update_ref(commit, head_sha)