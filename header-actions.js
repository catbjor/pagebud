// header-actions.js
// Dynamically builds the action buttons in the homepage header for a clean, consistent layout.
(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);

    function initHeaderActions(user) {
        const container = $(".header-actions");
        if (!container) return;

        // Clear any existing buttons to avoid duplicates
        container.innerHTML = '';

        // 1. Goal Badge (provides a linkable container for goal-badge.js)
        const goalBadge = document.createElement('a');
        goalBadge.id = 'goalBadge';
        goalBadge.href = 'stats.html';
        goalBadge.className = 'goal-badge-link';
        goalBadge.title = 'View Stats';
        container.appendChild(goalBadge);

        // 2. Buddy Read Button
        const buddyReadBtn = document.createElement('a');
        buddyReadBtn.id = 'btnBuddyRead';
        buddyReadBtn.href = 'buddy-read.html';
        buddyReadBtn.className = 'btn-header-icon';
        buddyReadBtn.title = 'Buddy Read';
        buddyReadBtn.innerHTML = `<i class="fa fa-user-group"></i>`;
        container.appendChild(buddyReadBtn);

        // 3. Profile Button
        const profileBtn = document.createElement('a');
        profileBtn.id = 'btnProfile';
        // Links to own profile, no UID needed in query
        profileBtn.href = 'profile.html';
        profileBtn.className = 'btn-header-icon';
        profileBtn.title = 'My Profile';
        profileBtn.innerHTML = `<i class="fa fa-user"></i>`;
        container.appendChild(profileBtn);

        // Re-run other scripts that might depend on these buttons
        if (window.wireGlobalFriendsBadgesSplit) {
            window.wireGlobalFriendsBadgesSplit();
        }
    }

    window.requireAuth(initHeaderActions);
})();