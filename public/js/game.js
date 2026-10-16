const TILE_FILES = [
  "backgrounddetailed1.png",
  "backgrounddetailed3.png",
  "backgrounddetailed4.png",
  "backgrounddetailed5.png",
  "backgrounddetailed6.png",
  "backgrounddetailed8.png",
];
const CHUNK = 500;
const SPEED = 180;
const SCALE = 3;

const worldCanvas = document.getElementById("world");
const ctx = worldCanvas.getContext("2d");
const keys = new Set();
const tiles = [];
const others = new Map();
const spriteCache = new Map();

let seed = 1;
let myId = null;
let me = { x: 0, y: 0, dir: 0, name: "모험가", sprite: null, pet: null, bubble: null, bubbleUntil: 0 };
let ws = null;
let lastMoveSend = 0;
let lastTs = performance.now();
let duelTargetId = null;
let pendingOffer = null;
let activeDuel = null;
let petFollow = { x: 0, y: 0 };

const charEditor = new PixelEditor(
  document.getElementById("char-canvas"),
  document.getElementById("char-tools")
);
const petEditor = new PixelEditor(
  document.getElementById("pet-canvas"),
  document.getElementById("pet-tools")
);
const petEditEditor = new PixelEditor(
  document.getElementById("pet-edit-canvas"),
  document.getElementById("pet-edit-tools")
);

function hashTile(cx, cy) {
  let h = seed ^ Math.imul(cx, 374761393) ^ Math.imul(cy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return Math.abs(h) % tiles.length;
}

function loadTiles() {
  return Promise.all(
    TILE_FILES.map(
      (name) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = "/배경/" + encodeURIComponent(name);
        })
    )
  ).then((imgs) => {
    imgs.forEach((img) => {
      if (img) tiles.push(img);
    });
  });
}

function spriteOf(dataUrl) {
  if (!dataUrl) return null;
  if (spriteCache.has(dataUrl)) return spriteCache.get(dataUrl);
  const img = new Image();
  img.src = dataUrl;
  spriteCache.set(dataUrl, img);
  return img;
}

function resize() {
  worldCanvas.width = innerWidth;
  worldCanvas.height = innerHeight;
}

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}`;
}

let allowReconnect = true;

function connect() {
  ws = new WebSocket(wsUrl());
  ws.onopen = () => {
    if (me.sprite) send({ type: "join", name: me.name, sprite: me.sprite, pet: me.pet });
  };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    if (!allowReconnect) return;
    setTimeout(() => {
      if (document.visibilityState !== "hidden") connect();
    }, 800);
  };
}

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function toast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2200);
}

function addChat(html, cls) {
  const log = document.getElementById("chat-log");
  const div = document.createElement("div");
  if (cls) div.className = cls;
  div.textContent = html;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function countOnline() {
  const n = 1 + [...others.values()].filter((p) => p.sprite).length;
  document.getElementById("online").textContent = `접속 ${n}`;
}

function onMessage(msg) {
  switch (msg.type) {
    case "welcome":
      myId = msg.id;
      seed = msg.seed;
      me.x = msg.you.x;
      me.y = msg.you.y;
      petFollow.x = me.x - 28;
      petFollow.y = me.y + 8;
      others.clear();
      msg.players.forEach((p) => others.set(p.id, { ...p, tx: p.x, ty: p.y, bubbleUntil: 0 }));
      countOnline();
      break;
    case "joined":
      me.x = msg.you.x;
      me.y = msg.you.y;
      break;
    case "spawn":
      others.set(msg.player.id, { ...msg.player, tx: msg.player.x, ty: msg.player.y, bubbleUntil: 0 });
      addChat(`${msg.player.name} 님이 들어왔습니다`, "sys");
      countOnline();
      break;
    case "leave":
      {
        const gone = others.get(msg.id);
        others.delete(msg.id);
        if (gone) addChat(`${gone.name} 님이 나갔습니다`, "sys");
        countOnline();
      }
      break;
    case "move":
      {
        const p = others.get(msg.id);
        if (p) {
          p.tx = msg.x;
          p.ty = msg.y;
          p.dir = msg.dir;
        }
      }
      break;
    case "chat":
      addChat(`${msg.name}: ${msg.text}`);
      if (msg.id === myId) {
        me.bubble = msg.text;
        me.bubbleUntil = performance.now() + 7000;
      } else {
        const p = others.get(msg.id);
        if (p) {
          p.bubble = msg.text;
          p.bubbleUntil = performance.now() + 7000;
        }
      }
      break;
    case "pet":
      if (msg.id === myId) me.pet = msg.pet;
      else {
        const p = others.get(msg.id);
        if (p) p.pet = msg.pet;
      }
      break;
    case "toast":
      toast(msg.text);
      break;
    case "duel_offer":
      pendingOffer = msg;
      document.getElementById("duel-offer-text").textContent =
        `${msg.fromName} 님이 ${msg.mode === "quiz" ? "상식퀴즈" : "광클"} 결투를 신청했습니다.`;
      document.getElementById("duel-offer").classList.remove("hidden");
      break;
    case "duel_start":
      activeDuel = msg;
      document.getElementById("duel-pick").classList.add("hidden");
      document.getElementById("duel-offer").classList.add("hidden");
      if (msg.players.includes(myId) && msg.mode === "click") {
        document.getElementById("duel-play").classList.remove("hidden");
        const names = msg.players.map((id) => msg.names[id]).join(" vs ");
        document.getElementById("duel-names").textContent = names;
        renderScores({ [msg.players[0]]: 0, [msg.players[1]]: 0 });
      }
      addChat("결투가 시작되었습니다!", "sys");
      break;
    case "duel_score":
      renderScores(msg.scores);
      break;
    case "duel_end":
      document.getElementById("duel-play").classList.add("hidden");
      activeDuel = null;
      if (msg.notice) toast(msg.notice);
      else if (msg.winnerId === myId) toast("승리!");
      else if (msg.winnerId) toast(msg.winnerId === myId ? "승리!" : "패배...");
      else toast("무승부!");
      addChat("결투가 끝났습니다", "sys");
      break;
  }
}

function renderScores(scores) {
  if (!activeDuel) return;
  const parts = activeDuel.players.map(
    (id) => `${activeDuel.names[id]} ${scores[id] || 0}`
  );
  document.getElementById("duel-scores").textContent = parts.join("  ·  ");
}

function drawWorld(camX, camY) {
  const w = worldCanvas.width;
  const h = worldCanvas.height;
  ctx.fillStyle = "#1a3a1c";
  ctx.fillRect(0, 0, w, h);
  if (!tiles.length) return;
  const x0 = Math.floor(camX / CHUNK) - 1;
  const y0 = Math.floor(camY / CHUNK) - 1;
  const x1 = Math.floor((camX + w) / CHUNK) + 1;
  const y1 = Math.floor((camY + h) / CHUNK) + 1;
  ctx.imageSmoothingEnabled = true;
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const img = tiles[hashTile(cx, cy)];
      ctx.drawImage(img, cx * CHUNK - camX, cy * CHUNK - camY, CHUNK, CHUNK);
    }
  }
}

function wrapText(text, max) {
  const chars = [...text];
  const lines = [];
  let line = "";
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > max && line) {
      lines.push(line);
      line = ch;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function drawBubble(sx, sy, text) {
  ctx.font = "600 13px 'IBM Plex Sans KR', sans-serif";
  const lines = wrapText(text, 140);
  const pad = 8;
  const lineH = 16;
  const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
  const bh = lines.length * lineH + pad * 2;
  const x = Math.round(sx - bw / 2);
  const y = Math.round(sy - 12 - bh);
  ctx.fillStyle = "#fffdf6";
  ctx.strokeStyle = "#1b2418";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, 8);
  else ctx.rect(x, y, bw, bh);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx - 6, y + bh);
  ctx.lineTo(sx, y + bh + 8);
  ctx.lineTo(sx + 6, y + bh);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#1b2418";
  ctx.textAlign = "left";
  lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad + 12 + i * lineH));
}

function drawActor(p, camX, camY, now, isLocal) {
  const x = p.x;
  const sx = x - camX;
  const sy = p.y - camY;
  const sp = spriteOf(p.sprite);
  const size = 32 * SCALE;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(sx, sy + 4, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  if (p.pet) {
    const petImg = spriteOf(p.pet);
    const px = (isLocal ? petFollow.x : x - 26) - camX;
    const py = (isLocal ? petFollow.y : p.y + 10) - camY;
    if (petImg && petImg.complete) ctx.drawImage(petImg, px - 24, py - 24, 48, 48);
  }
  if (sp && sp.complete) ctx.drawImage(sp, sx - size / 2, sy - size, size, size);
  else {
    ctx.fillStyle = "#c68642";
    ctx.fillRect(sx - 16, sy - 40, 32, 40);
  }
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 4;
  ctx.font = "700 14px 'IBM Plex Sans KR', sans-serif";
  ctx.textAlign = "center";
  ctx.strokeText(p.name, sx, sy - size - 8);
  ctx.fillText(p.name, sx, sy - size - 8);
  if (p.bubble && now < (p.bubbleUntil || 0)) drawBubble(sx, sy - size - 14, p.bubble);
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastTs) / 1000);
  lastTs = now;
  const chatting = document.activeElement === document.getElementById("chat-input");
  const inDuel = Boolean(activeDuel && activeDuel.players.includes(myId));

  if (!inDuel && !chatting && me.sprite) {
    let dx = 0;
    let dy = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) dy -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) dy += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) dx -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) dx += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      me.x += dx * SPEED * dt;
      me.y += dy * SPEED * dt;
      me.dir = Math.atan2(dy, dx);
    }
  }

  petFollow.x += (me.x - 28 - petFollow.x) * Math.min(1, dt * 6);
  petFollow.y += (me.y + 10 - petFollow.y) * Math.min(1, dt * 6);

  others.forEach((p) => {
    p.x += ((p.tx ?? p.x) - p.x) * Math.min(1, dt * 12);
    p.y += ((p.ty ?? p.y) - p.y) * Math.min(1, dt * 12);
  });

  if (me.sprite && now - lastMoveSend > 50 && !inDuel) {
    lastMoveSend = now;
    send({ type: "move", x: me.x, y: me.y, dir: me.dir });
  }

  const camX = me.x - worldCanvas.width / 2;
  const camY = me.y - worldCanvas.height / 2;
  drawWorld(camX, camY);

  const list = [...others.values(), { ...me, id: myId, local: true }];
  list.sort((a, b) => a.y - b.y);
  list.forEach((p) => {
    if (!p.sprite && !p.local) return;
    drawActor(p, camX, camY, now, p.local);
  });

  requestAnimationFrame(loop);
}

function hitPlayer(clientX, clientY) {
  const camX = me.x - worldCanvas.width / 2;
  const camY = me.y - worldCanvas.height / 2;
  const wx = clientX + camX;
  const wy = clientY + camY;
  let best = null;
  let bestD = 40;
  others.forEach((p) => {
    const d = Math.hypot(p.x - wx, p.y - 48 - wy);
    const d2 = Math.hypot(p.x - wx, p.y - wy);
    const dist = Math.min(d, d2);
    if (dist < bestD) {
      bestD = dist;
      best = p;
    }
  });
  return best;
}

document.getElementById("enter-btn").addEventListener("click", () => {
  const sprite = charEditor.toDataURL();
  if (!sprite) {
    toast("캐릭터를 그려 주세요");
    return;
  }
  me.name = document.getElementById("name-input").value.trim() || "모험가";
  me.sprite = sprite;
  me.pet = petEditor.toDataURL();
  document.getElementById("gate").classList.add("hidden");
  document.getElementById("hud").classList.remove("hidden");
  send({ type: "join", name: me.name, sprite: me.sprite, pet: me.pet });
});

document.getElementById("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;
  send({ type: "chat", text });
  me.bubble = text;
  me.bubbleUntil = performance.now() + 7000;
  input.value = "";
  input.blur();
});

document.getElementById("pet-btn").addEventListener("click", () => {
  petEditEditor.loadDataURL(me.pet);
  document.getElementById("pet-modal").classList.remove("hidden");
});
document.getElementById("pet-save").addEventListener("click", () => {
  me.pet = petEditEditor.toDataURL();
  send({ type: "pet", pet: me.pet });
  document.getElementById("pet-modal").classList.add("hidden");
});
document.getElementById("pet-remove").addEventListener("click", () => {
  me.pet = null;
  send({ type: "pet", pet: null });
  document.getElementById("pet-modal").classList.add("hidden");
});
document.getElementById("pet-cancel").addEventListener("click", () => {
  document.getElementById("pet-modal").classList.add("hidden");
});

worldCanvas.addEventListener("click", (e) => {
  const p = hitPlayer(e.clientX, e.clientY);
  if (!p) return;
  duelTargetId = p.id;
  document.getElementById("duel-pick-title").textContent = `${p.name} 와 결투`;
  document.getElementById("duel-pick").classList.remove("hidden");
});

document.getElementById("pick-click").addEventListener("click", () => {
  send({ type: "duel_request", targetId: duelTargetId, mode: "click" });
  document.getElementById("duel-pick").classList.add("hidden");
});
document.getElementById("pick-quiz").addEventListener("click", () => {
  toast("상식퀴즈는 곧 추가됩니다");
});
document.getElementById("duel-pick-cancel").addEventListener("click", () => {
  document.getElementById("duel-pick").classList.add("hidden");
});
document.getElementById("duel-accept").addEventListener("click", () => {
  if (!pendingOffer) return;
  send({ type: "duel_reply", fromId: pendingOffer.fromId, accept: true, mode: pendingOffer.mode });
  document.getElementById("duel-offer").classList.add("hidden");
});
document.getElementById("duel-decline").addEventListener("click", () => {
  if (pendingOffer) send({ type: "duel_reply", fromId: pendingOffer.fromId, accept: false });
  document.getElementById("duel-offer").classList.add("hidden");
  pendingOffer = null;
});
document.getElementById("duel-mash").addEventListener("click", () => {
  send({ type: "duel_click" });
});

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "Enter" && document.activeElement !== document.getElementById("chat-input")) {
    if (document.getElementById("hud").classList.contains("hidden")) return;
    document.getElementById("chat-input").focus();
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("resize", resize);

function leaveNow() {
  allowReconnect = false;
  if (ws) {
    try {
      ws.close();
    } catch {}
  }
}
window.addEventListener("pagehide", leaveNow);
window.addEventListener("beforeunload", leaveNow);

setInterval(() => send({ type: "ping" }), 2000);

resize();
connect();
loadTiles().then(() => requestAnimationFrame(loop));
