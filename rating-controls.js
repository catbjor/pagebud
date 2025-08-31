// rating-controls.js
// Exposes window.PB_Rating: { renderStars(container, initial=0, max=6), renderChilis(container, initial=0, max=5) }

window.PB_Rating = (function () {
  // ---------------- STARS (half-click + toggle-off) ----------------
  function renderStars(container, initial = 0, max = 6) {
    if (!container) return;
    container.innerHTML = "";
    container.classList.add("rating-bar");
    container.dataset.value = String(initial);

    for (let i = 1; i <= max; i++) {
      const btn = document.createElement("button");
      btn.type = "button";                           // ← prevent form submit
      btn.className = "icon-btn star";
      if (i === max) btn.classList.add("sixth");     // darker last star via CSS
      btn.dataset.index = String(i);
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <!-- one gradient is enough for all stars -->
            <linearGradient id="pb-half-grad" x1="0" x2="1" y1="0" y2="0">
              <stop offset="50%" stop-color="#f2c200"></stop>
              <stop offset="50%" stop-color="transparent"></stop>
            </linearGradient>
          </defs>
          <path class="outline" d="M12 17.3l-5.4 3.3 1.5-6.2L3 9.8l6.3-.5L12 3.5l2.7 5.8 6.3.5-5.1 4.6 1.5 6.2z"></path>
          <path class="fill full" d="M12 17.3l-5.4 3.3 1.5-6.2L3 9.8l6.3-.5L12 3.5l2.7 5.8 6.3.5-5.1 4.6 1.5 6.2z"></path>
          <path class="fill half" fill="url(#pb-half-grad)" d="M12 17.3l-5.4 3.3 1.5-6.2L3 9.8l6.3-.5L12 3.5l2.7 5.8 6.3.5-5.1 4.6 1.5 6.2z"></path>
        </svg>`;
      container.appendChild(btn);
    }

    function paint(val) {
      const v = Number(val);
      container.dataset.value = String(v);
      container.querySelectorAll(".icon-btn.star").forEach(btn => {
        const i = Number(btn.dataset.index);
        btn.classList.toggle("on", v >= i);
        btn.classList.toggle("half-on", v >= i - 0.5 && v < i);
      });
    }

    container.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".icon-btn.star");
      if (!btn) return;

      const rect = btn.getBoundingClientRect();
      const isHalf = (ev.clientX - rect.left) < rect.width / 2;

      const i = Number(btn.dataset.index);
      const next = isHalf ? i - 0.5 : i;

      const current = Number(container.dataset.value || 0);
      const newVal = (next === current) ? 0 : next;   // toggle off if same
      paint(newVal);

      if (newVal > 0) {                               // pulse only when setting
        btn.classList.remove("pulse");
        void btn.offsetWidth; // restart animation
        btn.classList.add("pulse");
      }
    });

    paint(initial);
  }

  // ---------------- CHILIS (toggle-off) ----------------
  function renderChilis(container, initial = 0, max = 5) {
    if (!container) return;
    container.innerHTML = "";
    container.classList.add("spice-bar");
    container.dataset.value = String(initial);

    for (let i = 1; i <= max; i++) {
      const btn = document.createElement("button");
      btn.type = "button";                             // ← prevent form submit
      btn.className = "icon-btn chili";
      btn.dataset.value = String(i);
      btn.innerHTML = `
        <img src="icons/chili-outlined.png" class="outline" alt="">
        <img src="icons/chili-filled.png" class="fill" alt="">`;
      container.appendChild(btn);
    }

    function paint(val) {
      const v = Number(val);
      container.dataset.value = String(v);
      container.querySelectorAll(".icon-btn.chili").forEach(btn => {
        const i = Number(btn.dataset.value);
        btn.classList.toggle("active", i <= v);
      });
    }

    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".icon-btn.chili");
      if (!btn) return;
      const v = Number(btn.dataset.value);
      const current = Number(container.dataset.value || 0);
      paint(v === current ? 0 : v); // toggle off if same
    });

    paint(initial);
  }

  // Optional auto-init (only if you add data-attrs somewhere)
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-rating-init]").forEach(el => {
      renderStars(el, Number(el.dataset.ratingInit || 0), 6);
    });
    document.querySelectorAll("[data-spice-init]").forEach(el => {
      renderChilis(el, Number(el.dataset.spiceInit || 0), 5);
    });
  });

  return { renderStars, renderChilis };
})();
