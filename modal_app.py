"""
DigiCitoyen chatbot — Modal deployment
========================================
Dev (live reload):  modal serve modal_app.py
Deploy:             modal deploy modal_app.py

First-time setup:
  1. pip install modal
  2. modal setup               # opens browser to authenticate
  3. Create the secret once:
       modal secret create chatbot-secrets \\
         ANTHROPIC_API_KEY="sk-ant-..." \\
         GOOGLE_CLIENT_ID="..." \\
         GOOGLE_CLIENT_SECRET="..." \\
         GOOGLE_REDIRECT_URI="https://<app>.modal.run/auth/google/callback" \\
         GOOGLE_REFRESH_TOKEN="..." \\
         CALENDAR_ID_MAIN="you@gmail.com" \\
         CALENDAR_ID_SECONDARY="you2@gmail.com" \\
         SMTP_HOST="smtp.gmail.com" \\
         SMTP_PORT="587" \\
         SMTP_USER="you@gmail.com" \\
         SMTP_PASS="xxxx-xxxx-xxxx-xxxx" \\
         MANAGER_EMAIL="manager@digicitoyen.be" \\
         FRONTEND_ORIGIN="https://build-ai.be" \\
         TOKEN_TTL_MINUTES="1440"

After deploy, update GOOGLE_REDIRECT_URI in the secret with the real Modal URL.
"""

import modal
import os
import subprocess

app = modal.App("chatbot-digicitoyen")

# Persistent volume — SQLite DB survives container restarts and redeploys
data_volume = modal.Volume.from_name("chatbot-data", create_if_missing=True)

# Container image: Node 20 LTS + project files + production deps
# .dockerignore excludes: node_modules, .env, data/, .git, .claude
image = (
    modal.Image.debian_slim()           # Modal-managed base with Python — required
    .apt_install(                        # Node 20 LTS + build tools for native addons
        "curl", "gnupg", "make", "g++", "tzdata",
    )
    .run_commands(
        # Set timezone (required so TZ=Europe/Brussels works in Node.js)
        "ln -sf /usr/share/zoneinfo/Europe/Brussels /etc/localtime",
        "echo 'Europe/Brussels' > /etc/timezone",
        # Install Node.js 20 LTS via NodeSource
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
    )
    .add_local_dir(
        ".", "/app",
        copy=True,
        ignore=["node_modules", ".env", ".env.*", "data", ".git", ".claude", "*.log"],
    )
    .run_commands(
        "cd /app && npm install --omit=dev",
        "rm -rf /root/.npm",            # trim npm cache from image layer
    )
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("chatbot-secrets")],
    volumes={"/app/data": data_volume},
    min_containers=1,   # keep 1 warm → avoids ~2 s PDF-parse cold-start
    timeout=30,         # per-request timeout (seconds)
    memory=512,         # MB — PDFs + SQLite fit comfortably
)
@modal.concurrent(max_inputs=50)  # Express handles concurrency natively
@modal.web_server(port=3001)
def serve():
    """Starts the Express server inside the Modal container."""
    env = {
        **os.environ,
        "PORT": "3001",
        "DATA_DIR": "/app/data",   # points tokenStore to the persistent volume
        "TZ": "Europe/Brussels",   # fix: Date.getHours()/setHours() use Brussels time
    }
    subprocess.Popen(["node", "/app/server.js"], env=env, cwd="/app")
