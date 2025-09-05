// toolbar-controls.js
(function () {
    'use strict';

    const btnLight = document.getElementById('btnThemeLight');
    const btnDark = document.getElementById('btnThemeDark');

    if (!btnLight || !btnDark) {
        return; // Buttons not found on this page
    }

    function setAndApplyTheme(theme) {
        localStorage.setItem('pb:theme', theme);
        window.dispatchEvent(new CustomEvent('pb:themeChanged'));
    }

    function updateActiveButton() {
        const currentTheme = document.documentElement.getAttribute('data-theme');

        // Define which themes are "dark" for the toggle's state.
        const darkThemes = ['dark', 'moss', 'navy', 'sunset', 'glow'];
        const isDark = darkThemes.includes(currentTheme);

        btnDark.classList.toggle('active', isDark);
        btnLight.classList.toggle('active', !isDark);
    }

    btnLight.addEventListener('click', () => setAndApplyTheme('light'));
    btnDark.addEventListener('click', () => setAndApplyTheme('dark'));

    // Listen for changes from settings page or system preference
    window.addEventListener('pb:themeChanged', updateActiveButton);

    // Set initial state on load
    updateActiveButton();
})();