// ============================================================
//  NURI - FOCUS FRIEND — background.js
//  Single source of truth for all time tracking.
//  Widget never modifies state — it only displays what we send.
// ============================================================

const DISTRACTION_SITES = [
  "youtube.com", "tiktok.com", "instagram.com",
  "facebook.com", "reddit.com", "x.com", "twitter.com",
  "netflix.com", "twitch.tv"
];

let activeTabId   = null;
let activeStart   = null;
let isDistraction = false;
let isTracking    = false;
let tickTimer     = null;

// ── HELPERS ───────────────────────────────────────────────

function checkIfDistraction(url) {
  if (!url) return false;
  return DISTRACTION_SITES.some(site => url.includes(site));
}

function calcScore(f, d) {
  const t = f + d;
  return t === 0 ? 100 : Math.round((f / t) * 100);
}

function getMoodName(score) {
  if (score >= 80) return "happy";
  if (score >= 60) return "good";
  if (score >= 40) return "neutral";
  if (score >= 20) return "tired";
  return "sad";
}

// ── BADGE ─────────────────────────────────────────────────

function setBadge(score, tracking) {
  if (!tracking) {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#888888" });
    return;
  }
  chrome.action.setBadgeText({ text: score + "%" });
  const color = score >= 60 ? "#4ADE80" : score >= 40 ? "#fbbf24" : "#f87171";
  chrome.action.setBadgeBackgroundColor({ color });
}

// ── BROADCAST STATE TO ALL TABS ────────────────────────────

async function broadcast(overrides) {
  const data = await chrome.storage.local.get([
    "focusSeconds", "distractionSeconds", "focusStreakSeconds",
    "needsBreak", "settings", "isTracking", "lastUpdated",
    "widgetVisible"
  ]);

  const focusSec       = data.focusSeconds       || 0;
  const distractionSec = data.distractionSeconds || 0;
  const focusStreak    = data.focusStreakSeconds  || 0;
  const settings       = data.settings           || {};
  const goalSec        = (settings.focusGoalMinutes || 60) * 60;
  const score          = calcScore(focusSec, distractionSec);

  const state = {
    focusSec,
    distractionSec,
    focusStreak,
    score,
    mood:          getMoodName(score),
    needsBreak:    data.needsBreak    || false,
    breakMinutes:  settings.breakMinutes || 2,
    goalSec,
    isTracking:    data.isTracking    || false,
    lastUpdated:   data.lastUpdated   || null,
    widgetVisible: data.widgetVisible !== false,
    ...overrides
  };

  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: "STATE_UPDATE", state })
    .catch(() => {}); // tab has no widget — that's fine
}
  } catch (e) {}

  return state;
}

// ── CORE TICK: every second while tracking ─────────────────

async function tick() {
  if (!isTracking || !activeStart) return;

  const now     = Date.now();
  const elapsed = (now - activeStart) / 1000;
  activeStart   = now;

  const data = await chrome.storage.local.get([
    "focusSeconds", "distractionSeconds", "focusStreakSeconds",
    "lastReset", "settings"
  ]);

  let focusSec       = data.focusSeconds       || 0;
  let distractionSec = data.distractionSeconds || 0;
  let focusStreak    = data.focusStreakSeconds  || 0;
  let lastReset      = data.lastReset          || now;

  const settings         = data.settings || {};
  const focusGoalMinutes = settings.focusGoalMinutes || 60;

  // Daily midnight reset
  if (new Date(now).toDateString() !== new Date(lastReset).toDateString()) {
    focusSec = 0; distractionSec = 0; focusStreak = 0;
    lastReset = now;
  }

  if (isDistraction) {
    distractionSec += elapsed;
    focusStreak     = 0;
  } else {
    focusSec    += elapsed;
    focusStreak += elapsed;
  }

  const score      = calcScore(focusSec, distractionSec);
  const needsBreak = focusStreak >= (focusGoalMinutes * 60);

  await chrome.storage.local.set({
    focusSeconds:       focusSec,
    distractionSeconds: distractionSec,
    focusStreakSeconds: focusStreak,
    lastReset,
    lastUpdated:        now,
    needsBreak,
    isTracking:         true
  });

  setBadge(score, true);
  await broadcast();
}

// ── START / STOP TICKING ───────────────────────────────────

function startTicking() {
  if (tickTimer) clearInterval(tickTimer);
  activeStart = Date.now();
  tickTimer   = setInterval(tick, 1000);
}

function stopTicking() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  activeStart = null;
}

// ── HANDLE TAB CHANGE ──────────────────────────────────────

async function handleTabChange(tabId) {
  try {
    const tab     = await chrome.tabs.get(tabId);
    activeTabId   = tabId;
    isDistraction = checkIfDistraction(tab.url);
    if (isTracking) activeStart = Date.now();
  } catch (e) {
    activeTabId   = null;
    isDistraction = false;
  }
}

// ── TAB EVENTS ─────────────────────────────────────────────

chrome.tabs.onActivated.addListener(info => {
  handleTabChange(info.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.status === "complete") {
    isDistraction = checkIfDistraction(tab.url);
  }
});

// ── MESSAGES ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {

  if (msg.type === "START_TRACKING") {
    isTracking = true;
    chrome.storage.local.set({ isTracking: true });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        activeTabId   = tabs[0].id;
        isDistraction = checkIfDistraction(tabs[0].url);
      }
      startTicking();
      broadcast();
    });
    return;
  }

  if (msg.type === "STOP_TRACKING") {
    isTracking = false;
    stopTicking();
    chrome.storage.local.set({ isTracking: false });
    setBadge(0, false);
    broadcast();
    return;
  }

  if (msg.type === "BREAK_DONE") {
    chrome.storage.local.set({ focusStreakSeconds: 0, needsBreak: false }, () => broadcast());
    return;
  }

  if (msg.type === "SHOW_WIDGET") {
    chrome.storage.local.set({ widgetVisible: true }, () => broadcast());
    return;
  }

  if (msg.type === "HIDE_WIDGET") {
    chrome.storage.local.set({ widgetVisible: false }, () => broadcast());
    return;
  }

  if (msg.type === "GET_STATE") {
    broadcast();
    return;
  }
});

// ── ALARM: backup in case SW restarts ─────────────────────

chrome.alarms.create("nuriBackupTick", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "nuriBackupTick" && isTracking && !tickTimer) {
    startTicking();
  }
});

// ── RESTORE STATE ON STARTUP ───────────────────────────────

async function restoreState() {
  const data = await chrome.storage.local.get([
    "isTracking", "focusSeconds", "distractionSeconds"
  ]);
  isTracking = data.isTracking || false;

  if (isTracking) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      activeTabId   = tabs[0].id;
      isDistraction = checkIfDistraction(tabs[0].url);
    }
    startTicking();
    const score = calcScore(data.focusSeconds || 0, data.distractionSeconds || 0);
    setBadge(score, true);
  } else {
    setBadge(0, false);
  }
}

chrome.runtime.onStartup.addListener(restoreState);

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get("settings");
  if (!data.settings) {
    await chrome.storage.local.set({
      focusSeconds:       0,
      distractionSeconds: 0,
      focusStreakSeconds:  0,
      needsBreak:         false,
      isTracking:         false,
      widgetVisible:      true,
      settings: { focusGoalMinutes: 60, breakMinutes: 2 }
    });
  }
  setBadge(0, false);
});

restoreState();   