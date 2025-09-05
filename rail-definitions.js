// rail-definitions.js
(function () {
    "use strict";

    const nowYear = new Date().getFullYear();

    // A single source of truth for all curated discovery rails.
    // `type` determines how discover-list.js will fetch the data.
    // `query` is the search term for OpenLibrary/Google Books.
    window.PB_RAILS = {
        // Rails from discover.js
        'new_releases': {
            title: "New Releases",
            tags: ["Popular"],
            type: 'search',
            query: `published:${nowYear - 1}`
        },
        'booktok': {
            title: "Popular on BookTok",
            tags: ["Trending"],
            type: 'search',
            query: `subject:booktok OR "tiktok made me buy it"`
        },
        'epic_fantasy': {
            title: "Epic Fantasy Worlds",
            tags: ["World-building"],
            type: 'search',
            query: `subject:"epic fantasy" OR subject:"high fantasy"`
        },
        'psych_thrillers': {
            title: "Psychological Thrillers",
            tags: ["Mind-Bending"],
            type: 'search',
            query: `subject:"psychological thriller"`
        },
        'romance_reads': {
            title: "Romance Reads",
            tags: ["HEA", "Spice varies"],
            type: 'subject',
            query: 'romance'
        },

        // Rails from discover-list.js (now unified)
        'new_adult': {
            title: "New Adult",
            type: 'search',
            query: `subject:"new adult" OR subject:"college romance"`
        },
        'ya_fav': {
            title: "YA Favorites",
            type: 'subject',
            query: 'young_adult_fiction'
        },
        'dark_romance': {
            title: "Dark Romance",
            type: 'search',
            query: `subject:"dark romance" OR subject:"erotic romance"`
        },
        'retellings': {
            title: "Retellings & Mythology",
            type: 'search',
            query: `subject:retellings OR subject:mythology`
        },
        'dark_acad': {
            title: "Dark Academia",
            type: 'search',
            query: `subject:"dark academia" OR subject:"campus fiction"`
        },
        'thrillers': {
            title: "Thrillers & Mystery",
            type: 'search',
            query: `subject:thriller OR subject:"mystery fiction"`
        },
        'banned': {
            title: "Banned & Challenged",
            type: 'subject',
            query: 'banned_books'
        },
        'nonfic': {
            title: "Non-Fiction",
            type: 'subject',
            query: 'nonfiction'
        },
    };

})();