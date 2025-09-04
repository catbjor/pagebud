/* ============================================================
   constants.js  — shared lookups for chips across the app
   Exposes window.PB_CONST = { GENRES, MOODS, TROPES }
   ============================================================ */

(function () {
    "use strict";

    // Popular + broad, alphabetical
    const GENRES = [
        "Action & Adventure", "Alternate History", "Anthology", "Apocalyptic", "Art", "Biography", "Bildungsroman",
        "Chick Lit", "Children's Fiction", "Classics", "Comedy", "Contemporary", "Cozy Mystery", "Crime", "Cyberpunk",
        "Dark Academia", "Dark Fantasy", "Dark Romance", "Detective Fiction", "Dystopian", "Economics", "Essays", "Fantasy",
        "Feminist Literature", "Food", "Forensic Thriller", "Gothic", "Graphic Novel", "Historical", "Horror", "Humor", "Inspirational",
        "Instructional/How-to's", "Journalism", "LGBTQ+",
        "Literary", "Magic", "Manga", "Medical", "Memoir", "Military", "Murder Mystery", "Mystery", "Mythology", "New Adult", "Non-fiction",
        "Novella", "Occult", "Paranormal",
        "Philosophy", "Poetry", "Political", "Post-Apocalyptic", "Psychology", "Retelling", "Romance", "Satire", "Science", "Sci-Fi", "Self-help",
        "Short Stories", "Smut", "Steampunk", "Spooky", "Sword & Sorcery", "Thriller", "Time Travel",
        "Travel", "True Crime", "Urban Fantasy", "Vampire Fiction", "War", "Western", "Witchcraft", "YA", "Zombie"
    ];

    // “BookTok-style” moods with emoji, alphabetical-ish by word
    const MOODS = [
        "🥺 Angsty", "🤯 Astonished", "🥊 Badass", "🥶 Bitter", "😌 Blissful", "😎 Brave", "🕯️ Calm", "🌀 Confused", "🧣 Cozy", "🌙 Dreamy", "😭 Devastated", "😳 Embarrassed", "🌟 Empowered", "😏 Excited", "🤓 Focused", "😡 Frustrated", "😱 Frightened", "🤣 Funny", "🌌 Grateful", "💔 Heartbroken", "🥳 Hilarious", "💖 Hopeful", "🧘 Inspired", "😶‍🌫️ Kinda Lost", "💕 Loved", "🌧 Moody", "😔 Nostalgic",
        "😮‍💨 Overwhelmed", "🌀 Obsessed", "🌹 Optimistic", "🫠 Panicked", "Sad", "🌪️ Shocked", "😏 Spicy", "🧠 Thought - provoking", "💫 Whimsical", "🌀 Weird", "😴 Zoned Out",
    ];

    // Tropes (alpha)
    const TROPES = [
        "Accidental Pregnancy", "Age Gap", "Amnesia", "Arranged Marriage", "Assassin Romance", "Bad Boy/Good Girl", "Best Friend's Brother/Sister", "Best Friends to Lovers", "Billionaire Romance", "Blackmail", "Blind Date", "Bodyguard Romance", "Broken Hero", "Celebrities", "Childhood Friends", "Chosen One", "Close Proximity", "College Romance", "Dark Romance", "Deadly Competition", "Disability Representation", "Divorce", "Dragon Riders", "Enemies to Lovers",
        "Evil Twin", "Exes Reunited", "Fake Dating", "Forbidden Love", "Found Family", "Friends to Lovers", "Grumpy x Sunshine", "Guardian / Mentor Romance", "Hacker Romance", "Hate at First Sight", "He Falls First", "Hidden Identity", "Immortals", "Instant Love", "Jealousy Triangle",
        "Love Triangle", "Love-Hate Relationship", "Long-Distance Love", "Mafia Romance", "Memory Loss", "Mistaken Identity", "Miscommunication", "Monster Romance", "Neighbours to Lovers", "No Strings Attached", "Office Romance", "One Bed", "Opposites Attract", "Orphaned Hero", "Outlaws / Bandits", "Paranormal Soulmates", "Pirate Romance", "Playboys", "Pregnancy Secret", "Rebel Royalty", "Rich vs. Poor Romance", "Roommates", "Second Chance",
        "Secret Baby", "Secret Billionaire", "Secret Identity / Double Life", "Single Parent", "Slow Burn", "Small Town", "Strong Female Lead", "Teacher / Student", "Touch Her and You Die", "Time Travel", "Workplace Rivals", "Workplace Romance", "Young Love", "Zero-to-Hero",
    ];

    // Reading Quirks (for profile page)
    const QUIRKS = [
        "Reads the last page first", "Dog-ears pages", "Reads multiple books at once",
        "Only reads at night", "Never cracks the spine", "Listens to audiobooks at 2x speed",
        "Has a dedicated reading nook", "Matches bookmarks to book covers",
        "Cries over fictional characters", "Buys more books than they can read"
    ];

    window.PB_CONST = { GENRES, MOODS, TROPES, QUIRKS };
})();
