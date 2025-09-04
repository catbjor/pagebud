/* =========================================================
 PageBud – rating-controls.js (form-aware version)
 - Generates rating/spice controls that are aware of their form.
 - Reads initial values from and writes selected values to
   hidden inputs (e.g., <input type="hidden" name="rating">).
========================================================= */

(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);

  const STAR_SVG = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
      <path class="outline" d="M12 2.69l2.88 5.84 6.44.94-4.66 4.54 1.1 6.42L12 17.25l-5.76 3.14 1.1-6.42L2.68 9.47l6.44-.94L12 2.69z" stroke-linejoin="round"/>
      <path class="fill full" d="M12 2.69l2.88 5.84 6.44.94-4.66 4.54 1.1 6.42L12 17.25l-5.76 3.14 1.1-6.42L2.68 9.47l6.44-.94L12 2.69z"/>
    </svg>`;

  function ensureHidden(form, name) {
    let el = form.querySelector(`input[name="${name}"]`);
    if (!el) {
      el = document.createElement("input");
      el.type = "hidden";
      el.name = name;
      form.appendChild(el);
    }
    return el;
  }

  function initRatingControl(container, inputName, max, type) {
    if (!container) return;
    const form = container.closest("form");
    if (!form) { console.warn(`Rating control '${inputName}' must be inside a <form>`); return; }

    const hiddenInput = ensureHidden(form, inputName);
    let currentValue = Number(hiddenInput.value || container.dataset.value || 0);

    const updateUI = (value) => {
      const buttons = Array.from(container.children);
      buttons.forEach((btn, i) => {
        btn.classList.toggle(type === 'star' ? 'on' : 'active', (i + 1) <= value);
      });
    };

    const handleClick = (index) => {
      currentValue = (currentValue === index) ? 0 : index; // Toggle off if same is clicked
      hiddenInput.value = currentValue;
      updateUI(currentValue);
    };

    container.innerHTML = "";

    for (let i = 1; i <= max; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `icon-btn ${type}`;
      if (type === 'star' && i === 6) {
        btn.classList.add('sixth'); // Special style for 6th star
      }
      btn.setAttribute("aria-label", `${i} ${type}${i > 1 ? 's' : ''}`);

      if (type === 'star') {
        btn.innerHTML = STAR_SVG;
      } else if (type === 'chili') {
        btn.innerHTML = `
                    <img class="outline" src="icons/chili-outlined.png" alt="">
                    <img class="fill" src="icons/chili-filled.png" alt="">
                `;
      }

      btn.addEventListener("click", () => handleClick(i));
      container.appendChild(btn);
    }

    updateUI(currentValue);
  }

  function boot() {
    const ratingBar = $("#ratingBar");
    const spiceBar = $("#spiceBar");

    if (ratingBar) initRatingControl(ratingBar, "rating", 6, "star");
    if (spiceBar) initRatingControl(spiceBar, "spice", 5, "chili");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
