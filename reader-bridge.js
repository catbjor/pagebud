// reader-bridge.js — align DOM IDs for reader.css without touching layout
(function () {
    const epub = document.getElementById("epubContainer");
    const pdf = document.getElementById("pdfContainer");
    if (epub && !document.getElementById("epubReader")) epub.id = "epubReader";
    if (pdf && !document.getElementById("pdfReader")) pdf.id = "pdfReader";
})();
