/* toast.js
   Simple global toast/snackbar utility for PageBud
   Usage:
     toast("Book saved ✓");
     toast("Theme set to Dark", { timeout: 2500 });
*/

(function () {
    "use strict";

    // Ensure root element exists
    function ensureRoot() {
        let n = document.getElementById("pb-toast");
        if (!n) {
            n = document.createElement("div");
            n.id = "pb-toast";
            document.body.appendChild(n);

            // Style (inline so you don't need extra CSS file)
            const style = document.createElement("style");
            style.textContent = `
        #pb-toast {
          position: fixed;
          left: 50%;
          bottom: 24px;
          transform: translateX(-50%) translateY(20px);
          background: rgba(20,20,20,.92);
          color: #fff;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: .95rem;
          z-index: 9999;
          box-shadow: 0 6px 18px rgba(0,0,0,.25);
          opacity: 0;
          pointer-events: none;
          transition: opacity .25s, transform .25s;
        }
        #pb-toast.show {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      `;
            document.head.appendChild(style);
        }
        return n;
    }

    // Main function
    function toast(msg, opts = {}) {
        const el = ensureRoot();
        el.textContent = msg;

        el.classList.add("show");

        const ms = opts.timeout || 1800;
        clearTimeout(el._t);
        el._t = setTimeout(() => {
            el.classList.remove("show");
        }, ms);
    }

    // Expose globally
    window.toast = toast;
})();
