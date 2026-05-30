// ============================================
// SCRIPTUREQUEST V4 — Centralized State Store
// Lightweight pub/sub store — no Redux needed.
// All app state lives here, modularly sliced.
// ============================================

// ── Internal state ──
const _state = {
  // Auth slice
  auth: {
    user:       null,   // Firebase user object
    profile:    null,   // Firestore users/{uid}
    stats:      null,   // Firestore userStats/{uid}
    ready:      false,  // auth.onAuthStateChanged has fired
    loading:    false
  },

  // Theme slice
  theme: {
    current:    'light',  // 'light' | 'dark' | 'system'
    applied:    'light'   // actual applied value after system resolution
  },

  // Navigation slice
  nav: {
    current:    'landing',
    previous:   null
  },

  // Quiz slice
  quiz: {
    session:        null,   // active session from Cloud Function
    questions:      [],
    currentIndex:   0,
    userAnswers:    {},
    timeLeft:       360,    // 6 minutes
    submitted:      false,
    lastResult:     null
  },

  // Leaderboard cache
  leaderboard: {
    entries:        [],
    weekId:         null,
    fetchedAt:      null,
    ttl:            60 * 1000  // 1 minute cache
  },

  // UI slice
  ui: {
    bottomNavVisible: false,
    maintenanceBannerVisible: true
  }
};

// ── Subscribers ──
const _subscribers = {};

// ── Subscribe to a slice ──
export function subscribe(slice, callback) {
  if (!_subscribers[slice]) _subscribers[slice] = [];
  _subscribers[slice].push(callback);
  // Return unsubscribe function
  return () => {
    _subscribers[slice] = _subscribers[slice].filter(cb => cb !== callback);
  };
}

// ── Notify subscribers of a slice change ──
function _notify(slice) {
  const callbacks = _subscribers[slice] || [];
  callbacks.forEach(cb => {
    try { cb(_state[slice]); }
    catch (err) { console.error(`[Store] Subscriber error in "${slice}":`, err); }
  });
}

// ── Read state ──
export function getState(slice) {
  if (!slice) return { ..._state };
  return _state[slice] ? { ..._state[slice] } : null;
}

// ── Update state ──
export function setState(slice, updates) {
  if (!_state[slice]) {
    console.warn(`[Store] Unknown slice: "${slice}"`);
    return;
  }
  _state[slice] = { ..._state[slice], ...updates };
  _notify(slice);
}

// ── Convenience getters ──
export const getAuth    = () => getState('auth');
export const getTheme   = () => getState('theme');
export const getNav     = () => getState('nav');
export const getQuiz    = () => getState('quiz');
export const getUI      = () => getState('ui');

export const getCurrentUser    = () => _state.auth.user;
export const getUserProfile    = () => _state.auth.profile;
export const getUserStats      = () => _state.auth.stats;
export const isAuthReady       = () => _state.auth.ready;
export const isLoggedIn        = () => !!_state.auth.user;
export const getCurrentScreen  = () => _state.nav.current;
export const getAppliedTheme   = () => _state.theme.applied;

// ── Reset quiz state ──
export function resetQuiz() {
  setState('quiz', {
    session:      null,
    questions:    [],
    currentIndex: 0,
    userAnswers:  {},
    timeLeft:     360,
    submitted:    false
  });
}

// ── Leaderboard cache helpers ──
export function isLeaderboardCacheValid() {
  const lb = _state.leaderboard;
  if (!lb.fetchedAt || !lb.weekId) return false;
  return (Date.now() - lb.fetchedAt) < lb.ttl;
}

export function setLeaderboardCache(entries, weekId) {
  setState('leaderboard', { entries, weekId, fetchedAt: Date.now() });
}

export function getLeaderboardCache() {
  return _state.leaderboard;
}

export default {
  subscribe,
  getState,
  setState,
  getAuth,
  getTheme,
  getNav,
  getQuiz,
  getUI,
  getCurrentUser,
  getUserProfile,
  getUserStats,
  isAuthReady,
  isLoggedIn,
  getCurrentScreen,
  getAppliedTheme,
  resetQuiz,
  isLeaderboardCacheValid,
  setLeaderboardCache,
  getLeaderboardCache
};
