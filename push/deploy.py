"""Deploy push/worker.js to Cloudflare as the Worker "spotter-push" and point the app to it.

Needs a Cloudflare API token with the one permission Account · Workers Scripts · Edit. Copy the
token, then run this from the repository root, also after changing worker.js:

    python push/deploy.py

The script reads the token from the clipboard, empties the clipboard and does not store the token.

It prints the Worker's address and writes it into PUSH_SERVER in js/push.js and the
Content-Security-Policy of index.html, so that the app may connect to it.
"""
import json
import re
import tkinter
import urllib.error
import urllib.request
import uuid
from pathlib import Path

API = "https://api.cloudflare.com/client/v4"
NAME = "spotter-push"
ROOT = Path(__file__).resolve().parent.parent


def call(token, method, path, body=None, content_type="application/json"):
    headers = {"Authorization": f"Bearer {token}"}
    if body is not None:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(API + path, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request) as response:
            return json.load(response)["result"]
    except urllib.error.HTTPError as error:
        raise SystemExit(f"{method} {path} failed ({error.code}): {error.read().decode(errors='replace')[:600]}")


def multipart(parts):
    """A multipart/form-data body of (name, content type, bytes) parts, and its boundary."""
    boundary = uuid.uuid4().hex
    body = b"".join(
        f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{name}"\r\nContent-Type: {kind}\r\n\r\n'.encode()
        + data + b"\r\n" for name, kind, data in parts)
    return body + f"--{boundary}--\r\n".encode(), boundary


def clipboard_token():
    """The API token on the clipboard, which is then emptied. Reading the clipboard works in every
    terminal, unlike a hidden prompt, which some Windows terminals do not pass keys to."""
    tk = tkinter.Tk()
    tk.withdraw()
    try:
        text = tk.clipboard_get().strip()
    except tkinter.TclError:
        text = ""
    found = re.fullmatch(r"[\w-]{30,}", text)
    if found:
        tk.clipboard_clear()
        tk.update()
    tk.destroy()
    if not found:
        raise SystemExit("The clipboard holds no API token. Copy the token in Cloudflare, then run this again.")
    return text


def main():
    token = clipboard_token()
    accounts = call(token, "GET", "/accounts")
    if len(accounts) == 1:
        account = accounts[0]["id"]
    else:
        for i, a in enumerate(accounts):
            print(f"{i}: {a['name']}")
        account = accounts[int(input("Account number: "))]["id"]

    subdomain = call(token, "GET", f"/accounts/{account}/workers/subdomain").get("subdomain")
    if not subdomain:
        raise SystemExit("Open Workers & Pages in the Cloudflare dashboard once to choose a workers.dev subdomain, then run this again.")

    # The Durable Object class is created by the first deployment only.
    scripts = call(token, "GET", f"/accounts/{account}/workers/scripts")
    deployed = next((s for s in scripts if s["id"] == NAME), None)
    metadata = {
        "main_module": "worker.js", "compatibility_date": "2025-04-01",
        "bindings": [{"type": "durable_object_namespace", "name": "SCHEDULER", "class_name": "Scheduler"}],
    }
    if not deployed or deployed.get("migration_tag") != "v1":
        metadata["migrations"] = {"new_tag": "v1", "new_sqlite_classes": ["Scheduler"]}
    body, boundary = multipart([
        ("metadata", "application/json", json.dumps(metadata).encode()),
        ("worker.js", "application/javascript+module", (ROOT / "push" / "worker.js").read_bytes()),
    ])
    call(token, "PUT", f"/accounts/{account}/workers/scripts/{NAME}", body, f"multipart/form-data; boundary={boundary}")
    call(token, "POST", f"/accounts/{account}/workers/scripts/{NAME}/subdomain", json.dumps({"enabled": True}).encode())
    url = f"https://{NAME}.{subdomain}.workers.dev"

    push = ROOT / "js" / "push.js"
    push.write_text(re.sub(r'export const PUSH_SERVER = "[^"]*";', f'export const PUSH_SERVER = "{url}";',
                           push.read_text(encoding="utf-8")), encoding="utf-8", newline="\n")
    index = ROOT / "index.html"
    html = index.read_text(encoding="utf-8")
    html = re.sub(r"connect-src 'self' https://api\.github\.com[^;]*;", f"connect-src 'self' https://api.github.com {url};", html)
    index.write_text(html, encoding="utf-8", newline="\n")
    print(f"Deployed {url}\nUpdated js/push.js and index.html.")


main()
