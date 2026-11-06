(() => {
  const panel = document.getElementById("minimap-panel");
  const handle = panel?.querySelector(".minimap-title");
  if (!panel || !handle) return;

  const STORAGE_KEY = "character-world-minimap-position";
  let pointerId = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function clampPosition(left, top) {
    const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
    return {
      left: Math.min(maxLeft, Math.max(8, left)),
      top: Math.min(maxTop, Math.max(8, top)),
      maxLeft,
      maxTop,
    };
  }

  function place(left, top) {
    const position = clampPosition(left, top);
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.transform = "none";
    return position;
  }

  function savePosition() {
    const position = clampPosition(panel.offsetLeft, panel.offsetTop);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        x: position.left / position.maxLeft,
        y: position.top / position.maxTop,
      }));
    } catch {
      // The minimap remains usable when storage is disabled.
    }
  }

  let savedPosition = null;
  try {
    savedPosition = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    savedPosition = null;
  }

  const initialRect = panel.getBoundingClientRect();
  if (savedPosition && Number.isFinite(savedPosition.x) && Number.isFinite(savedPosition.y)) {
    const bounds = clampPosition(8, 8);
    place(savedPosition.x * bounds.maxLeft, savedPosition.y * bounds.maxTop);
  } else {
    place(initialRect.left, initialRect.top);
  }

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || pointerId !== null) return;
    event.preventDefault();
    pointerId = event.pointerId;
    const rect = panel.getBoundingClientRect();
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    panel.classList.add("is-dragging");
    handle.setPointerCapture(pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    place(event.clientX - dragOffsetX, event.clientY - dragOffsetY);
  });

  function finishDrag(event) {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    panel.classList.remove("is-dragging");
    savePosition();
  }

  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);

  window.addEventListener("resize", () => {
    if (pointerId !== null) return;
    const position = clampPosition(panel.offsetLeft, panel.offsetTop);
    place(position.left, position.top);
    savePosition();
  });
})();
