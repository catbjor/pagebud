// api.js - Centralized wrappers for external book APIs.

// Create a global namespace if it doesn't exist
window.PageBud = window.PageBud || {};

(() => {
    "use strict";

    // =================================================================================
    // UTILS & HELPERS (Copied from discover.js for self-containment)
    // =================================================================================
    const yearOf = (d) => (d && (d.first_publish_year || d.publish_year?.[0] || d.first_publish_date?.slice?.(0, 4))) || "";
    const uniq = (arr) => Array.from(new Set(arr));
    const take = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);

    // =================================================================================
    // EXTERNAL API WRAPPERS (OPENLIBRARY, GOOGLE BOOKS)
    // =================================================================================
    const OL = {
        coverURL(doc) {
            const id = doc.cover_i || doc.cover_edition_key || null;
            if (!id) return "";
            return doc.cover_i
                ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
                : `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-M.jpg`;
        },
        normalize(doc) {
            const subs = (Array.isArray(doc.subject) ? doc.subject : (Array.isArray(doc.subject_key) ? doc.subject_key : []))
                .map(x => String(x).toLowerCase().replace(/_/g, " "));
            return {
                id: undefined,
                title: doc.title || "Untitled",
                author: Array.isArray(doc.author_name) ? doc.author_name[0] : (doc.author_name || "Unknown"),
                year: yearOf(doc) || "",
                cover: OL.coverURL(doc),
                workKey: doc.key || doc.work_key?.[0] || null,
                subjects: take(uniq(subs), 6),
                pages: doc.number_of_pages_median || null,
                editionCount: doc.edition_count || 0
            };
        },
        async search(q, page = 1, limit = 24) {
            const url = new URL("https://openlibrary.org/search.json");
            url.searchParams.set("q", q);
            url.searchParams.set("page", String(page));
            url.searchParams.set("limit", String(limit));
            const r = await fetch(url); if (!r.ok) throw new Error(`OpenLibrary search failed with status ${r.status}`);
            return await r.json();
        },
        async workExtras(workKey) {
            if (!workKey) return {};
            const key = workKey.startsWith("/works/") ? workKey : `/works/${String(workKey).replace(/^\/?works\//, '')}`;
            let description = "", avg = null, count = null, subjects = [];
            try {
                const r = await fetch(`https://openlibrary.org${key}.json`);
                if (r.ok) {
                    const w = await r.json();
                    if (w.description) description = typeof w.description === "string" ? w.description : (w.description.value || "");
                    if (Array.isArray(w.subjects)) subjects = w.subjects.map(s => String(s).toLowerCase());
                }
            } catch (e) { console.warn("Failed to fetch OL work details", e); }
            try {
                const rr = await fetch(`https://openlibrary.org${key}/ratings.json`);
                if (rr.ok) {
                    const j = await rr.json();
                    avg = j?.summary?.average ?? null;
                    count = j?.summary?.count ?? null;
                }
            } catch (e) { console.warn("Failed to fetch OL ratings", e); }
            return { description, avg, count, subjects };
        }
    };

    function getGoogleApiKey() {
        // IMPORTANT: This API key is now public. For security, you should go to your
        // Google Cloud Console, create a NEW key, restrict it to your website's domain,
        // and then delete the old key.
        return "AIzaSyDO4ennyLK1qzHiWox_my5IpDTPX_YZOOs";
    }

    const GBOOKS = {
        normalize(item) {
            const vi = item.volumeInfo || {};
            const img = vi.imageLinks || {};
            return {
                id: item.id,
                title: vi.title || "Untitled",
                author: (vi.authors || ["Unknown"])[0],
                year: (vi.publishedDate || "").slice(0, 4),
                cover: (img.thumbnail || img.smallThumbnail || "").replace("http://", "https://"),
                workKey: `gbooks:${item.id}`,
                subjects: (vi.categories || []).map(c => c.toLowerCase()),
                pages: vi.pageCount || null,
                editionCount: 0
            };
        },
        async search(query, limit = 20) {
            const url = new URL("https://www.googleapis.com/books/v1/volumes");
            url.searchParams.set("q", query);
            url.searchParams.set("maxResults", String(limit));
            url.searchParams.set("key", getGoogleApiKey());
            const r = await fetch(url);
            if (!r.ok) throw new Error(`Google Books search failed with status ${r.status}`);
            const data = await r.json();
            return (data.items || []).map(this.normalize);
        }
    };

    // Expose the API wrappers on the global PageBud object
    window.PageBud.apis = { OL, GBOOKS };
    console.log("PageBud API module loaded.");
})();