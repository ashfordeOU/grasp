#!/usr/bin/env python3
"""
One-shot Chrome Web Store refresh-token minter.

Usage:
  python3 scripts/mint-cws-token.py

What it does (in order):
  1. Reads CHROME_CLIENT_ID and CHROME_CLIENT_SECRET from your environment
     (or prompts you for them).
  2. Spins up a local HTTP server on http://localhost:8731 to catch the
     OAuth redirect.
  3. Opens the Google consent page in your default browser.
  4. After you click "Allow", exchanges the auth code for a refresh token.
  5. Updates the GitHub secret CHROME_REFRESH_TOKEN via `gh secret set`.
  6. Re-runs the most recent failed Publish workflow (optional).

One-time prerequisite:
  Add the redirect URI to your OAuth client in Google Cloud Console:
    https://console.cloud.google.com/apis/credentials
    → click your OAuth 2.0 Client ID
    → Authorized redirect URIs → add: http://localhost:8731
    → Save

Re-run this script any time CI complains that the CWS refresh token has
expired or been revoked. Total time: ~30 seconds (one browser click).
"""
import http.server
import json
import os
import secrets
import socketserver
import subprocess
import sys
import threading
import urllib.parse
import urllib.request
import webbrowser

PORT = 8731
REDIRECT_URI = f"http://localhost:{PORT}"
SCOPE = "https://www.googleapis.com/auth/chromewebstore"


def get_secret(name: str) -> str:
    val = os.environ.get(name)
    if val:
        return val.strip()
    val = input(f"Paste {name}: ").strip()
    if not val:
        sys.exit(f"{name} is required")
    return val


def main() -> int:
    print("─" * 60)
    print("Chrome Web Store refresh-token minter")
    print("─" * 60)
    print()
    print(
        "Prerequisite: this OAuth client must list "
        f"{REDIRECT_URI} as an authorized redirect URI.\n"
        "If it doesn't, add it now at "
        "https://console.cloud.google.com/apis/credentials\n"
        "(open your OAuth client → Authorized redirect URIs → + ADD URI → Save)\n"
    )

    client_id = get_secret("CHROME_CLIENT_ID")
    client_secret = get_secret("CHROME_CLIENT_SECRET")
    state = secrets.token_urlsafe(16)

    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        + urllib.parse.urlencode(
            {
                "client_id": client_id,
                "redirect_uri": REDIRECT_URI,
                "response_type": "code",
                "scope": SCOPE,
                "access_type": "offline",
                "prompt": "consent",
                "state": state,
            }
        )
    )

    received: dict[str, str] = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            params = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(self.path).query))
            if params.get("state") != state:
                self.send_error(400, "state mismatch")
                return
            if "error" in params:
                received["error"] = params["error"]
                self.send_response(400)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(f"<h1>OAuth error: {params['error']}</h1>".encode())
                return
            received["code"] = params.get("code", "")
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Token captured. You can close this tab.</h1>")

        def log_message(self, *args):
            pass

    server = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=server.handle_request, daemon=True).start()
    print(f"\nOpening browser for consent. Sign in with the Chrome Web Store publisher account, then click Allow.\n")
    webbrowser.open(auth_url)

    while "code" not in received and "error" not in received:
        pass
    server.server_close()

    if "error" in received:
        sys.exit(f"OAuth flow returned error: {received['error']}")

    print("Got auth code. Exchanging for refresh token...")
    body = urllib.parse.urlencode(
        {
            "code": received["code"],
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
        }
    ).encode()
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        tok = json.loads(resp.read())

    refresh = tok.get("refresh_token")
    if not refresh:
        sys.exit(f"No refresh_token in response. Full response:\n{json.dumps(tok, indent=2)}")

    print("Got refresh token. Updating GitHub secret CHROME_REFRESH_TOKEN...")
    proc = subprocess.run(
        ["gh", "secret", "set", "CHROME_REFRESH_TOKEN"],
        input=refresh,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        print("gh secret set failed:")
        print(proc.stderr)
        print()
        print("You can copy this token and run `gh secret set CHROME_REFRESH_TOKEN` manually:")
        print(refresh)
        sys.exit(1)

    print("✓ CHROME_REFRESH_TOKEN updated.")
    print()
    if input("Re-run the latest failed Publish CI run now? [Y/n] ").strip().lower() in ("", "y", "yes"):
        latest = subprocess.run(
            ["gh", "run", "list", "--workflow=publish.yml", "--limit=1", "--json=databaseId,conclusion"],
            capture_output=True,
            text=True,
        )
        try:
            run_id = str(json.loads(latest.stdout)[0]["databaseId"])
        except Exception:
            print("Couldn't auto-detect a run; trigger a re-run manually with `gh run rerun <run-id> --failed`.")
            return 0
        subprocess.run(["gh", "run", "rerun", run_id, "--failed"])
        print(f"✓ Re-ran run {run_id}. Watch with: gh run watch {run_id}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
