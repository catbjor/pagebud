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
    const cancelBtn = $("#cancelSelectBtn");
    const delBtn = $("#deleteSelectedBtn");
    const addToShelfBtn = $("#addToShelfBtn");
    const selectAllBtn = $("#selectAllBtn");

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

    function getVisibleCards() {
        // Selects only cards that are not hidden by a filter
        return $$(".book-card", grid).filter(card => {
            return card.style.display !== 'none';
        });
    }

    function updateBar() {
        const n = selected.size;
        countEl.textContent = `${n} selected`;
        delBtn.disabled = n === 0;
        if (addToShelfBtn) addToShelfBtn.disabled = n === 0;
        if ($("#removeFromShelfBtn")) $("#removeFromShelfBtn").disabled = n === 0;
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
    let startX = 0;
    let startY = 0;
    const LP_MS = 450;
    const MOVE_THRESHOLD = 10; // How many pixels you can move before it's considered a drag

    function clearPressTimer() {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        pressedCard = null;
    }

    grid.addEventListener("pointerdown", (e) => {
        const card = getCard(e.target);
        if (!card) return;
        if (active) return; // Don't start a new long-press if already in mode

        pressedCard = card;
        startX = e.clientX;
        startY = e.clientY;

        clearPressTimer();
        pressTimer = setTimeout(() => {
            // long press hit
            enterMode(pressedCard);
            clearPressTimer();
        }, LP_MS);
    }, { passive: true });

    grid.addEventListener("pointermove", (e) => {
        if (!pressTimer) return;
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
            clearPressTimer();
        }
    }, { passive: true });

    ["pointerup", "pointercancel", "pointerleave"].forEach(type => {
        grid.addEventListener(type, clearPressTimer, { passive: true });
    });

    // Desktop-friendly: right-click to enter mode
    grid.addEventListener("contextmenu", (e) => {
        const card = getCard(e.target);
        if (!card) return;
        if (!active) {
            e.preventDefault();
            enterMode(card);
        }
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

        // Not in select mode ⇒ normal handlers (edit/read/fav) i script.js
    });

    // --- Bar actions ---
    cancelBtn.addEventListener("click", exitMode);

    if (selectAllBtn) {
        selectAllBtn.addEventListener("click", () => {
            const visibleCards = getVisibleCards();
            const allVisibleSelected = visibleCards.length > 0 && visibleCards.every(card => selected.has(getId(card)));

            if (allVisibleSelected) {
                // If all are selected, deselect them
                visibleCards.forEach(card => toggleCard(card, false));
            } else {
                // Otherwise, select all visible
                visibleCards.forEach(card => toggleCard(card, true));
            }
        });
    } else {
        console.warn("[multi-select] #selectAllBtn not found.");
    }

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

        let success = 0, fail = 0;

        for (const id of ids) {
            try {
                if (window.PBSync?.deleteBook) {
                    // ✅ riktig: sletter lokalt + i Firestore i riktig rekkefølge
                    await window.PBSync.deleteBook(id);
                } else {
                    // fallback (kan gi “pop-back” hvis lokal sync finnes)
                    await db.collection("users").doc(user.uid).collection("books").doc(id).delete();
                }

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

        updateBar();
        if (selected.size === 0) exitMode();

        if (success) { try { window.toast?.(`${success} deleted`); } catch { } }
        if (fail > 0) alert(`${fail} failed to delete.`);
    });

    // Optional: ESC exits multi-select
    document.addEventListener("keydown", (e) => {
        if (!active) return;
        if (e.key === "Escape") exitMode();
    });

    // Expose state for other scripts to check
    window.PB_MultiSelect = {
        isActive: () => active,
        getSelectedIds: () => Array.from(selected),
        clearSelection: exitMode
    };

})();
