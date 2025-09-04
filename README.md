# Realtime Messenger (HTTPS-ready)

A super-simple real-time chat that supports:
- Direct messages (DMs)
- Group chats (create/join/leave)
- Presence + typing indicators
- HTTPS (via self-signed certs) or HTTP fallback

> Demo uses in-memory state — not for production. No DB, no auth beyond unique usernames.

## Quick start

```bash
# 1) Extract and install deps
npm install

# 2) (Recommended) Generate self-signed certs for local HTTPS
# macOS/Linux:
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/key.pem -out certs/cert.pem -days 365 -subj "/CN=localhost"

# 3) Run
npm start
# Open https://localhost:3000  (or http://localhost:3000 if you skipped certs)
```

## How it works

- **Backend:** Node.js + Express + Socket.IO. If `certs/key.pem` and `certs/cert.pem` exist, the server starts in HTTPS mode.
- **Rooms:**
  - DMs use deterministic rooms: `dm:<userA>:<userB>` (sorted pair).
  - Groups use rooms: `group:<groupName>`.
- **Events:**
  - `login(username)` — reserves a unique online handle.
  - `create_group(name)`, `join_group(name)`, `leave_group(name)`.
  - `send_message({ toType: "dm"|"group", to, text })`.
  - `typing({ toType, to, typing })`.
  - Server emits `message`, `typing`, `presence`, `groups_updated`.

## Notes for the "next revision"
- Add **file & voice notes** via object storage (S3/GCS) signed URLs.
- Add **calls (voice/video)** via WebRTC: use Socket.IO for signaling and STUN/TURN (e.g., coturn).
- Persist users/messages in a DB (e.g., Postgres) with proper auth (JWT) and message history.
- Add message receipts, pagination, search, and moderation.
- Replace in-memory presence with Redis + socket.io-redis adapter for horizontal scaling.

## Folder structure

```
realtime-messenger/
├── certs/                # place key.pem, cert.pem here (self-signed for local)
├── public/
│   ├── index.html
│   └── client.js
├── server.js
└── package.json
```
