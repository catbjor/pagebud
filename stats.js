/* stats.js — PageBud
   Reads users/{uid}/sessions (type:"timer") and renders:
   - Today ring + labels (#todayRing, #todayPct, #todayMinutes, #todayGoal)
   - Month calendar heat (#calendarLabels, #calendarGrid)
   No layout changes to stats.html required.
*/
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);

  // Firestore handles (fb.* first, then compat)
  const DB = () => (window.fb?.db) || (window.firebase?.firestore?.() || null);
  const USER = () => (window.fb?.auth?.currentUser) || (window.firebase?.auth?.().currentUser) || null;

  // Date helpers
  const pad = n => String(n).padStart(2, "0");
  const toDayStr = (d) => {
    const x = (d instanceof Date) ? d : new Date(d);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  };
  const firstOfMonth = (y, m) => new Date(y, m, 1);
  const lastOfMonth = (y, m) => new Date(y, m + 1, 0);

  // State
  let minutesByDay = {}; // { "YYYY-MM-DD": number }
  let sessionsByDay = {}; // { "YYYY-MM-DD": [{...}, {...}] }
  let ym = { y: new Date().getFullYear(), m: new Date().getMonth() };
  let allFinishedBooks = [];
  let readingSpanDays = new Set(); // Holds all dates within a reading span
  let currentRange = 'yearly';

  function calculateReadingSpans(books) {
    const spanDays = new Set();
    books.forEach(book => {
      if (book.started?.toDate && book.finished?.toDate) {
        let currentDate = new Date(book.started.toDate());
        const endDate = new Date(book.finished.toDate());

        // To avoid infinite loops with bad data, limit to 5 years
        let safety = 0;
        while (currentDate <= endDate && safety < 365 * 5) {
          spanDays.add(toDayStr(currentDate));
          currentDate.setDate(currentDate.getDate() + 1);
          safety++;
        }
      }
    });
    readingSpanDays = spanDays;
  }

  /* ---------------- Firestore fetch ---------------- */
  async function fetchTimerMinutes(u) {
    const db = DB(); if (!db) return (minutesByDay = {});
    const ref = db.collection("users").doc(u.uid).collection("sessions");

    // Try: last 365 days by startAt (needs composite index type+startAt if you also filter range)
    const since = new Date(); since.setDate(since.getDate() - 365);
    let snap = null;
    try {
      snap = await ref
        .where("type", "==", "timer")
        .where("startAt", ">=", since)
        .orderBy("startAt", "desc")
        .get();
    } catch {
      // Fallback: no range filter; order by createdAt (safe for small/medium libs)
      try {
        snap = await ref
          .where("type", "==", "timer")
          .orderBy("createdAt", "desc")
          .limit(2000)
          .get();
      } catch {
        snap = null;
      }
    }

    const map = {};
    const sessionMap = {};
    if (snap) {
      snap.forEach(d => {
        const x = d.data() || {};
        const day = x.day || toDayStr(x.startAt?.toDate?.() || x.startAt || Date.now());
        const min = Number(x.minutes || 0);
        map[day] = (map[day] || 0) + min;
        if (!sessionMap[day]) {
          sessionMap[day] = [];
        }
        sessionMap[day].push({ bookId: x.bookId, minutes: min, at: x.at?.toDate() });
      });
    }
    minutesByDay = map;
    sessionsByDay = sessionMap;
  }

  async function fetchFinishedBooks(u) {
    const db = DB(); if (!db) return [];
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);

    try {
      const snap = await db.collection("users").doc(u.uid).collection("books")
        .where("status", "==", "finished")
        .where("finished", ">=", startOfYear)
        .get();

      const books = [];
      snap.forEach(doc => books.push({ id: doc.id, ...doc.data() }));
      return books;
    } catch (error) {
      console.error("Failed to fetch finished books for charts:", error);
      if (error.code === 'failed-precondition') {
        console.warn("A Firestore index is required for the reading trends chart. Check the console for a link to create it.");
      }
      return [];
    }
  }

  /* ---------------- Calendar ---------------- */
  function renderCalendar() {
    const labels = $("#calendarLabels");
    const grid = $("#calendarGrid");
    if (!labels || !grid) return;

    const metric = $('#calendarMetric')?.value || 'sessions';

    // Create a set of dates when books were finished for quick lookup
    const finishedDays = new Set(
      allFinishedBooks
        .filter(b => b.finished?.toDate)
        .map(b => toDayStr(b.finished.toDate()))
    );

    // Weekday labels (Mon..Sun)
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    labels.innerHTML = names.map(n => `<div class="calendar-day-label">${n}</div>`).join("");

    // Current month header
    const monthLabel = $("#currentMonth");
    const yearLabel = $("#currentYear");
    if (monthLabel) monthLabel.textContent = new Date(ym.y, ym.m, 1).toLocaleString(undefined, { month: "long" });
    if (yearLabel) yearLabel.textContent = String(ym.y);

    grid.innerHTML = "";
    const first = firstOfMonth(ym.y, ym.m);
    const last = lastOfMonth(ym.y, ym.m);

    // Start on Monday
    const start = new Date(first);
    const mondayIndex = (first.getDay() + 6) % 7; // 0..6 (Mon..Sun)
    start.setDate(first.getDate() - mondayIndex);

    const end = new Date(last);
    const tail = 6 - ((last.getDay() + 6) % 7);
    end.setDate(last.getDate() + tail);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = toDayStr(d);
      const inMonth = d.getMonth() === ym.m;

      const cell = document.createElement("div");
      cell.className = "calendar-day" + (inMonth ? "" : " other-month");
      cell.dataset.date = ds; // Add date for click handling
      cell.textContent = String(d.getDate());

      if (metric === 'sessions') {
        const mins = Number(minutesByDay[ds] || 0);
        cell.title = `${ds} — ${mins} min`;
        // Heat: tint background intensity by minutes
        if (mins > 0) {
          const max = 60; // 60+ minutes = full tint
          const strength = Math.min(1, mins / max);
          cell.style.background = `color-mix(in oklab, var(--surface) ${Math.max(0, 70 - strength * 40)}%, var(--primary))`;
          cell.style.borderColor = `color-mix(in oklab, var(--border) 60%, var(--primary))`;
          cell.style.color = "var(--text)";
          cell.style.cursor = "pointer";
        }
      } else { // metric === 'books'
        if (readingSpanDays.has(ds)) {
          cell.classList.add('reading-span-day');
          cell.title = `${ds} — Reading day`;
        }
      }

      // Add dot for finished books
      if (finishedDays.has(ds)) {
        const dot = document.createElement('span');
        dot.className = 'finished-book-dot';
        dot.title = 'Finished a book!';
        cell.appendChild(dot);
      }

      grid.appendChild(cell);
    }
  }

  /* ---------------- Totals (quick stats cards) ---------------- */
  function renderQuickTotals(finishedBooks) {
    if (!finishedBooks) {
      finishedBooks = [];
    }

    // Books Read
    const booksRead = finishedBooks.length;
    if ($("#booksRead")) $("#booksRead").textContent = booksRead;

    // Pages Read
    const pagesRead = finishedBooks.reduce((sum, book) => sum + (Number(book.pageCount) || 0), 0);
    if ($("#pagesRead")) $("#pagesRead").textContent = pagesRead.toLocaleString();

    // Average Rating
    const ratedBooks = finishedBooks.filter(b => (b.rating || 0) > 0);
    const avgRating = ratedBooks.length > 0
      ? (ratedBooks.reduce((sum, b) => sum + Number(b.rating), 0) / ratedBooks.length).toFixed(1)
      : "0.0";
    if ($("#avgRating")) $("#avgRating").textContent = avgRating;

    // Average Reading Time
    const booksWithTime = finishedBooks.filter(b => b.started?.toDate && b.finished?.toDate);
    const avgTime = booksWithTime.length > 0
      ? Math.round(booksWithTime.reduce((sum, b) => {
        const duration = b.finished.toDate() - b.started.toDate();
        return sum + (duration / (1000 * 60 * 60 * 24));
      }, 0) / booksWithTime.length)
      : 0;
    if ($("#readingTime")) $("#readingTime").textContent = avgTime;
  }

  /* ---------------- Streak ---------------- */
  async function calculateStreak(u) {
    const db = DB(); if (!db) return 0;
    try {
      const ninety = new Date();
      ninety.setDate(ninety.getDate() - 90);
      const sessionsSnap = await db
        .collection("users")
        .doc(u.uid)
        .collection("sessions")
        .where("at", ">=", ninety)
        .orderBy("at", "desc")
        .get();
      if (sessionsSnap.empty) return 0;

      const readingDays = [...new Set(sessionsSnap.docs.map((d) => d.data().date))].sort().reverse();
      if (!readingDays.length) return 0;

      let streak = 0;
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);

      if (readingDays[0] === toDayStr(today) || readingDays[0] === toDayStr(yesterday)) {
        streak = 1;
        for (let i = 0; i < readingDays.length - 1; i++) {
          const diff = new Date(readingDays[i]).getTime() - new Date(readingDays[i + 1]).getTime();
          if (Math.round(diff / (1000 * 60 * 60 * 24)) === 1) streak++;
          else break;
        }
      }
      return streak;
    } catch (e) {
      console.warn("Streak calc skipped:", e);
      return 0;
    }
  }

  function renderStreak(streak) {
    const streakEl = $("#streakDays");
    if (streakEl) {
      streakEl.textContent = streak;
    }
  }

  // --- Day Detail Modal Logic ---
  async function showDayDetail(dateStr) {
    const modal = $("#dayDetailModal");
    const titleEl = $("#dayDetailTitle");
    const contentEl = $("#dayDetailContent");
    if (!modal || !titleEl || !contentEl) return;

    const date = new Date(dateStr + 'T12:00:00'); // Avoid timezone issues
    titleEl.textContent = `Reading for ${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`;
    contentEl.innerHTML = `<p class="muted">Loading details...</p>`;
    modal.style.display = 'flex';

    const sessions = sessionsByDay[dateStr] || [];
    if (sessions.length === 0) {
      contentEl.innerHTML = `<p class="muted">No reading sessions found for this day.</p>`;
      return;
    }

    // Fetch book details for all sessions in parallel
    const bookIds = [...new Set(sessions.map(s => s.bookId).filter(Boolean))];
    const bookPromises = bookIds.map(id => db().collection("users").doc(USER().uid).collection("books").doc(id).get());
    const bookSnaps = await Promise.all(bookPromises);
    const bookDataMap = new Map(bookSnaps.map(snap => [snap.id, snap.data()]));

    contentEl.innerHTML = sessions.map(session => {
      const book = bookDataMap.get(session.bookId);
      const coverUrl = book?.coverUrl || book?.coverDataUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      const title = book?.title || "An unknown book";

      return `
        <div class="day-detail-item">
          <img src="${coverUrl}" alt="Cover for ${title}">
          <div>
            <div style="font-weight: 700;">${title}</div>
            <div class="muted small">${session.minutes} minutes</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function wireModal() {
    const modal = $("#dayDetailModal");
    const closeBtn = $("#closeDayDetailBtn");

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
    closeBtn?.addEventListener('click', () => modal.style.display = 'none');
  }

  /* ---------------- Top Lists ---------------- */
  function renderTopLists(finishedBooks) {
    const topAuthorsEl = $("#topAuthors");
    if (topAuthorsEl) {
      if (!finishedBooks || finishedBooks.length === 0) {
        topAuthorsEl.innerHTML = `<li class="muted">No books finished this year.</li>`;
      } else {
        const authorCounts = finishedBooks.reduce((acc, book) => {
          if (book.author) {
            acc[book.author] = (acc[book.author] || 0) + 1;
          }
          return acc;
        }, {});

        const sortedAuthors = Object.entries(authorCounts).sort(([, a], [, b]) => b - a).slice(0, 5);

        if (sortedAuthors.length === 0) {
          topAuthorsEl.innerHTML = `<li class="muted">No authors to show.</li>`;
        } else {
          topAuthorsEl.innerHTML = sortedAuthors.map(([author, count]) => `
            <li class="top-item">
                <span class="top-item-name">${author}</span>
                <span class="muted">${count} book${count > 1 ? 's' : ''}</span>
            </li>
          `).join('');
        }
      }
    }

    const topGenresEl = $("#topGenres");
    if (topGenresEl) {
      if (!finishedBooks || finishedBooks.length === 0) {
        topGenresEl.innerHTML = `<li class="muted">No books with genres finished.</li>`;
      } else {
        const genreCounts = finishedBooks.reduce((acc, book) => {
          if (Array.isArray(book.genres)) {
            book.genres.forEach(genre => {
              acc[genre] = (acc[genre] || 0) + 1;
            });
          }
          return acc;
        }, {});

        const sortedGenres = Object.entries(genreCounts).sort(([, a], [, b]) => b - a).slice(0, 5);

        if (sortedGenres.length === 0) {
          topGenresEl.innerHTML = `<li class="muted">No genres to show.</li>`;
        } else {
          topGenresEl.innerHTML = sortedGenres.map(([genre, count]) => `
            <li class="top-item"><span class="top-item-name">${genre}</span><span class="muted">${count} book${count > 1 ? 's' : ''}</span></li>
          `).join('');
        }
      }
    }

    const topBooksEl = $("#topBooks");
    if (topBooksEl) {
      if (!finishedBooks || finishedBooks.length === 0) {
        topBooksEl.innerHTML = `<li class="muted">No rated books finished.</li>`;
      } else {
        const sortedBooks = finishedBooks
          .filter(book => (book.rating || 0) > 0)
          .sort((a, b) => (b.rating || 0) - (a.rating || 0))
          .slice(0, 5);

        if (sortedBooks.length === 0) {
          topBooksEl.innerHTML = `<li class="muted">No rated books to show.</li>`;
        } else {
          topBooksEl.innerHTML = sortedBooks.map(book => {
            const stars = '★'.repeat(Math.round(book.rating || 0)) + '☆'.repeat(5 - Math.round(book.rating || 0));
            return `<li>
                        <a href="edit.html?id=${book.id}" class="top-item">
                            <span class="top-item-name">${book.title || 'Untitled'}</span>
                            <span class="muted" style="color: #f59e0b; font-size: 1.1rem;">${stars}</span>
                        </a>
                    </li>`;
          }).join('');
        }
      }
    }
  }

  /* ---------------- Filtering Logic ---------------- */
  function getFilteredData(range) {
    const now = new Date();
    let startDate = new Date();

    switch (range) {
      case 'daily':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        startDate.setDate(now.getDate() - 6); // Last 7 days including today
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        startDate.setDate(now.getDate() - 29); // Last 30 days including today
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'yearly':
      default:
        startDate.setFullYear(now.getFullYear(), 0, 1); // Start of current year
        startDate.setHours(0, 0, 0, 0);
        break;
    }

    const filteredBooks = allFinishedBooks.filter(book => {
      return book.finished?.toDate() >= startDate;
    });

    const filteredMinutes = {};
    for (const [dateStr, minutes] of Object.entries(minutesByDay)) {
      if (new Date(dateStr + 'T12:00:00') >= startDate) {
        filteredMinutes[dateStr] = minutes;
      }
    }

    return { filteredBooks, filteredMinutes };
  }

  /* ---------------- Charting ---------------- */
  let trendsChart = null;
  let authorsChart = null;
  let moodsChart = null;
  let languagesChart = null;
  let formatsChart = null;

  function renderEmptyChartState(ctx, message) {
    if (!ctx) return;
    const canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'var(--muted)';
    ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }

  function updateCharts(finishedBooks, minutesByDay, range) {
    // Destroy old charts to prevent conflicts
    if (trendsChart) trendsChart.destroy();
    if (authorsChart) authorsChart.destroy();
    if (moodsChart) moodsChart.destroy();
    if (languagesChart) languagesChart.destroy();
    if (formatsChart) formatsChart.destroy();

    // Re-render them with new data
    renderTrendsChart(finishedBooks, minutesByDay, range);
    renderTopAuthorsChart(finishedBooks);
    renderMoodsChart(finishedBooks);
    renderLanguagesChart(finishedBooks);
    renderFormatsChart(finishedBooks);
  }

  function renderMoodsChart(finishedBooks) {
    const ctx = document.getElementById('moodsChart')?.getContext('2d');
    if (!ctx) return;

    const moodCounts = finishedBooks.reduce((acc, book) => {
      if (Array.isArray(book.moods)) {
        book.moods.forEach(mood => {
          acc[mood] = (acc[mood] || 0) + 1;
        });
      }
      return acc;
    }, {});

    const sortedMoods = Object.entries(moodCounts).sort(([, a], [, b]) => b - a).slice(0, 7);
    if (sortedMoods.length === 0) {
      renderEmptyChartState(ctx, "No mood data to show.");
      return;
    }

    const labels = sortedMoods.map(([mood]) => mood);
    const data = sortedMoods.map(([, count]) => count);
    const CHART_COLORS = ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#858796', '#5a5c69'];

    moodsChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{ data: data, backgroundColor: CHART_COLORS, borderWidth: 2, borderColor: 'var(--card)' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 15 } } }
      }
    });
  }

  function renderLanguagesChart(finishedBooks) {
    const ctx = document.getElementById('languagesChart')?.getContext('2d');
    if (!ctx) return;

    const langCounts = finishedBooks.reduce((acc, book) => {
      const lang = book.language || 'Unknown';
      acc[lang] = (acc[lang] || 0) + 1;
      return acc;
    }, {});

    const sortedLangs = Object.entries(langCounts).sort(([, a], [, b]) => b - a).slice(0, 7);
    if (sortedLangs.length === 0) {
      renderEmptyChartState(ctx, "No language data to show.");
      return;
    }

    const labels = sortedLangs.map(([lang]) => lang);
    const data = sortedLangs.map(([, count]) => count);
    const CHART_COLORS = ['#f6c23e', '#e74a3b', '#858796', '#5a5c69', '#4e73df', '#1cc88a', '#36b9cc'];

    languagesChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{ data: data, backgroundColor: CHART_COLORS, borderWidth: 2, borderColor: 'var(--card)' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 15 } } }
      }
    });
  }

  function renderFormatsChart(finishedBooks) {
    const ctx = document.getElementById('formatsChart')?.getContext('2d');
    if (!ctx) return;

    const formatCounts = finishedBooks.reduce((acc, book) => {
      const format = book.format || 'Unknown';
      acc[format] = (acc[format] || 0) + 1;
      return acc;
    }, {});

    const sortedFormats = Object.entries(formatCounts).sort(([, a], [, b]) => b - a);
    if (sortedFormats.length === 0) {
      renderEmptyChartState(ctx, "No format data to show.");
      return;
    }

    const labels = sortedFormats.map(([format]) => format);
    const data = sortedFormats.map(([, count]) => count);
    const CHART_COLORS = ['#1cc88a', '#4e73df', '#f6c23e', '#36b9cc', '#e74a3b', '#858796'];

    formatsChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{ data: data, backgroundColor: CHART_COLORS, borderWidth: 2, borderColor: 'var(--card)' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 15 } } }
      }
    });
  }

  function renderTopAuthorsChart(finishedBooks) {
    const ctx = document.getElementById('topAuthorsChart')?.getContext('2d');
    if (!ctx) return;

    const authorCounts = finishedBooks.reduce((acc, book) => {
      if (book.author) {
        acc[book.author] = (acc[book.author] || 0) + 1;
      }
      return acc;
    }, {});

    const sortedAuthors = Object.entries(authorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .reverse(); // Reverse for horizontal bar chart to show top one at the top

    if (sortedAuthors.length === 0) {
      renderEmptyChartState(ctx, "No author data to show.");
      return;
    }

    const labels = sortedAuthors.map(([author]) => author);
    const data = sortedAuthors.map(([, count]) => count);

    authorsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Books Read',
          data: data,
          backgroundColor: 'rgba(255, 159, 64, 0.8)',
          borderColor: 'rgba(255, 159, 64, 1)',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        indexAxis: 'y', // This makes it a horizontal bar chart
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 1 } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  function renderTrendsChart(finishedBooks, filteredMinutesByDay, range) {
    const ctx = document.getElementById('readingTrendsChart')?.getContext('2d');
    if (!ctx) return;

    const metricSelect = $('#trendMetric');
    const currentMetric = metricSelect ? metricSelect.value : 'books';
    const isBooks = currentMetric === 'books';

    let labels = [];
    let data = [];
    const now = new Date();

    if (range === 'daily') {
      labels = [now.toLocaleDateString(undefined, { weekday: 'short' })];
      const todayStr = toDayStr(now);
      const booksToday = finishedBooks.filter(b => toDayStr(b.finished.toDate()) === todayStr).length;
      const minutesToday = filteredMinutesByDay[todayStr] || 0;
      data = [isBooks ? booksToday : minutesToday];
    } else if (range === 'weekly') {
      labels = Array(7).fill(0).map((_, i) => {
        const d = new Date();
        d.setDate(now.getDate() - (6 - i));
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      });
      const dataMap = new Map();
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dStr = toDayStr(d);
        dataMap.set(dStr, isBooks ? 0 : (filteredMinutesByDay[dStr] || 0));
      }
      if (isBooks) {
        finishedBooks.forEach(b => {
          const dStr = toDayStr(b.finished.toDate());
          if (dataMap.has(dStr)) dataMap.set(dStr, dataMap.get(dStr) + 1);
        });
      }
      data = Array.from(dataMap.values()).reverse();
    } else if (range === 'monthly') {
      labels = Array(30).fill(0).map((_, i) => {
        const d = new Date();
        d.setDate(now.getDate() - (29 - i));
        return d.getDate();
      });
      const dataMap = new Map();
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dStr = toDayStr(d);
        dataMap.set(dStr, isBooks ? 0 : (filteredMinutesByDay[dStr] || 0));
      }
      if (isBooks) {
        finishedBooks.forEach(b => {
          const dStr = toDayStr(b.finished.toDate());
          if (dataMap.has(dStr)) dataMap.set(dStr, dataMap.get(dStr) + 1);
        });
      }
      data = Array.from(dataMap.values()).reverse();
    } else { // yearly
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      data = Array(12).fill(0);
      if (isBooks) {
        finishedBooks.forEach(book => {
          const month = book.finished.toDate().getMonth();
          data[month]++;
        });
      } else {
        for (const [dateStr, minutes] of Object.entries(filteredMinutesByDay)) {
          const month = new Date(dateStr + 'T12:00:00').getMonth();
          data[month] += minutes;
        }
      }
    }

    const chartConfig = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: isBooks ? 'Books Finished' : 'Minutes Read',
          data: data,
          backgroundColor: 'rgba(78, 115, 223, 0.8)', // var(--primary) with alpha
          borderColor: 'rgba(78, 115, 223, 1)',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: isBooks ? 1 : undefined } }
        },
        plugins: { legend: { display: false } }
      }
    };

    trendsChart = new Chart(ctx, chartConfig);
  }

  /* ---------------- Main Update Function ---------------- */
  function updateDashboard(range) {
    currentRange = range;
    const { filteredBooks, filteredMinutes } = getFilteredData(range);

    // Update stat cards
    renderQuickTotals(filteredBooks);

    // Update top lists
    renderTopLists(filteredBooks);

    // Update charts
    updateCharts(filteredBooks, filteredMinutes, range);
  }

  /* ---------------- Boot ---------------- */
  async function boot() {
    const u = USER(); if (!u) return;
    // Run fetches in parallel for speed
    const [_, books, streak] = await Promise.all([
      fetchTimerMinutes(u),
      fetchFinishedBooks(u),
      calculateStreak(u)
    ]);
    allFinishedBooks = books;
    calculateReadingSpans(allFinishedBooks);

    renderCalendar();
    renderStreak(streak);

    // Initial render of dashboard with default 'yearly' filter
    updateDashboard('yearly');
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Month & year nav (uses IDs in your HTML)
    $("#prevMonth")?.addEventListener("click", () => { ym.m--; if (ym.m < 0) { ym.m = 11; ym.y--; } renderCalendar(); });
    $("#nextMonth")?.addEventListener("click", () => { ym.m++; if (ym.m > 11) { ym.m = 0; ym.y++; } renderCalendar(); });
    $("#prevYear")?.addEventListener("click", () => { ym.y--; renderCalendar(); });
    $("#nextYear")?.addEventListener("click", () => { ym.y++; renderCalendar(); });

    // Wire up calendar metric dropdown
    const calendarMetricSelect = $('#calendarMetric');
    calendarMetricSelect?.addEventListener('change', () => {
      renderCalendar();
    });

    // Wire up time range filters
    const filtersContainer = $('.time-filters');
    filtersContainer?.addEventListener('click', (e) => {
      const btn = e.target.closest('.time-filter-btn');
      if (!btn || btn.classList.contains('active')) return;

      filtersContainer.querySelector('.active')?.classList.remove('active');
      btn.classList.add('active');

      updateDashboard(btn.dataset.range);
    });

    // Wire up chart metric dropdown
    const metricSelect = $('#trendMetric');
    metricSelect?.addEventListener('change', () => updateDashboard(currentRange));

    // Wire up calendar day clicks
    $("#calendarGrid")?.addEventListener('click', (e) => {
      const dayEl = e.target.closest('.calendar-day');
      if (dayEl && dayEl.dataset.date && (minutesByDay[dayEl.dataset.date] || 0) > 0) {
        showDayDetail(dayEl.dataset.date);
      }
    });

    // React to timer saves + goal changes + storage updates
    window.addEventListener("pb:sessions:updated", async () => { await boot(); });

    // Auth-ready
    if (typeof requireAuth === "function") {
      requireAuth(() => boot());
    } else {
      const t = setInterval(() => { if (USER() && DB()) { clearInterval(t); boot(); } }, 300);
    }

    // --- Back to Top Button ---
    const backToTopBtn = $('#backToTopBtn');
    if (backToTopBtn) {
      window.addEventListener('scroll', () => {
        if (window.scrollY > 400) { // Show after scrolling down 400px
          backToTopBtn.classList.add('show');
        } else {
          backToTopBtn.classList.remove('show');
        }
      }, { passive: true }); // Use passive listener for better scroll performance

      backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    wireModal();
  });
})();
