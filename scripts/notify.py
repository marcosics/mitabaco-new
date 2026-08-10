import json
import os
import sys

# This script reads price-changes.json and sends push notifications
# Uses pywebpush library

try:
    from pywebpush import webpush, WebPushException
except ImportError:
    print("pywebpush not installed. Install with: pip install pywebpush")
    sys.exit(0)

VAPID_PRIVATE = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC = os.environ.get("VAPID_PUBLIC_KEY", "BCQpt8_4gPBwSoOfZIHIaBgLy5tUP-vnn7-2T2hyK3hBeK9wRhzZ5U_Sbh_69RDABadKRsjEfB9KnI-80z2YBtk")

def send_push(subscription, title, body):
    try:
        payload = json.dumps({
            "title": title,
            "body": body,
            "icon": "/favicon.ico",
            "badge": "/favicon.ico",
            "vibrate": [200, 100, 200]
        })
        webpush(
            subscription_info=subscription,
            data=payload,
            vapid_private_key=VAPID_PRIVATE,
            vapid_claims={"sub": "mailto:notify@mitabaco.app"}
        )
        return True
    except WebPushException as e:
        print(f"Push failed: {e}")
        return False

def main():
    changes_path = "data/price-changes.json"
    subs_path = "data/subscriptions.json"

    if not os.path.exists(changes_path):
        print("No price changes found")
        return

    with open(changes_path, "r", encoding="utf-8") as f:
        changes = json.load(f)

    if not changes:
        print("Empty price changes")
        return

    if not os.path.exists(subs_path):
        print("No subscriptions stored. Users need to subscribe first.")
        print(f"Changes ready: {len(changes)}")
        return

    with open(subs_path, "r", encoding="utf-8") as f:
        subs = json.load(f)

    if not subs:
        print("No subscriptions")
        return

    # Group changes into one notification per user
    title = "💸 Cambio de precio"
    body = f"{len(changes)} producto(s) han cambiado de precio"
    if len(changes) == 1:
        c = changes[0]
        title = f"💸 {c['nombre']}"
        body = f"{c['old']}€ → {c['new']}€"

    sent = 0
    failed = 0
    for sub in subs:
        try:
            if send_push(sub, title, body):
                sent += 1
            else:
                failed += 1
        except:
            failed += 1

    print(f"Notifications sent: {sent}, failed: {failed}")

if __name__ == "__main__":
    main()
