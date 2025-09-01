/* =========================================================
 PageBud – rating-controls.js
 - 6 stjerner (første 5 gule, 6. mørkere)
 - 5 chili
 - Verdier lagres i data-value på container
========================================================= */

(function () {
  "use strict";

  function $$(s, r = document) { return Array.from(r.querySelectorAll(s)); }

  function makeRating(container, max, filledSrcs, emptySrcs, sizePx = 28) {
    if (!container) return;
    container.innerHTML = "";
    container.dataset.value = container.dataset.value || 0;

    for (let i = 1; i <= max; i++) {
      const img = document.createElement("img");
      img.src = emptySrcs[i - 1] || emptySrcs[0];
      img.alt = String(i);
      img.width = sizePx; img.height = sizePx;
      img.style.width = sizePx + "px";
      img.style.height = sizePx + "px";
      img.style.cursor = "pointer";
      img.dataset.idx = i;

      img.addEventListener("mouseenter", () => update(container, i, filledSrcs, emptySrcs));
      img.addEventListener("mouseleave", () => update(container, Number(container.dataset.value || 0), filledSrcs, emptySrcs));
      img.addEventListener("click", () => { container.dataset.value = String(i); update(container, i, filledSrcs, emptySrcs); });

      container.appendChild(img);
    }
    update(container, Number(container.dataset.value || 0), filledSrcs, emptySrcs);
  }

  function update(container, val, filledSrcs, emptySrcs) {
    $$("img", container).forEach((img) => {
      const idx = Number(img.dataset.idx);
      img.src = idx <= val ? (filledSrcs[idx - 1] || filledSrcs[0]) : (emptySrcs[idx - 1] || emptySrcs[0]);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const ratingBar = document.getElementById("ratingBar");
    const spiceBar = document.getElementById("spiceBar");

    // 6 stjerner: 5 gule + 1 mørk
    makeRating(
      ratingBar,
      6,
      [
        "icons/yellow-star.svg",
        "icons/yellow-star.svg",
        "icons/yellow-star.svg",
        "icons/yellow-star.svg",
        "icons/yellow-star.svg",
        "icons/dark-yellow-star.svg"
      ],
      new Array(6).fill("icons/star-outline.svg"),
      28
    );

    // 5 chili
    makeRating(
      spiceBar,
      5,
      new Array(5).fill("icons/chili-filled.png"),
      new Array(5).fill("icons/chili-outlined.png"),
      26
    );
  });
})();
