const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT_1 = Number(process.env.PORT_1) || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const MAP_SEED = 0x6f646f; // 모든 클라이언트가 같은 랜덤 맵을 봄

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const players = new Map();
const duels = new Map();
let nextId = 1;

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(msg, except) {
  const raw = JSON.stringify(msg);
  for (const p of players.values()) {
    if (p.ws !== except && p.ws.readyState === 1) p.ws.send(raw);
  }
}

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    dir: p.dir,
    sprite: p.sprite,
    pet: p.pet,
    bubble: p.bubble,
    inDuel: Boolean(p.duelId),
  };
}

function dropPlayer(id, reason) {
  const p = players.get(id);
  if (!p) return;
  if (p.duelId) endDuel(p.duelId, null, "상대가 나갔습니다");
  players.delete(id);
  broadcast({ type: "leave", id, reason: reason || "disconnect" });
  console.log(`[leave] ${p.name} (#${id})`);
}

function endDuel(duelId, winnerId, notice) {
  const d = duels.get(duelId);
  if (!d) return;
  duels.delete(duelId);
  if (d.timer) clearTimeout(d.timer);
  for (const pid of d.ids) {
    const pl = players.get(pid);
    if (pl) pl.duelId = null;
  }
  broadcast({
    type: "duel_end",
    duelId,
    winnerId,
    scores: d.scores,
    notice,
    players: d.ids,
  });
}

function safeText(v, max) {
  return String(v || "")
    .replace(/[\u0000-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

function isDataUrl(s, maxLen) {
  return (
    typeof s === "string" &&
    s.length < maxLen &&
    /^data:image\/png;base64,/.test(s)
  );
}

function resolvePublic(urlPath) {
  let rel = decodeURIComponent((urlPath || "/").split("?")[0]);
  if (rel === "/") rel = "/index.html";
  rel = rel.replace(/^\/+/, "");
  const fromPublic = path.resolve(PUBLIC, rel);
  const fromRoot = path.resolve(ROOT, rel);
  const pubRoot = path.resolve(PUBLIC) + path.sep;
  const appRoot = path.resolve(ROOT) + path.sep;
  if (fromPublic.startsWith(pubRoot) && fs.existsSync(fromPublic) && fs.statSync(fromPublic).isFile()) {
    return fromPublic;
  }
  if (
    fromRoot.startsWith(appRoot) &&
    fromRoot.split(path.sep).includes("배경") &&
    fs.existsSync(fromRoot) &&
    fs.statSync(fromRoot).isFile()
  ) {
    return fromRoot;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const file = resolvePublic(req.url);
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" || ext === ".js" ? "no-cache" : "public, max-age=86400",
  });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const id = String(nextId++);
  const player = {
    id,
    ws,
    name: "모험가",
    x: (Math.random() - 0.5) * 400,
    y: (Math.random() - 0.5) * 400,
    dir: 0,
    sprite: null,
    pet: null,
    bubble: null,
    bubbleUntil: 0,
    joined: false,
    lastChat: 0,
    lastBeat: Date.now(),
    duelId: null,
  };
  players.set(id, player);

  send(ws, {
    type: "welcome",
    id,
    seed: MAP_SEED,
    you: publicPlayer(player),
    players: [...players.values()].filter((p) => p.joined && p.id !== id).map(publicPlayer),
  });

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    const p = players.get(id);
    if (!p) return;
    p.lastBeat = Date.now();

    switch (msg.type) {
      case "join": {
        p.name = safeText(msg.name, 12) || "모험가";
        if (isDataUrl(msg.sprite, 80_000)) p.sprite = msg.sprite;
        if (msg.pet && isDataUrl(msg.pet, 80_000)) p.pet = msg.pet;
        p.joined = true;
        const payload = publicPlayer(p);
        send(ws, { type: "joined", you: payload });
        broadcast({ type: "spawn", player: payload }, ws);
        console.log(`[join] ${p.name} (#${id})`);
        break;
      }
      case "move": {
        if (!p.joined || p.duelId) return;
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (Math.abs(x - p.x) > 240 || Math.abs(y - p.y) > 240) return;
        p.x = x;
        p.y = y;
        p.dir = Number(msg.dir) || 0;
        broadcast({ type: "move", id, x: p.x, y: p.y, dir: p.dir }, ws);
        break;
      }
      case "chat": {
        if (!p.joined) return;
        const now = Date.now();
        if (now - p.lastChat < 400) return;
        p.lastChat = now;
        const text = safeText(msg.text, 60);
        if (!text) return;
        p.bubble = text;
        p.bubbleUntil = now + 7000;
        broadcast({ type: "chat", id, name: p.name, text, x: p.x, y: p.y });
        break;
      }
      case "pet": {
        if (!p.joined) return;
        p.pet = isDataUrl(msg.pet, 80_000) ? msg.pet : null;
        broadcast({ type: "pet", id, pet: p.pet });
        break;
      }
      case "duel_request": {
        if (!p.joined || p.duelId) return;
        const target = players.get(String(msg.targetId));
        if (!target || !target.joined || target.id === p.id || target.duelId) return;
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        if (dx * dx + dy * dy > 280 * 280) {
          send(ws, { type: "toast", text: "결투하려면 더 가까이 가세요" });
          return;
        }
        const mode = msg.mode === "quiz" ? "quiz" : "click";
        send(target.ws, {
          type: "duel_offer",
          fromId: p.id,
          fromName: p.name,
          mode,
        });
        send(ws, { type: "toast", text: `${target.name}에게 결투를 신청했습니다` });
        break;
      }
      case "duel_reply": {
        const from = players.get(String(msg.fromId));
        if (!from || !p.joined) return;
        if (!msg.accept) {
          send(from.ws, { type: "toast", text: `${p.name}이(가) 결투를 거절했습니다` });
          return;
        }
        if (from.duelId || p.duelId) {
          send(ws, { type: "toast", text: "이미 결투 중입니다" });
          return;
        }
        const mode = msg.mode === "quiz" ? "quiz" : "click";
        if (mode === "quiz") {
          send(ws, { type: "toast", text: "상식퀴즈는 아직 준비 중입니다" });
          send(from.ws, { type: "toast", text: "상식퀴즈는 아직 준비 중입니다" });
          return;
        }
        const duelId = `${from.id}-${p.id}-${Date.now()}`;
        const duration = 8000;
        const duel = {
          id: duelId,
          ids: [from.id, p.id],
          mode,
          scores: { [from.id]: 0, [p.id]: 0 },
          endsAt: Date.now() + duration,
          timer: null,
        };
        from.duelId = duelId;
        p.duelId = duelId;
        duels.set(duelId, duel);
        duel.timer = setTimeout(() => {
          const d = duels.get(duelId);
          if (!d) return;
          const [a, b] = d.ids;
          let winner = null;
          if (d.scores[a] > d.scores[b]) winner = a;
          else if (d.scores[b] > d.scores[a]) winner = b;
          endDuel(duelId, winner, winner ? null : "무승부!");
        }, duration);
        broadcast({
          type: "duel_start",
          duelId,
          mode,
          players: [from.id, p.id],
          names: { [from.id]: from.name, [p.id]: p.name },
          endsAt: duel.endsAt,
        });
        break;
      }
      case "duel_click": {
        const d = duels.get(p.duelId);
        if (!d || d.mode !== "click") return;
        d.scores[p.id] = (d.scores[p.id] || 0) + 1;
        for (const pid of d.ids) {
          const pl = players.get(pid);
          if (pl) send(pl.ws, { type: "duel_score", duelId: d.id, scores: d.scores });
        }
        break;
      }
      case "ping":
        send(ws, { type: "pong", t: Date.now() });
        break;
      default:
        break;
    }
  });

  ws.on("close", () => dropPlayer(id, "close"));
  ws.on("error", () => dropPlayer(id, "error"));
});

setInterval(() => {
  const now = Date.now();
  for (const p of players.values()) {
    if (p.bubble && now > p.bubbleUntil) p.bubble = null;
    if (now - p.lastBeat > 8000) {
      try {
        p.ws.close();
      } catch {}
      dropPlayer(p.id, "timeout");
    }
  }
}, 1000);
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`모두의 캐릭터 서버가 성공적으로 열렸습니다! (Port: ${PORT})`);
  console.log("Render에 배포된 주소나 http://localhost:" + PORT + " 로 접속하세요.");
});