/* rating-controls.js — 6 stars + 5 chilis
   Usage:
   RatingControls.mount({
     ratingEl: document.getElementById('ratingBar'),
     spiceEl: document.getElementById('spiceBar'),
     initialRating: 0,     // 0–6
     initialSpice: 0,      // 0–5
     onChange: ({rating, spice}) => {}
   });
*/
(function () {
  "use strict";

  function svgStar() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" class="star">
      <polygon class="fill" points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"></polygon>
      <polygon class="outline" fill="none" stroke-width="2" points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"></polygon>
    </svg>`;
  }
  function svgChili() {
    return `
    <svg viewBox="0 0 24 24" aria-hidden="true" class="chili">
      <path class="fill" d="M14 3c1.5 0 3 1 3 3 0 2.5-2 4-4 4-2.5 0-6 1.5-7 6-.6 2.6 1.4 5 4 5 5 0 9-6 9-11 0-3-2-7-5-7z"></path>
      <path class="outline" d="M14 3c1.5 0 3 1 3 3 0 2.5-2 4-4 4-2.5 0-6 1.5-7 6-.6 2.6 1.4 5 4 5 5 0 9-6 9-11 0-3-2-7-5-7z"></path>
    </svg>`;
  }

  function buildBar({ count, kind, current, onSet }) {
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= count; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "icon-btn " + (kind === "chili" ? "chili" : "star") + (i === 6 && kind === "star" ? " sixth" : "");
      btn.innerHTML = kind === "chili" ? svgChili() : svgStar();
      btn.setAttribute("aria-label", `${kind} ${i}`);
      btn.dataset.value = String(i);
      btn.addEventListener("click", () => onSet(i));
      frag.appendChild(btn);
    }
    return frag;
  }

  function setActive(container, value, kind) {
    const kids = Array.from(container.querySelectorAll(".icon-btn"));
    kids.forEach((el, idx) => {
      const on = (idx + 1) <= value;
      el.classList.toggle("active", on);
      if (on && kind === "star" && (idx + 1) === 6) {
        el.classList.add("pulse");
        setTimeout(() => el.classList.remove("pulse"), 350);
      }
    });
  }

  window.RatingControls = {
    mount({ ratingEl, spiceEl, initialRating = 0, initialSpice = 0, onChange = () => { } }) {
      let rating = Number(initialRating || 0);
      let spice = Number(initialSpice || 0);

      if (ratingEl) {
        ratingEl.innerHTML = "";
        ratingEl.appendChild(buildBar({
          count: 6, kind: "star", current: rating,
          onSet: (v) => { rating = (rating === v ? 0 : v); setActive(ratingEl, rating, "star"); onChange({ rating, spice }); }
        }));
        setActive(ratingEl, rating, "star");
      }

      if (spiceEl) {
        spiceEl.innerHTML = "";
        spiceEl.appendChild(buildBar({
          count: 5, kind: "chili", current: spice,
          onSet: (v) => { spice = (spice === v ? 0 : v); setActive(spiceEl, spice, "chili"); onChange({ rating, spice }); }
        }));
        setActive(spiceEl, spice, "chili");
      }

      return { get rating() { return rating; }, get spice() { return spice; } };
    }
  };
})();
