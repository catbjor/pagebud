// rail-definitions.js (dev-5)
(function () {
    "use strict";
    var nowYear = (new Date()).getFullYear();

    window.PB_RAILS = {
        // eksisterende
        new_releases: { title: "New Releases", tags: ["Popular"], query: "published:" + (nowYear - 1) },
        booktok: { title: "Popular on BookTok", tags: ["Trending"], query: 'subject:booktok OR "tiktok made me buy it"' },
        epic_fantasy: { title: "Epic Fantasy Worlds", tags: ["World-building"], query: 'subject:"epic fantasy" OR subject:"high fantasy"' },
        psych_thrillers: { title: "Psychological Thrillers", tags: ["Mind-Bending"], query: 'subject:"psychological thriller"' },
        romance_reads: { title: "Romance Reads", tags: ["HEA", "Spice varies"], query: 'subject:romance' },

        // nye ønskede
        dark_romance: { title: "Dark Romance", tags: ["Spicy"], query: 'subject:"dark romance" OR subject:"erotic romance"' },
        banned_forbidden: { title: "Banned & Forbidden", tags: ["Controversial"], query: 'subject:banned_books OR subject:"censorship"' },
        christmas_reads: { title: "Christmas Reads", tags: ["Seasonal"], query: 'subject:christmas OR subject:"holiday fiction"' },
        spooky_season: { title: "Spooky Season", tags: ["Creepy"], query: 'subject:horror OR subject:"ghost stories" OR subject:"gothic fiction"' },
        self_help: { title: "Self Help", tags: ["Growth"], query: 'subject:"self help" OR subject:"personal development"' },
        philosophical_reads: { title: "Philosophical", tags: ["Deep Think"], query: 'subject:philosophy OR subject:"existentialism"' }
    };
})();
