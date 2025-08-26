// === Service Worker Registration + Update Banner ===
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    // Detect new worker
    reg.addEventListener("updatefound", () => {
      const newWorker = reg.installing;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          showUpdateBanner(newWorker);
        }
      });
    });
  });

  // Reload page when the new SW activates
  let refreshing;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    window.location.reload();
    refreshing = true;
  });
}

function showUpdateBanner(newWorker) {
  const banner = document.createElement("div");
  banner.innerText = "✨ New version available – tap to update";
  Object.assign(banner.style, {
    position: "fixed",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#333",
    color: "#fff",
    padding: "12px 20px",
    borderRadius: "10px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    cursor: "pointer",
    zIndex: "9999",
    fontFamily: "sans-serif",
    fontSize: "14px"
  });
  document.body.appendChild(banner);

  banner.addEventListener("click", () => {
    newWorker.postMessage({ action: "skipWaiting" });
  });
}
