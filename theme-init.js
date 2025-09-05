// theme-init.js
(function () {
    'use strict';

    // This script should be placed in the <head> of your HTML files to avoid a flash of unstyled content.

    const THEMES = {
        'default': {
            '--background': '#f6f7fb',
            '--text': '#1c1c1c',
            '--muted': '#5b616a',
            '--card': '#fff',
            '--surface': '#f2f4f7',
            '--border': '#e6e8ee',
            '--hover': '#eef1f6',
            '--primary': '#2f4156',
            '--btn-text': '#fff',
            // B&W toggle overrides
            '--toggle-bg': '#ffffff',
            '--toggle-text': '#1c1c1c',
            '--toggle-bg-active': '#1c1c1c',
            '--toggle-text-active': '#ffffff',
        },
        'light': {
            '--background': '#f6f7fb',
            '--text': '#1c1c1c',
            '--muted': '#5b616a',
            '--card': '#fff',
            '--surface': '#f2f4f7',
            '--border': '#e5e7eb',
            '--hover': '#eef1f6',
            '--primary': '#2f4156',
            '--btn-text': '#fff',
            // B&W toggle overrides
            '--toggle-bg': '#ffffff',
            '--toggle-text': '#1c1c1c',
            '--toggle-bg-active': '#1c1c1c',
            '--toggle-text-active': '#ffffff',
        },
        'dark': {
            '--background': '#0b1220',
            '--text': '#e5e7eb',
            '--muted': '#9ca3af',
            '--card': '#111827',
            '--surface': '#1f2937',
            '--border': '#263244',
            '--hover': '#374151',
            '--primary': '#38bdf8',
            '--btn-text': '#0b1220',
            // B&W toggle overrides
            '--toggle-bg': '#111827',
            '--toggle-text': '#e5e7eb',
            '--toggle-bg-active': '#ffffff',
            '--toggle-text-active': '#111827',
        },
        'porcelain': {
            '--background': '#f7f7fb',
            '--text': '#1c1c1c',
            '--muted': '#5b616a',
            '--card': '#fff',
            '--surface': '#eef1f6',
            '--border': '#cbd5e1',
            '--hover': '#e6e8ee',
            '--primary': '#475569',
            '--btn-text': '#fff'
        },
        'moss': {
            '--background': '#0f172a',
            '--text': '#e5e7eb',
            '--muted': '#9ca3af',
            '--card': '#111827',
            '--surface': '#1e293b',
            '--border': '#223046',
            '--hover': '#334155',
            '--primary': '#34d399',
            '--btn-text': '#0f172a'
        },
        'navy': {
            '--background': '#0b1220',
            '--text': '#e5e7eb',
            '--muted': '#9ca3af',
            '--card': '#111827',
            '--surface': '#1e293b',
            '--border': '#243041',
            '--hover': '#334155',
            '--primary': '#0f766e',
            '--btn-text': '#fff'
        },
        'blush': {
            '--background': '#fff7f9',
            '--text': '#442c35',
            '--muted': '#8c6b76',
            '--card': '#fff',
            '--surface': '#fdeff4',
            '--border': '#f3cfe0',
            '--hover': '#fce8f0',
            '--primary': '#f472b6',
            '--btn-text': '#fff'
        },
        'sunset': {
            '--background': '#0f0f12',
            '--text': '#e5e7eb',
            '--muted': '#9ca3af',
            '--card': '#111113',
            '--surface': '#1c1c1f',
            '--border': '#26262d',
            '--hover': '#2a2a2e',
            '--primary': '#fb7185',
            '--btn-text': '#0f0f12'
        },
        'pastel-dream': {
            '--background': '#e0f7fa',
            '--text': '#263238',
            '--muted': '#546e7a',
            '--card': '#ffffff',
            '--surface': '#cfedf2',
            '--border': '#b2ebf2',
            '--hover': '#b2ebf2',
            '--primary': '#ff8a80',
            '--btn-text': '#fff'
        },
        'espresso-peony': {
            '--background': '#f5e1e9',
            '--text': '#4d2d07',
            '--muted': '#7c5b3d',
            '--card': '#fff',
            '--surface': '#f8eef2',
            '--border': '#e5c9d5',
            '--hover': '#f0e2e8',
            '--primary': '#854d0e',
            '--btn-text': '#fff'
        },
        'glow': {
            '--background': '#0b1220',
            '--text': '#e5e7eb',
            '--muted': '#9ca3af',
            '--card': '#0f172a',
            '--surface': '#1e293b',
            '--border': '#223046',
            '--hover': '#334155',
            '--primary': '#f59e0b',
            '--btn-text': '#0b1220'
        },
        'bakery': {
            '--background': '#fffdfa',
            '--text': '#4a4a4a',
            '--muted': '#7a7a7a',
            '--card': '#fff',
            '--surface': '#fef6f2',
            '--border': '#f0dce3',
            '--hover': '#faede7',
            '--primary': '#bde0fe',
            '--btn-text': '#2f4156'
        }
    };

    function applyTheme(themeId) {
        const root = document.documentElement;
        const theme = THEMES[themeId] || THEMES['default'];

        Object.keys(theme).forEach(key => {
            root.style.setProperty(key, theme[key]);
        });

        root.setAttribute('data-theme', themeId);
    }

    function setInitialTheme() {
        try {
            const storedTheme = localStorage.getItem('pb:theme');

            if (storedTheme === 'system') {
                const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                applyTheme(systemPrefersDark ? 'dark' : 'default');
            } else if (storedTheme && THEMES[storedTheme]) {
                applyTheme(storedTheme);
            } else {
                applyTheme('default');
            }
        } catch (e) {
            console.error("Failed to apply theme", e);
            applyTheme('default');
        }
    }

    // Listen for changes from the settings page
    window.addEventListener('pb:themeChanged', setInitialTheme);

    // Listen for system theme changes and apply if 'system' is selected
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (localStorage.getItem('pb:theme') === 'system') {
            setInitialTheme();
        }
    });

    // Apply theme on initial load
    setInitialTheme();

})();