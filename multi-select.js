// multi-select.js — long-press multi-select for home library
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    // Firestore / Auth handles (works with fb.* OR compat firebase.*)
    const db = (window.fb && fb.db)
        ? fb.db
        : (window.firebase && firebase.firestore ? firebase.firestore() : null);

    const getUser = () =>
        (window.fb?.auth?.currentUser) ||
        (window.firebase?.auth?.().currentUser) ||
        null;

    // DOM
    const grid = $("#books-grid");
    const bar = $("#multiSelectBar");
    const countEl = $("#selectCount");
    const cancelBtn = $("#btnCancelSelect");
    const delBtn = $("#btnDeleteSelected");

    if (!grid || !bar || !countEl || !cancelBtn || !delBtn) {
        console.warn("[multi-select] Missing required DOM nodes");
        return;
    }

    // State
    let active = false;
    const selected = new Set();

    // --- helpers ---
    const getCard = (el) => el?.closest?.(".book-card");
    const getId = (card) => card?.getAttribute?.("data-id");

    function updateBar() {
        const n = selected.size;
        countEl.textContent = `${n} selected`;
        delBtn.disabled = n === 0;
    }

    function enterMode(firstCard) {
        if (active) return;
        active = true;
        document.body.classList.add("multi-select-mode");
        bar.classList.add("show");
        if (firstCard) toggleCard(firstCard, true);
        updateBar();
    }

    function exitMode() {
        active = false;
        document.body.classList.remove("multi-select-mode");
        bar.classList.remove("show");
        // clear selections
        selected.clear();
        $$(".book-card.selected", grid).forEach(c => c.classList.remove("selected"));
        updateBar();
    }

    function toggleCard(card, forceOn) {
        if (!card) return;
        const id = getId(card);
        if (!id) return;
        const on = typeof forceOn === "boolean" ? forceOn : !selected.has(id);
        if (on) {
            selected.add(id);
            card.classList.add("selected");
        } else {
            selected.delete(id);
            card.classList.remove("selected");
        }
        updateBar();
    }

    // --- Long-press to enter mode ---
    let pressTimer = null;
    let pressedCard = null;
    let pointerMoved = false;
    const LP_MS = 450;

    function clearPressTimer() {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        pressedCard = null;
        pointerMoved = false;
    }

    grid.addEventListener("pointerdown", (e) => {
        const card = getCard(e.target);
        if (!card) return;
        pressedCard = card;
        pointerMoved = false;
        clearPressTimer();
        pressTimer = setTimeout(() => {
            // long press hit
            enterMode(pressedCard);
            clearPressTimer();
        }, LP_MS);
    }, { passive: true });

    grid.addEventListener("pointermove", (e) => {
        if (!pressTimer) return;
        // small move tolerance
        if (e.movementX * e.movementX + e.movementY * e.movementY > 9) {
            pointerMoved = true;
            clearPressTimer();
        }
    }, { passive: true });

    ["pointerup", "pointercancel", "pointerleave"].forEach(type => {
        grid.addEventListener(type, clearPressTimer, { passive: true });
    });

    // --- Click behavior in/out of mode ---
    grid.addEventListener("click", (e) => {
        const card = getCard(e.target);
        if (!card) return;

        if (active) {
            // In multi-select mode: toggle selection instead of opening/editing
            e.preventDefault();
            e.stopPropagation();
            toggleCard(card);
            return;
        }

        // Not in select mode ⇒ let your normal handlers in script.js run:
        // - Edit (data-action="open")
        // - Read (data-action="read")
        // - Favorite, etc.
    });

    // --- Bar actions ---
    cancelBtn.addEventListener("click", exitMode);

    delBtn.addEventListener("click", async () => {
        const user = getUser();
        if (!user || !db) {
            alert("Not signed in.");
            return;
        }
        if (selected.size === 0) return;

        const ids = Array.from(selected);
        const ok = confirm(`Delete ${ids.length} book${ids.length > 1 ? "s" : ""}?`);
        if (!ok) return;

        delBtn.disabled = true;
        cancelBtn.disabled = true;

        const col = db.collection("users").doc(user.uid).collection("books");
        let success = 0, fail = 0;

        for (const id of ids) {
            try {
                await col.doc(id).delete();
                success++;
                // remove card from DOM
                const card = grid.querySelector(`.book-card[data-id="${id}"]`);
                if (card) card.remove();
                selected.delete(id);
            } catch (err) {
                console.warn("Delete failed for", id, err);
                fail++;
            }
        }

        delBtn.disabled = false;
        cancelBtn.disabled = false;

        // Update bar/count or exit if nothing left selected
        updateBar();
        if (selected.size === 0) exitMode();

        // Friendly message (no blocking alert spam)
        if (fail > 0) {
            console.warn(`[multi-select] Deleted ${success}, ${fail} failed.`);
            alert(`Deleted ${success}. ${fail} failed.`);
        }
    });

    // Optional: ESC exits multi-select
    document.addEventListener("keydown", (e) => {
        if (!active) return;
        if (e.key === "Escape") exitMode();
    });

})();
