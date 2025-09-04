import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server as SocketIOServer } from "socket.io";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Basic app setup ---
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- HTTPS config (self-signed for local) ---
const CERT_DIR = path.join(__dirname, "certs");
const KEY_PATH = path.join(CERT_DIR, "key.pem");
const CERT_PATH = path.join(CERT_DIR, "cert.pem");

let server;
let usingHttps = false;
if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
  const credentials = {
    key: fs.readFileSync(KEY_PATH),
    cert: fs.readFileSync(CERT_PATH),
  };
  server = https.createServer(credentials, app);
  usingHttps = true;
} else {
  console.warn("[WARN] No certs/certs key.pem or cert.pem found. Falling back to HTTP. Create self-signed certs for HTTPS (see README).");
  server = http.createServer(app);
}

const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
  }
});

// --- In-memory state (for demo only) ---
/** @type {Map<string, string>} username -> socketId */
const users = new Map();
/** @type {Map<string, Set<string>>} groupName -> set(usernames) */
const groups = new Map();

function dmRoom(a, b) {
  const [u1, u2] = [a, b].sort();
  return `dm:${u1}:${u2}`;
}

function userRoom(u) { return `user:${u}`; }
function groupRoom(g) { return `group:${g}`; }

// --- REST helpers ---
app.get("/api/health", (req, res) => {
  res.json({ ok: true, https: usingHttps, users: [...users.keys()], groups: [...groups.keys()] });
});

// --- Socket handlers ---
io.on("connection", (socket) => {
  let username = null;

  socket.on("login", (desiredName, cb) => {
    desiredName = (desiredName || "").trim();
    if (!desiredName) return cb?.({ ok: false, error: "Username required" });
    if (users.has(desiredName)) return cb?.({ ok: false, error: "Username already in use" });

    username = desiredName;
    users.set(username, socket.id);

    // Join personal room for server -> client emits (presence, etc)
    socket.join(userRoom(username));

    // Return roster + groups
    cb?.({ ok: true, me: username, users: [...users.keys()], groups: [...groups.keys()] });

    // Broadcast presence
    io.emit("presence", { type: "join", user: username, users: [...users.keys()] });
  });

  socket.on("create_group", (name, cb) => {
    if (!username) return cb?.({ ok: false, error: "Not logged in" });
    name = (name || "").trim();
    if (!name) return cb?.({ ok: false, error: "Group name required" });
    if (groups.has(name)) return cb?.({ ok: false, error: "Group already exists" });

    groups.set(name, new Set([username]));
    socket.join(groupRoom(name));
    io.emit("groups_updated", [...groups.keys()]);
    cb?.({ ok: true, group: name });
  });

  socket.on("join_group", (name, cb) => {
    if (!username) return cb?.({ ok: false, error: "Not logged in" });
    if (!groups.has(name)) return cb?.({ ok: false, error: "No such group" });
    groups.get(name).add(username);
    socket.join(groupRoom(name));
    cb?.({ ok: true, group: name, members: [...groups.get(name)] });
  });

  socket.on("leave_group", (name, cb) => {
    if (!username) return cb?.({ ok: false, error: "Not logged in" });
    if (!groups.has(name)) return cb?.({ ok: false, error: "No such group" });
    groups.get(name).delete(username);
    socket.leave(groupRoom(name));
    cb?.({ ok: true, group: name, members: [...groups.get(name)] });
  });

  socket.on("send_message", (payload, cb) => {
    if (!username) return cb?.({ ok: false, error: "Not logged in" });
    const { toType, to, text } = payload || {};
    if (!text || !text.trim()) return cb?.({ ok: false, error: "Empty message" });

    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      from: username,
      toType,
      to,
      text: text.trim(),
      ts: Date.now()
    };

    if (toType === "dm") {
      if (!to || !users.has(to)) return cb?.({ ok: false, error: "Recipient offline or unknown" });
      const room = dmRoom(username, to);
      socket.join(room); // ensure joined
      const otherSocketId = users.get(to);
      const otherSocket = io.sockets.sockets.get(otherSocketId);
      otherSocket?.join(room);
      io.to(room).emit("message", msg);
      cb?.({ ok: true, delivered: true, msg });
    } else if (toType === "group") {
      if (!to || !groups.has(to)) return cb?.({ ok: false, error: "No such group" });
      if (!groups.get(to).has(username)) return cb?.({ ok: false, error: "Join the group first" });
      const room = groupRoom(to);
      io.to(room).emit("message", msg);
      cb?.({ ok: true, delivered: true, msg });
    } else {
      cb?.({ ok: false, error: "Invalid toType" });
    }
  });

  socket.on("typing", ({ toType, to, typing }) => {
    if (!username) return;
    const payload = { from: username, toType, to, typing: !!typing };
    if (toType === "dm" && to) {
      const room = dmRoom(username, to);
      io.to(room).emit("typing", payload);
    } else if (toType === "group" && to) {
      const room = groupRoom(to);
      io.to(room).emit("typing", payload);
    }
  });

  socket.on("disconnect", () => {
    if (username) {
      users.delete(username);
      io.emit("presence", { type: "leave", user: username, users: [...users.keys()] });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on ${usingHttps ? "https" : "http"}://localhost:${PORT}`);
});
