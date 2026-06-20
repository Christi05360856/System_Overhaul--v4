// ============================================
// SCRIPTUREQUEST V5 — Presence Service
// Tracks which users are currently online.
//
// HOW IT WORKS:
//   - When user logs in, startPresenceHeartbeat()
//     writes their lastSeen timestamp to Firestore
//     every 60 seconds and on page visibility change
//   - When user closes or backgrounds the app,
//     stopPresenceHeartbeat() clears the timer
//     and writes a final offline timestamp
//   - The leaderboard reads each entry's UID and
//     checks if their lastSeen is within 90 seconds
//   - A pulsing green dot is shown if online
//
// WHY FIRESTORE (not Realtime Database):
//   Firestore presence is slightly less instant
//   (seconds vs milliseconds) but works well here.
// ============================================

import { doc, setDoc, serverTimestamp, onSnapshot,
         collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase/config.js';
import { PRESENCE_HEARTBEAT_INTERVAL, PRESENCE_ONLINE_THRESHOLD_MS } from '../utils/constants.js';

let _heartbeatTimer   = null;
let _visibilityHandler = null;

// ============================================
// START HEARTBEAT (call on login)
// ============================================

export function startPresenceHeartbeat() {
  const user = auth.currentUser;
  if (!user) return;

  _writePresence(user.uid, true);

  // Write every 60 seconds while app is open
  if (_heartbeatTimer) clearInterval(_heartbeatTimer);
  _heartbeatTimer = setInterval(() => {
    if (auth.currentUser) _writePresence(auth.currentUser.uid, true);
  }, PRESENCE_HEARTBEAT_INTERVAL);

  // Write on tab visibility change (tab switch, minimize)
  if (_visibilityHandler) document.removeEventListener('visibilitychange', _visibilityHandler);
  _visibilityHandler = () => {
    if (!auth.currentUser) return;
    _writePresence(auth.currentUser.uid, !document.hidden);
  };
  document.addEventListener('visibilitychange', _visibilityHandler);

  // Write offline on page unload
  window.addEventListener('beforeunload', () => {
    if (auth.currentUser) _writePresence(auth.currentUser.uid, false);
  });
}

// ============================================
// STOP HEARTBEAT (call on logout)
// ============================================

export function stopPresenceHeartbeat() {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  if (_visibilityHandler) {
    document.removeEventListener('visibilitychange', _visibilityHandler);
    _visibilityHandler = null;
  }
  const user = auth.currentUser;
  if (user) _writePresence(user.uid, false);
}

// ============================================
// WRITE PRESENCE (internal)
// ============================================

async function _writePresence(uid, isOnline) {
  try {
    await setDoc(doc(db, 'presence', uid), {
      uid,
      lastSeen:  serverTimestamp(),
      isOnline,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    // Non-fatal — do not let presence errors break the app
    console.warn('[Presence] Write error:', e.message);
  }
}

// ============================================
// CHECK IF A SPECIFIC USER IS ONLINE
// Used by leaderboard to show/hide green dot
// ============================================

export function isUserOnline(lastSeenMillis) {
  if (!lastSeenMillis) return false;
  return Date.now() - lastSeenMillis < PRESENCE_ONLINE_THRESHOLD_MS;
}

// ============================================
// CHECK IF A USER IS ACTIVE (green dot showing)
// This means they are online AND actively using the app.
// Used for battle notifications.
// ============================================

export function isUserActive(lastSeenMillis, isOnlineFlag) {
  // Active = online heartbeat within threshold and explicitly marked online
  return isUserOnline(lastSeenMillis) && isOnlineFlag !== false;
}

// ============================================
// SUBSCRIBE TO PRESENCE FOR A LIST OF UIDS
// Returns a map of { uid: boolean (isOnline) }
// and calls onUpdate whenever any presence changes.
//
// Usage: called by leaderboard.service.js after
// entries are loaded, passing the list of UIDs.
// ============================================

const _presenceUnsubs = new Map();

export function subscribeToPresenceList(uids, onUpdate) {
  // Clean up previous subscriptions
  unsubscribePresenceList();

  const presenceMap = {};

  uids.forEach(uid => {
    const unsub = onSnapshot(doc(db, 'presence', uid), snap => {
      if (snap.exists()) {
        const data     = snap.data();
        const lastSeen = data.lastSeen?.toMillis?.() || 0;
        presenceMap[uid] = isUserOnline(lastSeen);
      } else {
        presenceMap[uid] = false;
      }
      onUpdate({ ...presenceMap });
    }, () => {
      presenceMap[uid] = false;
    });

    _presenceUnsubs.set(uid, unsub);
  });
}

export function unsubscribePresenceList() {
  _presenceUnsubs.forEach(unsub => unsub());
  _presenceUnsubs.clear();
}

// ============================================
// GET PRESENCE DOT HTML
// Returns the HTML string for a pulsing green dot
// (or empty string if offline)
// ============================================

export function getPresenceDotHtml(isOnline) {
  if (!isOnline) return '';
  return `<span class="presence-dot" title="Online now" aria-label="Online"></span>`;
}

export default {
  startPresenceHeartbeat, stopPresenceHeartbeat,
  isUserOnline, isUserActive,
  subscribeToPresenceList, unsubscribePresenceList,
  getPresenceDotHtml
};
