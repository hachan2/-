(() => {
  const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.matchMedia("(pointer: coarse)").matches);

  if (!isMobileDevice) return;

  document.documentElement.classList.add("mobile-device");

  const chatInput = document.getElementById("chat-input");
  chatInput.placeholder = "채팅창을 눌러 입력";

  const hint = document.querySelector("#side-hud .hint");
  if (hint) hint.textContent = "상대 캐릭터를 터치해 결투 · 채팅창을 터치해 입력";

  const worldCanvas = document.getElementById("world");
  worldCanvas.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    if (!touch) return;

    event.preventDefault();
    worldCanvas.dispatchEvent(new CustomEvent("mobile-player-tap", {
      detail: { clientX: touch.clientX, clientY: touch.clientY }
    }));
  }, { passive: false });
})();
