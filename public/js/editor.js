const PALETTE = [
  "#000000",
  "#ffffff",
  "#7a4b2a",
  "#c68642",
  "#efd0b1",
  "#3b2a1a",
  "#2f6b3a",
  "#6db36a",
  "#2b5cde",
  "#6ec6ff",
  "#d63b3b",
  "#ff8a3c",
  "#f2d64b",
  "#8b5cf6",
  "#f472b6",
  "#9aa3a7",
];

class PixelEditor {
  constructor(canvas, toolsEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.size = 32;
    this.pixels = new Array(32 * 32).fill(0);
    this.color = PALETTE[2];
    this.tool = "pen";
    this.drawing = false;
    this.buildTools(toolsEl);
    this.bind();
    this.redraw();
  }

  idx(x, y) {
    return y * 32 + x;
  }

  buildTools(el) {
    el.innerHTML = "";
    PALETTE.forEach((hex) => {
      const b = document.createElement("button");
      b.className = "swatch" + (hex === this.color ? " active" : "");
      b.style.background = hex;
      b.title = hex;
      b.addEventListener("click", () => {
        this.color = hex;
        this.tool = "pen";
        el.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active"));
        b.classList.add("active");
      });
      el.appendChild(b);
    });
    const mk = (label, fn) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.addEventListener("click", fn);
      el.appendChild(b);
      return b;
    };
    mk("지우개", () => (this.tool = "erase"));
    mk("채우기", () => (this.tool = "fill"));
    mk("비우기", () => {
      this.pixels.fill(0);
      this.redraw();
    });
  }

  posFromEvent(e) {
    const r = this.canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    const x = Math.floor(((src.clientX - r.left) / r.width) * 32);
    const y = Math.floor(((src.clientY - r.top) / r.height) * 32);
    return { x: Math.max(0, Math.min(31, x)), y: Math.max(0, Math.min(31, y)) };
  }

  paint(x, y) {
    if (this.tool === "fill") {
      this.fill(x, y, this.pixels[this.idx(x, y)], this.color);
    } else {
      this.pixels[this.idx(x, y)] = this.tool === "erase" ? 0 : this.color;
    }
    this.redraw();
  }

  fill(x, y, target, replace) {
    if (target === replace) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx > 31 || cy > 31) continue;
      const i = this.idx(cx, cy);
      if (this.pixels[i] !== target) continue;
      this.pixels[i] = replace;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  bind() {
    const down = (e) => {
      e.preventDefault();
      this.drawing = true;
      const { x, y } = this.posFromEvent(e);
      this.paint(x, y);
    };
    const move = (e) => {
      if (!this.drawing) return;
      e.preventDefault();
      const { x, y } = this.posFromEvent(e);
      if (this.tool !== "fill") this.paint(x, y);
    };
    const up = () => (this.drawing = false);
    this.canvas.addEventListener("mousedown", down);
    this.canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    this.canvas.addEventListener("touchstart", down, { passive: false });
    this.canvas.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
  }

  redraw() {
    this.ctx.clearRect(0, 0, 32, 32);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const c = this.pixels[this.idx(x, y)];
        if (!c) continue;
        this.ctx.fillStyle = c;
        this.ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  isEmpty() {
    return this.pixels.every((p) => !p);
  }

  toDataURL() {
    if (this.isEmpty()) return null;
    return this.canvas.toDataURL("image/png");
  }

  loadDataURL(url) {
    if (!url) {
      this.pixels.fill(0);
      this.redraw();
      return;
    }
    const img = new Image();
    img.onload = () => {
      const tmp = document.createElement("canvas");
      tmp.width = tmp.height = 32;
      const tctx = tmp.getContext("2d");
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(img, 0, 0, 32, 32);
      const data = tctx.getImageData(0, 0, 32, 32).data;
      for (let i = 0; i < 32 * 32; i++) {
        const a = data[i * 4 + 3];
        if (a < 16) this.pixels[i] = 0;
        else {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          this.pixels[i] = `rgb(${r},${g},${b})`;
        }
      }
      this.redraw();
    };
    img.src = url;
  }
}
