class MiniMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.range = 600;
  }

  update(me, others) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = width / (this.range * 2);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#86a66d";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 1;
    for (let i = 45; i < width; i += 45) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(27, 36, 24, 0.35)";
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    const drawPlayer = (player, isMe) => {
      const dx = player.x - me.x;
      const dy = player.y - me.y;
      const x = Math.max(7, Math.min(width - 7, centerX + dx * scale));
      const y = Math.max(7, Math.min(height - 7, centerY + dy * scale));

      ctx.beginPath();
      ctx.arc(x, y, isMe ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isMe ? "#ffd400" : "#e34b3b";
      ctx.fill();
      ctx.strokeStyle = "#1b2418";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = isMe ? "700 10px sans-serif" : "700 9px sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(244, 239, 226, 0.95)";
      ctx.strokeText(player.name || "모험가", x, y - 7);
      ctx.fillStyle = isMe ? "#1b2418" : "#fff";
      ctx.fillText(player.name || "모험가", x, y - 7);
    };

    others.forEach((player) => drawPlayer(player, false));
    drawPlayer(me, true);
  }
}
