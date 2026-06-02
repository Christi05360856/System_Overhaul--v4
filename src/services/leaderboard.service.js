// ============================================
// SCRIPTUREQUEST V4 — Leaderboard Service
// Reads from leaderboardWeekly/{weekId}/entries
// Uses memory cache to reduce Firestore reads.
// ============================================

import {
  collection, doc, getDoc,
  getDocs, onSnapshot, orderBy,
  query, limit
} from 'firebase/firestore';
import { db, auth }        from '../firebase/config.js';
import {
  setLeaderboardCache,
  getLeaderboardCache,
  isLeaderboardCacheValid
} from '../state/store.js';
import {
  getCurrentWeekId,
  getDisplayWeek
} from '../utils/week.js';
import {
  COLLECTIONS,
  LEADERBOARD_MAX_DISPLAY
} from '../utils/constants.js';

let _unsubscribeLeaderboard = null;

// ============================================
// FETCH LEADERBOARD (one-time, cache-aware)
// ============================================

export async function fetchLeaderboard(forceRefresh = false) {
  const weekId = getCurrentWeekId();

  // Return cache if still valid and same week
  const cache = getLeaderboardCache();
  if (!forceRefresh && isLeaderboardCacheValid() && cache.weekId === weekId) {
    return cache.entries;
  }

  try {
    // New architecture: leaderboardWeekly/{weekId}/entries/{uid} subcollection
    const entriesRef = collection(db, COLLECTIONS.LEADERBOARD, weekId, 'entries');
    const q          = query(entriesRef, orderBy('points', 'desc'), limit(LEADERBOARD_MAX_DISPLAY + 5));
    const snap       = await getDocs(q);

    const entries = [];
    snap.forEach(d => entries.push({ userId: d.id, ...d.data() }));

    // Sort client-side for extra safety
    entries.sort((a, b) => b.points - a.points);

    setLeaderboardCache(entries, weekId);
    return entries;
  } catch (err) {
    console.error('[Leaderboard] Fetch error:', err);

    // Fallback: try old flat leaderboard structure for backward compat
    try {
      return await _fetchLegacyLeaderboard(weekId);
    } catch {
      return cache.entries || [];
    }
  }
}

// ── Backward compat: old leaderboard/{weekId}.entries array ──
async function _fetchLegacyLeaderboard(weekId) {
  const snap = await getDoc(doc(db, 'leaderboard', weekId));
  if (!snap.exists()) return [];
  const entries = snap.data().entries || [];
  entries.sort((a, b) => b.points - a.points);
  setLeaderboardCache(entries, weekId);
  return entries;
}

// ============================================
// REALTIME LISTENER (for leaderboard screen)
// ============================================

export function subscribeLeaderboard(onUpdate) {
  // Unsubscribe previous listener
  if (_unsubscribeLeaderboard) {
    _unsubscribeLeaderboard();
    _unsubscribeLeaderboard = null;
  }

  const weekId     = getCurrentWeekId();
  const entriesRef = collection(db, COLLECTIONS.LEADERBOARD, weekId, 'entries');
  const q          = query(entriesRef, orderBy('points', 'desc'), limit(LEADERBOARD_MAX_DISPLAY + 5));

  _unsubscribeLeaderboard = onSnapshot(q, snap => {
    const entries = [];
    snap.forEach(d => entries.push({ userId: d.id, ...d.data() }));
    entries.sort((a, b) => b.points - a.points);
    setLeaderboardCache(entries, weekId);
    onUpdate(entries);
  }, err => {
    console.error('[Leaderboard] Realtime error:', err);
    // Fall back to cached data on error
    onUpdate(getLeaderboardCache().entries || []);
  });

  return _unsubscribeLeaderboard;
}

export function unsubscribeLeaderboard() {
  if (_unsubscribeLeaderboard) {
    _unsubscribeLeaderboard();
    _unsubscribeLeaderboard = null;
  }
}

// ============================================
// RENDER HELPERS
// ============================================

/**
 * Render leaderboard rows into a container element.
 * Fully theme-aware — uses CSS variables, no hardcoded colors.
 */
export async function renderLeaderboardRows(entries, containerEl, currentUserId = null) {
  if (!containerEl) return;

  if (!entries || entries.length === 0) {
    containerEl.innerHTML = `
      <div class="empty-state">
        <div style="font-size:48px;margin-bottom:12px">📖</div>
        <p>No scores yet this week.</p>
        <p style="margin-top:4px;font-size:13px">Be the first to take the quiz!</p>
      </div>`;
    return;
  }

  const rowPromises = entries.slice(0, LEADERBOARD_MAX_DISPLAY).map(async (entry, idx) => {
    const rank         = idx + 1;
    const isMe         = currentUserId && entry.userId === currentUserId;
    const medal        = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    const prizeHTML    = rank <= 3
      ? `<span class="badge badge-reward" style="font-size:10px;padding:2px 8px">🏆 Prize</span>`
      : '';
    const streakHTML   = entry.streak
      ? `<span style="font-size:12px;color:var(--accent-warm);font-weight:700">🔥${entry.streak}</span>`
      : '';

    return `
      <div class="lb-row ${isMe ? 'lb-row--me' : ''}" data-rank="${rank}">
        <div class="lb-rank">${medal}</div>
        <div class="lb-name">
          <span>${escapeHTML(entry.displayName || entry.name || 'Anonymous')}</span>
          ${prizeHTML}
          ${streakHTML}
        </div>
        <div class="lb-points">\${(entry.points || 0).toLocaleString()} <span class="lb-pts-label">pts</span></div>
        \${!isMe ? `<button class="lb-challenge-btn" onclick="window.SQ&&SQ.challengeUser&&SQ.challengeUser('\${entry.userId}','\${(entry.displayName||'Anonymous').replace(/'/g,'')}')" >⚔️</button>` : ''}
      </div>`;
  });
  const rows = await Promise.all(rowPromises);

  containerEl.innerHTML = rows.join('');

  // Animate rows in
  containerEl.querySelectorAll('.lb-row').forEach((row, i) => {
    row.style.animationDelay = `${i * 40}ms`;
    row.classList.add('lb-row--animate');
  });
}

/**
 * Render the current user's rank below the leaderboard
 * if they're outside the top LEADERBOARD_MAX_DISPLAY.
 */
export function renderUserRank(entries, rankContainerEl, currentUserId) {
  if (!rankContainerEl || !currentUserId) return;

  const userIdx = entries.findIndex(e => e.userId === currentUserId);
  if (userIdx < 0 || userIdx < LEADERBOARD_MAX_DISPLAY) {
    rankContainerEl.innerHTML = '';
    return;
  }

  const entry = entries[userIdx];
  rankContainerEl.innerHTML = `
    <div style="padding:12px 0;border-top:1px solid var(--border)">
      <div class="lb-row lb-row--me">
        <div class="lb-rank">#${userIdx + 1}</div>
        <div class="lb-name"><span>You</span></div>
        <div class="lb-points">${(entry.points || 0).toLocaleString()} <span class="lb-pts-label">pts</span></div>
      </div>
    </div>`;
}

// ============================================
// UTILITIES
// ============================================

export function getUserRank(entries, userId) {
  const idx = entries.findIndex(e => e.userId === userId);
  return idx >= 0 ? idx + 1 : null;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default {
  fetchLeaderboard,
  subscribeLeaderboard,
  unsubscribeLeaderboard,
  renderLeaderboardRows,
  renderUserRank,
  getUserRank
};
