(() => {
  const socket = io({ transports: ["websocket"] });
  let me = null;
  let currentTarget = null; // { toType, to }
  const usersEl = document.getElementById("users");
  const groupsEl = document.getElementById("groups");
  const messagesEl = document.getElementById("messages");
  const typingEl = document.getElementById("typing");
  const targetEl = document.getElementById("target");
  const textEl = document.getElementById("text");
  const sendBtn = document.getElementById("sendBtn");
  const meInfo = document.getElementById("meInfo");

  const usernameEl = document.getElementById("username");
  const loginBtn = document.getElementById("loginBtn");
  const newGroupNameEl = document.getElementById("newGroupName");
  const createGroupBtn = document.getElementById("createGroupBtn");

  function setTarget(t) {
    currentTarget = t;
    if (!t) {
      targetEl.textContent = "Select a DM or Group";
      textEl.disabled = true; sendBtn.disabled = true;
    } else {
      targetEl.textContent = (t.toType === "dm" ? "DM: " : "Group: ") + t.to;
      textEl.disabled = false; sendBtn.disabled = false;
      textEl.focus();
    }
    typingEl.textContent = "";
    messagesEl.innerHTML = "";
  }

  function renderList(container, items, kind) {
    container.innerHTML = "";
    items.forEach((name) => {
      if (kind === "users" && name === me) return; // skip me in DM list
      const btn = document.createElement("button");
      btn.textContent = name;
      btn.onclick = () => setTarget({ toType: kind === "users" ? "dm" : "group", to: name });
      container.appendChild(btn);
    });
  }

  function addMsg(msg) {
    if (!currentTarget) return;
    // Only display messages relevant to current target
    if (msg.toType !== currentTarget.toType || msg.to !== currentTarget.to && !(msg.toType === "group" && msg.to === currentTarget.to)) {
      if (msg.toType === "dm") {
        const pair = [msg.from, msg.to].sort().join("|");
        const curPair = [me, currentTarget.to].sort().join("|");
        if (pair !== curPair) return;
      } else if (msg.toType === "group") {
        if (msg.to !== currentTarget.to) return;
      }
    }

    const wrap = document.createElement("div");
    wrap.className = "bubble" + (msg.from === me ? " me" : "");
    wrap.innerHTML = `<div class="muted" style="font-size:12px">${msg.from} • ${new Date(msg.ts).toLocaleTimeString()}</div>${escapeHtml(msg.text)}`;
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  }

  loginBtn.onclick = () => {
    const name = (usernameEl.value || "").trim();
    socket.emit("login", name, (res) => {
      if (!res.ok) return alert(res.error || "Login failed");
      me = res.me;
      meInfo.textContent = `Logged in as @${me}`;
      renderList(usersEl, res.users, "users");
      renderList(groupsEl, res.groups, "groups");
    });
  };

  createGroupBtn.onclick = () => {
    const name = (newGroupNameEl.value || "").trim();
    if (!name) return;
    socket.emit("create_group", name, (res) => {
      if (!res.ok) return alert(res.error || "Failed to create group");
      newGroupNameEl.value = "";
    });
  };

  textEl.addEventListener("input", () => {
    if (!currentTarget) return;
    socket.emit("typing", { toType: currentTarget.toType, to: currentTarget.to, typing: textEl.value.length > 0 });
  });

  sendBtn.onclick = () => {
    if (!currentTarget) return alert("Pick a DM or Group first");
    const text = textEl.value;
    socket.emit("send_message", { toType: currentTarget.toType, to: currentTarget.to, text }, (res) => {
      if (!res.ok) return alert(res.error || "Send failed");
      textEl.value = "";
    });
  };

  socket.on("message", addMsg);

  socket.on("typing", (p) => {
    if (!currentTarget) return;
    if (p.toType !== currentTarget.toType) return;
    if (p.toType === "dm") {
      const pair = [p.from, currentTarget.to].sort().join("|");
      const myPair = [currentTarget.to, me].sort().join("|");
      if (pair !== myPair) return;
    } else if (p.toType === "group" && p.to !== currentTarget.to) return;

    if (p.from === me) return; // ignore own typing
    typingEl.textContent = p.typing ? `${p.from} is typing…` : "";
  });

  socket.on("presence", ({ users }) => renderList(usersEl, users, "users"));
  socket.on("groups_updated", (groups) => renderList(groupsEl, groups, "groups"));

})();