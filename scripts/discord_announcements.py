#!/usr/bin/env python3
"""Post newly published Community Chat releases to Discord, without exposing secrets."""
import json
import os
import pathlib
import time
import urllib.error
import urllib.request

STATE = pathlib.Path(".discord-announcements-sent.json")
WEBHOOK = os.getenv("WEBHOOK", "")
URL = os.getenv("DATABASE_URL", "")
API_KEY = os.getenv("FIREBASE_WEB_API_KEY", "")
BOT_EMAIL = os.getenv("FIREBASE_BOT_EMAIL", "")
BOT_PASSWORD = os.getenv("FIREBASE_BOT_PASSWORD", "")
NOW = int(time.time() * 1000)
# On first setup, avoid blasting old releases into Discord.
FRESH_WINDOW_MS = 48 * 60 * 60 * 1000


def authenticate():
    if not all((API_KEY, BOT_EMAIL, BOT_PASSWORD)):
        raise RuntimeError("Missing Firebase bot email, password, or web API key.")
    endpoint = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + API_KEY
    payload = json.dumps({"email": BOT_EMAIL, "password": BOT_PASSWORD, "returnSecureToken": True}).encode("utf-8")
    request = urllib.request.Request(endpoint, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return json.load(response)["idToken"]
    except urllib.error.HTTPError as exc:
        try:
            error_code = json.loads(exc.read().decode("utf-8")).get("error", {}).get("message", "UNKNOWN_ERROR")
        except (ValueError, UnicodeDecodeError, AttributeError):
            error_code = "UNKNOWN_ERROR"
        safe_codes = {"EMAIL_NOT_FOUND", "INVALID_PASSWORD", "INVALID_LOGIN_CREDENTIALS", "USER_DISABLED", "OPERATION_NOT_ALLOWED", "API_KEY_INVALID", "INVALID_API_KEY", "TOO_MANY_ATTEMPTS_TRY_LATER", "PROJECT_NOT_FOUND", "PASSWORD_LOGIN_DISABLED", "EMAIL_EXISTS", "INVALID_EMAIL"}
        if error_code not in safe_codes:
            error_code = "OTHER_FIREBASE_AUTH_ERROR"
        raise RuntimeError("Firebase bot sign-in failed (HTTP " + str(exc.code) + ", reason: " + error_code + "). Check the bot account and GitHub secrets.") from None


def read_json(url, token):
    from urllib.parse import urlencode, urlsplit, urlunsplit
    parts = urlsplit(url)
    query = parts.query + ("&" if parts.query else "") + urlencode({"auth": token})
    authenticated_url = urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))
    request = urllib.request.Request(authenticated_url, headers={"User-Agent": "CommunityChat-Announcements/1.0"})
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)


def send(payload):
    request = urllib.request.Request(
        WEBHOOK,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "CommunityChat-Announcements/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        if response.status not in (200, 204):
            raise RuntimeError(f"Discord returned {response.status}")


def main():
    if not WEBHOOK:
        raise RuntimeError("Set DISCORD_ANNOUNCEMENTS_WEBHOOK in GitHub Actions repository secrets first.")
    try:
        releases = read_json(URL, authenticate())
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            raise RuntimeError("The authenticated bot cannot read published announcements. Allow its Firebase UID read-only access to chatAnnouncementPublished.") from exc
        raise
    if not isinstance(releases, dict):
        print("No published announcements found.")
        return
    seen = set()
    if STATE.exists():
        saved = json.loads(STATE.read_text(encoding="utf-8"))
        if isinstance(saved, list):
            seen = set(str(value) for value in saved)
    print("Published release records:", len(releases))
    print("Previously sent release IDs:", len(seen))
    candidates = []
    skipped_old = 0
    skipped_seen = 0
    for key, release in releases.items():
        if not isinstance(release, dict):
            continue
        published = release.get("publishedAt")
        if not isinstance(published, (int, float)) or not (0 < NOW - published < FRESH_WINDOW_MS):
            skipped_old += 1
            continue
        features = release.get("features")
        if not isinstance(features, list):
            continue
        unique = str(key) + ":" + str(int(published))
        if unique not in seen:
            candidates.append((published, unique, release))
        else:
            skipped_seen += 1
    print("Skipped outside 48-hour window:", skipped_old)
    print("Skipped already sent:", skipped_seen)
    print("New announcements eligible for Discord:", len(candidates))
    candidates.sort()
    for _, unique, release in candidates:
        version = str(release.get("version", "Unknown"))[:60]
        features = [str(x) for x in release["features"] if isinstance(x, str)]
        description = "\n".join(features)[:3900] or "New update published."
        payload = {
            "username": "Community Chat Announcements",
            "allowed_mentions": {"parse": []},
            "embeds": [{
                "title": "📢 Community Chat — Update " + version,
                "description": description,
                "color": 5793266,
                "footer": {"text": "Official Community Chat announcement"},
            }],
        }
        send(payload)
        seen.add(unique)
        STATE.write_text(json.dumps(sorted(seen)), encoding="utf-8")
        print("Posted version", version)
    STATE.write_text(json.dumps(sorted(seen)), encoding="utf-8")
    print("Finished; new announcements:", len(candidates))


if __name__ == "__main__":
    main()
