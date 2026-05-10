// popup.js — Nuri - Focus Friend

const MOODS = {
  happy:   { label: "HAPPY",   msg: "I'm so happy! Keep it up!",     bg: "#e8f8e8", color: "#4ADE80" },
  good:    { label: "GOOD",    msg: "Doing well! Stay focused.",      bg: "#e8f0ff", color: "#60a5fa" },
  neutral: { label: "NEUTRAL", msg: "I'm okay... focus a bit more.", bg: "#fffbe8", color: "#fbbf24" },
  tired:   { label: "TIRED",   msg: "Too many distractions...",      bg: "#fff3e8", color: "#fb923c" },
  sad:     { label: "SAD",     msg: "Please focus for me...",        bg: "#ffe8e8", color: "#f87171" }
};

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

function calcScore(f, d) {
  const t = f + d;
  return t === 0 ? 100 : Math.round((f / t) * 100);
}

function scoreToMood(score) {
  if (score >= 80) return "happy";
  if (score >= 60) return "good";
  if (score >= 40) return "neutral";
  if (score >= 20) return "tired";
  return "sad";
}

// ── PET ANIMATION ──────────────────────────────────────────
let petAnimInterval = null;
let petFrame = 1;

function startPetAnim(moodName) {
  if (petAnimInterval) clearInterval(petAnimInterval);
  petFrame = 1;
  const img = document.getElementById("popup-pet-img");
  if (img) img.src = `images/pet_${moodName}_1.png`;
  petAnimInterval = setInterval(() => {
    petFrame = petFrame === 1 ? 2 : 1;
    const el = document.getElementById("popup-pet-img");
    if (el) el.src = `images/pet_${moodName}_${petFrame}.png`;
  }, 500);
}

// ── RENDER ─────────────────────────────────────────────────
function render() {
  chrome.storage.local.get(
    ["focusSeconds","distractionSeconds","focusStreakSeconds",
     "needsBreak","settings","isTracking"],
    (data) => {
      const focusSec       = data.focusSeconds       || 0;
      const distractionSec = data.distractionSeconds || 0;
      const focusStreak    = data.focusStreakSeconds  || 0;
      const settings       = data.settings           || {};
      const goalSec        = (settings.focusGoalMinutes || 60) * 60;
      const isTracking     = data.isTracking         || false;
      const score          = calcScore(focusSec, distractionSec);
      const moodName       = scoreToMood(score);
      const mood           = MOODS[moodName];
      const remaining      = Math.max(0, goalSec - focusStreak);

      // Score
      const scoreEl = document.getElementById("score-display");
      if (scoreEl) { scoreEl.textContent = score + "%"; scoreEl.style.color = mood.color; }

      // Tracking status
      const dot   = document.getElementById("tracking-dot");
      const label = document.getElementById("tracking-label");
      const btn   = document.getElementById("toggle-btn");
      if (dot)   dot.className     = isTracking ? "tdot tdot-on" : "tdot tdot-off";
      if (label) label.textContent = isTracking ? "TRACKING" : "NOT TRACKING";
      if (btn) {
        btn.textContent = isTracking ? "STOP" : "START";
        btn.className   = isTracking ? "toggle-btn stop" : "toggle-btn start";
      }

      // Pet
      const petBox  = document.getElementById("popup-pet-box");
      const moodNameEl = document.getElementById("popup-mood-name");
      const moodMsg    = document.getElementById("popup-mood-msg");
      if (petBox)      petBox.style.background = mood.bg;
      if (moodNameEl)  { moodNameEl.textContent = mood.label; moodNameEl.style.color = mood.color; }
      if (moodMsg)     moodMsg.textContent = mood.msg;
      startPetAnim(moodName);

      // Stats
      const ft = document.getElementById("focus-time");
      const dt = document.getElementById("distract-time");
      if (ft) ft.textContent = fmtTime(focusSec);
      if (dt) dt.textContent = fmtTime(distractionSec);

      // Break countdown
      const cd = document.getElementById("break-countdown");
      if (cd) {
        if (!isTracking)          cd.textContent = "--:--";
        else if (data.needsBreak) cd.textContent = "BREAK NOW!";
        else                      cd.textContent = fmtCountdown(remaining);
      }

      // Settings inputs — only update if not being typed in
      const fg = document.getElementById("focus-goal-input");
      const bd = document.getElementById("break-dur-input");
      if (fg && document.activeElement !== fg) fg.value = settings.focusGoalMinutes || 60;
      if (bd && document.activeElement !== bd) bd.value = settings.breakMinutes     || 2;
    }
  );
}

// ── LIVE UPDATE every second while popup is open ──────────
const liveInterval = setInterval(render, 1000);
window.addEventListener("unload", () => {
  clearInterval(liveInterval);
  if (petAnimInterval) clearInterval(petAnimInterval);
});

// ── START / STOP ──────────────────────────────────────────
document.getElementById("toggle-btn").addEventListener("click", () => {
  chrome.storage.local.get("isTracking", (data) => {
    const wasTracking = data.isTracking || false;
    chrome.runtime.sendMessage(
      { type: wasTracking ? "STOP_TRACKING" : "START_TRACKING" },
      () => { if (chrome.runtime.lastError) {} render(); }
    );
  });
});

// ── SHOW NURI WIDGET ──────────────────────────────────────
document.getElementById("show-widget-btn").addEventListener("click", () => {
  chrome.storage.local.set({ widgetVisible: true }, () => {
    chrome.runtime.sendMessage({ type: "SHOW_WIDGET" }, () => {
      if (chrome.runtime.lastError) {}
    });
    const btn = document.getElementById("show-widget-btn");
    btn.textContent = "NURI IS BACK!";
    setTimeout(() => { btn.textContent = "SHOW NURI"; }, 1200);
  });
});

// ── SAVE SETTINGS ─────────────────────────────────────────
document.getElementById("save-btn").addEventListener("click", () => {
  const focusGoalMinutes = parseInt(document.getElementById("focus-goal-input").value) || 60;
  const breakMinutes     = parseInt(document.getElementById("break-dur-input").value)  || 2;
  chrome.storage.local.set({ settings: { focusGoalMinutes, breakMinutes } }, () => {
    // Tell background to rebroadcast with new settings
    chrome.runtime.sendMessage({ type: "GET_STATE" }, () => {
      if (chrome.runtime.lastError) {}
    });
    const btn = document.getElementById("save-btn");
    btn.textContent = "SAVED!";
    setTimeout(() => { btn.textContent = "SAVE"; render(); }, 1200);
  });
});

// ── RESET TODAY ───────────────────────────────────────────
document.getElementById("reset-btn").addEventListener("click", () => {
  chrome.storage.local.set({
    focusSeconds:       0,
    distractionSeconds: 0,
    focusStreakSeconds:  0,
    needsBreak:         false,
    lastReset:          Date.now()
  }, render);
});

render();