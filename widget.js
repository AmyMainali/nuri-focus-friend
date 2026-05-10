// ============================================================
//  NURI - FOCUS FRIEND — widget.js
//  Display only. Never modifies state.
//  All tracking happens in background.js.
// ============================================================

(function () {
  if (document.getElementById("nuri-widget")) return;

  // ── STATE (display copy only) ──────────────────────────
  let state = {
    focusSec:       0,
    distractionSec: 0,
    focusStreak:    0,
    score:          100,
    mood:           "happy",
    needsBreak:     false,
    breakMinutes:   2,
    goalSec:        3600,
    isTracking:     false,
    widgetVisible:  true
  };

  let widgetEl       = null;
  let breakOverlayEl = null;

  // ── MOOD COLORS ────────────────────────────────────────
  const COLORS = {
    happy:   "#4ADE80",
    good:    "#60a5fa",
    neutral: "#fbbf24",
    tired:   "#fb923c",
    sad:     "#f87171"
  };

  const MOOD_BG = {
    happy:   "#e8f8e8",
    good:    "#e8f0ff",
    neutral: "#fffbe8",
    tired:   "#fff3e8",
    sad:     "#ffe8e8"
  };

  // ── FORMAT HELPERS ─────────────────────────────────────

  function fmtTime(sec) {
    sec = Math.floor(sec);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${String(s).padStart(2, "0")}s`;
  }

  function fmtCountdown(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function fmtBreakTime(s) {
    s = Math.max(0, s);
    return `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;
  }

  function imgUrl(name) {
    try { return chrome.runtime.getURL(`images/${name}`); }
    catch(e) { return ""; }
  }

  // ── CREATE WIDGET ──────────────────────────────────────

  function createWidget() {
    if (document.getElementById("nuri-widget")) return;

    widgetEl = document.createElement("div");
    widgetEl.id = "nuri-widget";
    widgetEl.innerHTML = `
      <div id="nuri-inner">
        <div id="nuri-header">
          <span id="nuri-title">NURI</span>
          <div id="nuri-header-right">
            <span id="nuri-score">100%</span>
            <button id="nuri-close-btn" title="Close Nuri">×</button>
          </div>
        </div>
        <div id="nuri-pet-box">
          <img id="nuri-frame1" class="nuri-frame" src="" alt="" />
          <img id="nuri-frame2" class="nuri-frame" src="" alt="" />
          <div id="nuri-mood-tag">HAPPY</div>
        </div>
        <div id="nuri-timer-box">
          <div id="nuri-timer-label">BREAK IN</div>
          <div id="nuri-timer">--:--</div>
        </div>
        <div id="nuri-stats-row">
          <div class="nuri-stat">
            <div class="nuri-sdot" style="background:#4ADE80"></div>
            <div class="nuri-slabel">FOCUS</div>
            <div class="nuri-sval" id="nuri-focus-val">0s</div>
          </div>
          <div class="nuri-sdivider"></div>
          <div class="nuri-stat">
            <div class="nuri-sdot" style="background:#f87171"></div>
            <div class="nuri-slabel">DISTRACT</div>
            <div class="nuri-sval" id="nuri-distract-val">0s</div>
          </div>
        </div>
        <button id="nuri-toggle-btn">START</button>
      </div>
    `;

    document.body.appendChild(widgetEl);
    makeDraggable(widgetEl);
    renderWidget();

    document.getElementById("nuri-close-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      widgetEl.style.display = "none";
      safeSend({ type: "HIDE_WIDGET" });
    });

    document.getElementById("nuri-toggle-btn").addEventListener("click", () => {
      const msg = state.isTracking ? "STOP_TRACKING" : "START_TRACKING";
      state.isTracking = !state.isTracking;
      safeSend({ type: msg });
      renderWidget();
    });
  }

  // ── RENDER ─────────────────────────────────────────────

  function renderWidget() {
    if (!widgetEl) return;

    const mood  = state.mood || "happy";
    const color = COLORS[mood]  || "#4ADE80";
    const bgCol = MOOD_BG[mood] || "#e8f8e8";

    widgetEl.style.display = state.widgetVisible ? "block" : "none";

    const petBox = document.getElementById("nuri-pet-box");
    if (petBox) petBox.style.background = bgCol;

    const f1 = document.getElementById("nuri-frame1");
    const f2 = document.getElementById("nuri-frame2");
    if (f1) { const s = imgUrl(`pet_${mood}_1.png`); if (f1.src !== s) f1.src = s; }
    if (f2) { const s = imgUrl(`pet_${mood}_2.png`); if (f2.src !== s) f2.src = s; }

    const tag = document.getElementById("nuri-mood-tag");
    if (tag) { tag.textContent = mood.toUpperCase(); tag.style.background = color; }

    const scoreEl = document.getElementById("nuri-score");
    if (scoreEl) { scoreEl.textContent = state.score + "%"; scoreEl.style.color = color; }

    const timerEl    = document.getElementById("nuri-timer");
    const timerLabel = document.getElementById("nuri-timer-label");
    if (timerEl && timerLabel) {
      if (!state.isTracking) {
        timerEl.textContent    = "--:--";
        timerLabel.textContent = "PAUSED";
        timerLabel.style.color = "#888";
      } else if (state.needsBreak) {
        timerEl.textContent    = "NOW!";
        timerLabel.textContent = "BREAK";
        timerLabel.style.color = "#f87171";
      } else {
        const remaining = Math.max(0, state.goalSec - state.focusStreak);
        timerEl.textContent    = fmtCountdown(remaining);
        timerLabel.textContent = "BREAK IN";
        timerLabel.style.color = "#888";
      }
    }

    const fv = document.getElementById("nuri-focus-val");
    const dv = document.getElementById("nuri-distract-val");
    if (fv) fv.textContent = fmtTime(state.focusSec);
    if (dv) dv.textContent = fmtTime(state.distractionSec);

    const btn = document.getElementById("nuri-toggle-btn");
    if (btn) {
      btn.textContent      = state.isTracking ? "STOP" : "START";
      btn.style.background = state.isTracking ? "#f87171" : "#4ADE80";
    }

    if (state.isTracking && state.needsBreak && !breakOverlayEl) showBreakOverlay();
    if (!state.needsBreak && breakOverlayEl) {
      breakOverlayEl.remove();
      breakOverlayEl = null;
    }
  }

  // ── BREAK OVERLAY ──────────────────────────────────────

  function showBreakOverlay() {
    if (breakOverlayEl) return;
    let remaining = (state.breakMinutes || 2) * 60;

    breakOverlayEl = document.createElement("div");
    breakOverlayEl.id = "nuri-break-overlay";
    breakOverlayEl.innerHTML = `
      <div id="nuri-break-card">
        <div id="nuri-break-title">BREAK TIME</div>
        <img id="nuri-break-pet" src="${imgUrl("pet_happy_1.png")}" alt="Nuri" />
        <div id="nuri-break-sub">You have been focused for a while.<br>Take a rest — Nuri will wait!</div>
        <div id="nuri-break-timer">${fmtBreakTime(remaining)}</div>
        <button id="nuri-break-skip">SKIP BREAK</button>
      </div>
    `;
    document.body.appendChild(breakOverlayEl);

    let frame = 1;
    const petAnim = setInterval(() => {
      const el = document.getElementById("nuri-break-pet");
      if (!el) { clearInterval(petAnim); return; }
      frame = frame === 1 ? 2 : 1;
      el.src = imgUrl(`pet_happy_${frame}.png`);
    }, 333);

    const tick = setInterval(() => {
      remaining--;
      const el = document.getElementById("nuri-break-timer");
      if (el) el.textContent = fmtBreakTime(remaining);
      if (remaining <= 0) {
        clearInterval(tick); clearInterval(petAnim); finishBreak();
      }
    }, 1000);

    document.getElementById("nuri-break-skip").addEventListener("click", () => {
      clearInterval(tick); clearInterval(petAnim); finishBreak();
    });
  }

  function finishBreak() {
    if (breakOverlayEl) { breakOverlayEl.remove(); breakOverlayEl = null; }
    safeSend({ type: "BREAK_DONE" });
  }

  // ── DRAG ───────────────────────────────────────────────

  function makeDraggable(el) {
    const handle = document.getElementById("nuri-header");
    let startX, startY, startLeft, startTop, dragging = false;

    handle.addEventListener("mousedown", (e) => {
      if (e.target.id === "nuri-close-btn") return;
      dragging  = true;
      startX    = e.clientX;
      startY    = e.clientY;
      const rect = el.getBoundingClientRect();
      startLeft  = rect.left;
      startTop   = rect.top;
      el.style.transition = "none";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      el.style.bottom = "auto";
      el.style.right  = "auto";
      el.style.left   = Math.max(0, startLeft + (e.clientX - startX)) + "px";
      el.style.top    = Math.max(0, startTop  + (e.clientY - startY)) + "px";
    });

    document.addEventListener("mouseup", () => { dragging = false; });
  }

  // ── SAFE SEND ──────────────────────────────────────────

  function safeSend(msg) {
    try { chrome.runtime.sendMessage(msg).catch(() => {}); }
    catch(e) {}
  }

  // ── LISTEN FOR STATE UPDATES ───────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "STATE_UPDATE") {
      state = { ...state, ...msg.state };
      renderWidget();
    }
  });

  // ── INIT ───────────────────────────────────────────────

  function init() {
    try {
      chrome.storage.local.get(
        ["focusSeconds","distractionSeconds","focusStreakSeconds",
         "needsBreak","settings","isTracking","lastUpdated","widgetVisible"],
        (data) => {
          if (chrome.runtime.lastError) { setTimeout(init, 500); return; }
          const settings       = data.settings || {};
          state.focusSec       = data.focusSeconds       || 0;
          state.distractionSec = data.distractionSeconds || 0;
          state.focusStreak    = data.focusStreakSeconds  || 0;
          state.needsBreak     = data.needsBreak         || false;
          state.breakMinutes   = settings.breakMinutes   || 2;
          state.goalSec        = (settings.focusGoalMinutes || 60) * 60;
          state.isTracking     = data.isTracking         || false;
          state.widgetVisible  = data.widgetVisible !== false;
          const total = state.focusSec + state.distractionSec;
          state.score = total === 0 ? 100 : Math.round((state.focusSec / total) * 100);
          state.mood  = scoreToMood(state.score);
          createWidget();
        }
      );
    } catch (e) { setTimeout(init, 500); }
  }

  function scoreToMood(s) {
    if (s >= 80) return "happy";
    if (s >= 60) return "good";
    if (s >= 40) return "neutral";
    if (s >= 20) return "tired";
    return "sad";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();