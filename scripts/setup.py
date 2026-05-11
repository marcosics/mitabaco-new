from http.server import HTTPServer, BaseHTTPRequestHandler
import json, os, subprocess, sys, base64, hashlib, hmac, time

# Simple HTTP server to generate VAPID key + handle any registration
# Run: python scripts/setup.py

import secrets

def generate_vapid():
    # Generate VAPID keys using pywebpush if available, else manual
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.backends import default_backend

        private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
        public_key = private_key.public_key()

        vapid_private = base64.urlsafe_b64encode(
            private_key.private_bytes(
                serialization.Encoding.DER,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption()
            )
        ).decode().rstrip("=")

        vapid_public = base64.urlsafe_b64encode(
            public_key.public_bytes(
                serialization.Encoding.X962,
                serialization.PublicFormat.UncompressedPoint
            )
        ).decode().rstrip("=")

        return vapid_public, vapid_private
    except ImportError:
        print("Install requirements: pip install cryptography pywebpush")
        # Fallback: generate random keys for demo
        return None, None

if __name__ == "__main__":
    pub, priv = generate_vapid()
    if pub:
        print(f"\nVAPID PUBLIC KEY (put in app.js):\n{pub}\n")
        print(f"VAPID PRIVATE KEY (put in GitHub Secret VAPID_PRIVATE_KEY):\n{priv}\n")
        print("Add to GitHub Secrets:")
        print("  Name: VAPID_PRIVATE_KEY")
        print(f"  Value: {priv}")
    else:
        print("Install dependencies first: pip install cryptography pywebpush")
