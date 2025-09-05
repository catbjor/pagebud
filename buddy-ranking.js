// buddy-ranking.js
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const db = () => window.fb?.db;

    let groupId = null;
    let me = null;
    let sortableInstance = null;

    function getGroupId() {
        return new URLSearchParams(window.location.search).get("group");
    }

    function renderList(characters) {
        const listEl = $("#rankingList");
        if (!listEl) return;

        listEl.innerHTML = characters.map(charName =>
            `<li class="ranking-item" data-char="${charName}">${charName}</li>`
        ).join('');

        initSortable(listEl);
    }

    function initSortable(listEl) {
        if (sortableInstance) {
            sortableInstance.destroy();
        }
        sortableInstance = new Sortable(listEl, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: (evt) => {
                const newOrder = Array.from(evt.target.children).map(item => item.dataset.char);
                saveRanking(newOrder);
            }
        });
    }

    async function saveRanking(characterOrder) {
        if (!groupId || !me) return;
        const groupRef = db().collection("buddy_reads").doc(groupId);
        try {
            const fieldPath = `characterRankings.${me.uid}`;
            await groupRef.update({
                [fieldPath]: characterOrder
            });
            // You could add a small "Saved ✓" toast here for feedback.
        } catch (error) {
            console.error("Failed to save ranking:", error);
            alert("Could not save your ranking. Please try again.");
        }
    }

    async function boot() {
        groupId = getGroupId();
        if (!groupId) {
            $("#rankingHeader").textContent = "Group not found";
            return;
        }

        window.requireAuth(async (user) => {
            me = user;

            try {
                const groupDoc = await db().collection("buddy_reads").doc(groupId).get();
                if (!groupDoc.exists) {
                    $("#rankingHeader").textContent = "Group not found";
                    return;
                }

                const groupData = groupDoc.data();
                const bookId = groupData.bookId;
                $("#rankingHeader").textContent = `Rank Characters for "${groupData.bookTitle}"`;

                // Get the predefined list of characters for this book
                const allCharacters = window.PB_CONST?.CHARACTERS?.[bookId];
                if (!allCharacters || allCharacters.length === 0) {
                    $("#rankingList").innerHTML = `<p class="muted">No character list available for this book.</p>`;
                    return;
                }

                // Get the user's current ranking, if it exists
                const myRanking = groupData.characterRankings?.[me.uid];

                let charactersToRender;
                if (myRanking && myRanking.length === allCharacters.length) {
                    // If a valid ranking exists, use it
                    charactersToRender = myRanking;
                } else {
                    // Otherwise, use the default list
                    charactersToRender = allCharacters;
                }

                renderList(charactersToRender);

            } catch (error) {
                console.error("Failed to load ranking page:", error);
                $("#rankingHeader").textContent = "Error";
                $("#rankingList").innerHTML = `<p class="muted" style="color:red;">Could not load data.</p>`;
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }

})();