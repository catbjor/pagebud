// book-card.js – renders a single book card

"use strict";

// Fallback placeholder cover
const phCover =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600">
       <rect width="100%" height="100%" rx="12" fill="#e5e7eb"/>
       <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
             font-size="22" fill="#9aa3af" font-family="system-ui,-apple-system,Segoe UI,Roboto">No cover</text>
     </svg>`
  );

// Utility
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// Star row (1–6)
function starsRow(val) {
  const full = Math.floor(Number(val) || 0);
  const half = (Number(val) - full) >= 0.5;
  let out = "";
  for (let i = 1; i <= 6; i++) {
    if (i <= full) {
      out += `<img src="icons/yellow-star.svg" class="card-icon" alt="★">`;
    } else if (i === full + 1 && half) {
      out += `<img src="icons/yellow-half-star.svg" class="card-icon" alt="½">`;
    } else {
      out += `<img src="icons/star-outline.svg" class="card-icon" alt="☆">`;
    }
  }
  return out;
}

// Chili row (1–5)
function chilisRow(val) {
  const full = Math.floor(Number(val) || 0);
  let out = "";
  for (let i = 1; i <= 5; i++) {
    if (i <= full) {
      out += `<img src="icons/chili-filled.png" class="card-icon" alt="🌶">`;
    } else {
      out += `<img src="icons/chili-outlined.png" class="card-icon" alt="">`;
    }
  }
  return out;
}

// Book card HTML
function cardHTML(doc) {
  const d = doc.data();
  const id = doc.id;

  let cover = d.coverUrl || d.coverDataUrl || phCover;
  // Defensively handle invalid blob URLs that might exist in old data.
  // A blob: URL is only valid in the document it was created in.
  if (typeof cover === 'string' && cover.startsWith('blob:')) {
    cover = phCover;
  }
  const title = d.title || "Untitled";
  const author = d.author || "";

  const rating = Number(d.rating || 0);
  const spice = Number(d.spice || 0);
  // Handle both string (old) and array (new) for status
  // Handle both statuses (array) and status (legacy string) for filtering
  const statusList = (Array.isArray(d.statuses) && d.statuses.length > 0)
    ? d.statuses
    : (d.status ? [d.status] : []);
  const status = statusList.map(s => String(s || '').toLowerCase().trim()).join(' ');
  const favorite = !!d.favorite;
  const format = (d.format || "").toLowerCase();

  const hasFile = !!(
    d.fileUrl || d.pdfUrl || d.epubUrl || d.storagePath || d.filePath || d.hasFile
  );

  const ratingLabel = rating > 0
    ? (Number.isInteger(rating) ? String(rating) : String(Math.round(rating * 10) / 10))
    : "";

  const attrs = `data-id="${id}" data-status="${status}" data-fav="${favorite ? 1 : 0}" data-format="${format}" data-rated="${rating > 0 ? 1 : 0}"`;

  return `
    <article class="book-card" ${attrs}>
      <div class="thumb-wrap">
        <img class="thumb" src="${cover}" alt="Cover for ${escapeHtml(title)}">
        ${rating > 0 ? `
        <span class="rated-badge" title="Rated ${ratingLabel}">
          <img class="star" src="icons/yellow-star.svg" alt="" aria-hidden="true">
          <span class="val">${ratingLabel}</span>
        </span>` : ``}
        <button type="button" class="heart-btn ${favorite ? 'active' : ''}" data-action="fav" data-id="${id}" title="Favorite">
          <i class="fa-${favorite ? 'solid' : 'regular'} fa-heart"></i>
        </button>
      </div>

      <div class="card-body">
        <div class="title">${escapeHtml(title)}</div>
        <div class="author">${escapeHtml(author)}</div>
        ${(rating > 0 || spice > 0) ? `
        <div class="card-ratings">
          ${rating > 0 ? `<div class="card-row" aria-label="rating">${starsRow(rating)}</div>` : ""}
          ${spice > 0 ? `<div class="card-row" aria-label="spice">${chilisRow(spice)}</div>` : ""}
        </div>` : ""}
      </div>

      <div class="actions">
        <button class="btn btn-secondary" data-action="open" data-id="${id}">
          <i class="fa fa-pen"></i> Edit
        </button>
        ${hasFile ? `
        <button class="btn" data-action="read" data-id="${id}">
          <i class="fa fa-book-open"></i> Read
        </button>` : ``}
      </div>
    </article>`;
}

// ✅ Eksporter til globalt scope
window.cardHTML = cardHTML;
