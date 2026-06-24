// ============================================
// SCRIPTUREQUEST V5 — Week Utility
// Single source of truth for all week logic.
//
// CHANGE FROM PREVIOUS VERSION:
// WEEK_EPOCH used to be a fixed constant imported
// from constants.js. It is now read from Firestore
// (config/leaderboard, field weekEpoch) — the SAME
// document the admin panel's Settings page writes to
// when an admin changes the leaderboard reset date.
//
// This keeps the admin panel and the live user-facing
// app perfectly in sync: change it once in the admin
// panel, and every user's week calculation updates too.
//
// HOW THIS WORKS WITHOUT MAKING EVERYTHING ASYNC:
// Firestore reads are always async, but most of this
// file's functions are called synchronously all over
// the app (inside render functions, template strings,
// etc.) and rewriting every call site to be async would
// be a much bigger, riskier change.
//
// So: the epoch is fetched ONCE per page load (cached in
// memory), via ensureWeekEpochLoaded(). Until that fetch
// resolves, every function below falls back to the
// hardcoded DEFAULT_EPOCH constant — so nothing breaks or
// throws during the brief window before the fetch
// completes. Call ensureWeekEpochLoaded() once, early,
// during app init (see integration notes at the bottom of
// this file) — after that, every other function in this
// file can keep being called exactly as before, synchronously.
// ============================================

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { MS_PER_WEEK } from './constants.js';

// Fallback used until the Firestore value loads, and
// permanently if no admin has ever set a custom epoch.
const DEFAULT_EPOCH = new Date('2026-05-04T08:00:00Z');

// In-memory cache. Starts as the default, gets replaced
// once (and only once) by _loadEpochFromFirestore().
let _cachedEpoch     = DEFAULT_EPOCH;
let _hasLoaded       = false;
let _loadingPromise  = null;

// ============================================
// LOAD THE EPOCH FROM FIRESTORE (once, cached)
// ============================================

/**
 * Ensures the Firestore-configured week epoch has been
 * loaded into memory at least once. Safe to call multiple
 * times — only fetches once; subsequent calls return the
 * same already-resolved promise immediately.
 *
 * Call this once, early, during app startup (see
 * integration notes at the bottom of this file). Every
 * other function in this module will then use the loaded
 * value automatically, with no further changes needed at
 * their call sites.
 */
export function ensureWeekEpochLoaded() {
  if (_hasLoaded) return Promise.resolve(_cachedEpoch);
  if (_loadingPromise) return _loadingPromise;

  _loadingPromise = (async () => {
    try {
      const snap = await getDoc(doc(db, 'config', 'leaderboard'));
      if (snap.exists() && snap.data().weekEpoch) {
        const raw = snap.data().weekEpoch;
        _cachedEpoch = raw.toDate ? raw.toDate() : new Date(raw);
      }
      // If the doc doesn't exist yet, _cachedEpoch simply
      // stays as DEFAULT_EPOCH — no admin has set a custom
      // value yet, which is a completely normal, expected state.
    } catch (e) {
      console.warn('[Week] Could not load custom epoch, using default:', e.message);
      // _cachedEpoch remains DEFAULT_EPOCH on any error too.
    } finally {
      _hasLoaded = true;
    }
    return _cachedEpoch;
  })();

  return _loadingPromise;
}

/**
 * Returns the currently cached epoch synchronously.
 * Will be DEFAULT_EPOCH until ensureWeekEpochLoaded()
 * has resolved at least once.
 */
function _getEpoch() {
  return _cachedEpoch;
}

// ============================================
// CENTRAL WEEK CALCULATOR
// All week functions derive from this. UNCHANGED
// in shape from the previous version — only the
// epoch source changed (see _getEpoch() above).
// ============================================

export function getWeekInfo() {
  const epoch     = _getEpoch();
  const now       = new Date();
  const diff      = now - epoch;
  const weekIdx   = Math.floor(diff / MS_PER_WEEK);   // 0-indexed
  const weekNum   = weekIdx + 1;                        // 1-indexed for display

  const weekStart = new Date(epoch.getTime() + weekIdx * MS_PER_WEEK);
  const weekEnd   = new Date(epoch.getTime() + (weekIdx + 1) * MS_PER_WEEK - 1);
  const nextStart = new Date(epoch.getTime() + (weekIdx + 1) * MS_PER_WEEK);

  return {
    currentWeekId:  `2026-W${weekNum}`,
    previousWeekId: weekNum > 1 ? `2026-W${weekNum - 1}` : null,
    weekNumber:     weekNum,
    weekStart:      weekStart.toISOString(),
    weekEnd:        weekEnd.toISOString(),
    nextWeekStart:  nextStart.toISOString()
  };
}

export const getCurrentWeekId  = () => getWeekInfo().currentWeekId;
export const getPreviousWeekId = () => getWeekInfo().previousWeekId;
export const getWeekStart      = () => getWeekInfo().weekStart;
export const getWeekEnd        = () => getWeekInfo().weekEnd;
export const getDisplayWeek    = () => getWeekInfo().weekNumber;
export const getNextWeekStart  = () => new Date(getWeekInfo().nextWeekStart);

export function getTimeUntilNextWeek() {
  const diff    = getNextWeekStart() - new Date();
  const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { days, hours, minutes, seconds, totalMs: diff };
}

export function formatCountdown(ms) {
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const s = Math.floor((ms % (1000 * 60)) / 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

export default {
  ensureWeekEpochLoaded,
  getWeekInfo,
  getCurrentWeekId,
  getPreviousWeekId,
  getDisplayWeek,
  getTimeUntilNextWeek,
  formatCountdown,
  getTodayString
};


    
