// ============================================
// SCRIPTUREQUEST V4 — Quiz Service
// All quiz logic goes through Cloud Functions.
// Frontend = UI only. Server = authority.
// ============================================

import { httpsCallable }       from 'firebase/functions';
import { doc, getDoc, query,
         collection, where,
         getDocs, Timestamp }  from 'firebase/firestore';
import { functions, db, auth } from '../firebase/config.js';
import { setState, resetQuiz,
         getState }            from '../state/store.js';
import { showToast }           from '../utils/toast.js';
import {
  QUIZ_STATE_KEY,
  TOTAL_QUESTIONS,
  QUIZ_DURATION_SECS,
  SESSION_MAX_AGE_HOURS,
  COLLECTIONS,
  FUNCTIONS,
  CORRECT_EMOJIS,
  WRONG_EMOJIS
} from '../utils/constants.js';

// ── Cloud Function references ──
const _createSession = httpsCallable(functions, FUNCTIONS.CREATE_SESSION);
const _submitSession  = httpsCallable(functions, FUNCTIONS.SUBMIT_SESSION);

// ============================================
// SESSION CREATION
// ============================================

/**
 * Request a new quiz session from Cloud Function.
 * Returns { sessionId, questions, expiresAt }
 * Throws if daily limit reached or profile incomplete.
 */
export async function createQuizSession() {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be logged in to start a quiz');

  try {
    const result = await _createSession({});
    const { sessionId, questions, expiresAt, dailyRemaining } = result.data;

    // Save session to local state
    setState('quiz', {
      session:      { sessionId, expiresAt },
      questions,
      currentIndex: 0,
      userAnswers:  {},
      timeLeft:     QUIZ_DURATION_SECS,
      submitted:    false
    });

    // Persist to localStorage for resume support
    _saveQuizStateToStorage({
      sessionId,
      questions,
      currentIndex: 0,
      userAnswers:  {},
      expiresAt,
      savedAt:      Date.now()
    });

    return { sessionId, questions, expiresAt, dailyRemaining };
  } catch (err) {
    // Cloud Function errors come back as { code, message, details }
    const msg = err?.details?.userMessage || err.message || 'Failed to start quiz';
    throw new Error(msg);
  }
}

// ============================================
// SESSION SUBMISSION
// ============================================

/**
 * Submit completed quiz to Cloud Function for server-side scoring.
 * Returns full result payload — no second Firestore read needed.
 */
export async function submitQuizSession(sessionId, userAnswers) {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be logged in to submit a quiz');

  try {
    const result = await _submitSession({ sessionId, answers: userAnswers });
    const payload = result.data;

    // Clear localStorage quiz state — quiz is done
    clearQuizStorage();

    // Update quiz state with result
    setState('quiz', {
      submitted:  true,
      lastResult: payload,
      session:    null
    });

    return payload;
    /*
      payload shape:
      {
        xpEarned, leveledUp, oldLevel, newLevel,
        streak, completedQuests, badgeUnlocks,
        achievementUnlocks, totalXp, percentage,
        score, totalQuestions, weeklyPoints
      }
    */
  } catch (err) {
    const msg = err?.details?.userMessage || err.message || 'Submission failed. Please try again';
    throw new Error(msg);
  }
}

// ============================================
// DAILY LIMIT CHECK (frontend lightweight check)
// Used only to show UI state — NOT authoritative.
// Cloud Function is the real enforcer.
// ============================================

export async function checkDailyLimit() {
  const user = auth.currentUser;
  if (!user) return { blocked: true, remaining: 0, reason: 'not_logged_in' };

  try {
    const now         = new Date();
    const todayStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd    = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const q = query(
      collection(db, COLLECTIONS.QUIZ_ATTEMPTS),
      where('userId',    '==', user.uid),
      where('timestamp', '>=', Timestamp.fromDate(todayStart)),
      where('timestamp', '<',  Timestamp.fromDate(todayEnd))
    );

    const snap = await getDocs(q);
    const taken     = snap.size;
    const maxPerDay = 2;
    const remaining = Math.max(0, maxPerDay - taken);

    if (remaining <= 0) {
      const msUntilMidnight = todayEnd - now;
      return {
        blocked:          true,
        remaining:        0,
        takenToday:       taken,
        msUntilMidnight,
        nextQuizTime:     todayEnd
      };
    }

    return { blocked: false, remaining, takenToday: taken };
  } catch (err) {
    console.error('[Quiz] Daily limit check error:', err);
    // Fail open — Cloud Function will enforce on submit
    return { blocked: false, remaining: 1, takenToday: 0, error: err.message };
  }
}

// ============================================
// LOCAL QUIZ STATE (localStorage)
// Used for UX only: resume, timer persistence.
// Never sent to backend as authoritative data.
// ============================================

const STATE_VERSION = 4;

export function saveQuizStateToStorage(updates) {
  _saveQuizStateToStorage(updates);
}

function _saveQuizStateToStorage(data) {
  try {
    const existing = _loadQuizStateFromStorage() || {};
    const state = {
      ...existing,
      ...data,
      version: STATE_VERSION,
      savedAt: Date.now()
    };
    localStorage.setItem(QUIZ_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[Quiz] Failed to save state:', e);
  }
}

export function loadQuizStateFromStorage() {
  return _loadQuizStateFromStorage();
}

function _loadQuizStateFromStorage() {
  try {
    const raw = localStorage.getItem(QUIZ_STATE_KEY);
    if (!raw) return null;

    const state = JSON.parse(raw);

    // Version check
    if (state.version !== STATE_VERSION) {
      localStorage.removeItem(QUIZ_STATE_KEY);
      return null;
    }

    // Age check — discard if older than SESSION_MAX_AGE_HOURS
    const ageMs = Date.now() - (state.savedAt || 0);
    if (ageMs > SESSION_MAX_AGE_HOURS * 60 * 60 * 1000) {
      localStorage.removeItem(QUIZ_STATE_KEY);
      return null;
    }

    // Timer check — discard if expired
    const remaining = state.expiresAt
      ? Math.max(0, Math.floor((state.expiresAt - Date.now()) / 1000))
      : 0;

    if (remaining <= 0) {
      localStorage.removeItem(QUIZ_STATE_KEY);
      return null;
    }

    // Question integrity check
    if (!Array.isArray(state.questions) || state.questions.length === 0) {
      localStorage.removeItem(QUIZ_STATE_KEY);
      return null;
    }

    return { ...state, timeLeft: remaining };
  } catch (e) {
    console.error('[Quiz] Failed to load state:', e);
    localStorage.removeItem(QUIZ_STATE_KEY);
    return null;
  }
}

export function clearQuizStorage() {
  localStorage.removeItem(QUIZ_STATE_KEY);
}

export function hasResumableQuiz() {
  return _loadQuizStateFromStorage() !== null;
}

// ============================================
// QUESTION HELPERS (client-side only)
// ============================================

export function getRandomEmoji(isCorrect) {
  const pool = isCorrect ? CORRECT_EMOJIS : WRONG_EMOJIS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function calculateClientPoints(score, totalQuestions, allAnswered) {
  // Client-side estimate for immediate UI feedback only.
  // Server recalculates authoritatively.
  const percentage = score / totalQuestions;
  let pts = score * 10;
  if (percentage >= 0.9) pts += 100;
  if (allAnswered) pts += 50;
  return pts;
}

export function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================================
// FALLBACK: Local question pool
// Used when Cloud Functions are unavailable
// (dev mode / emulator).
// ============================================

export async function getQuestionsFromLocalPool(allQuestions, count = TOTAL_QUESTIONS) {
  const user = auth.currentUser;

  if (!user) {
    return shuffleArray(allQuestions).slice(0, count);
  }

  try {
    const userRef  = doc(db, COLLECTIONS.USERS, user.uid);
    const userSnap = await getDoc(userRef);
    const history  = userSnap.data()?.questionHistory || [];

    const oneWeekAgo   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentlySeen = new Set();
    const prunedHistory = [];

    history.forEach(h => {
      const ts = h.seenAt?.toDate ? h.seenAt.toDate() : new Date(h.seenAt);
      if (ts > oneWeekAgo) {
        recentlySeen.add(h.question);
        prunedHistory.push(h);
      }
    });

    let pool = allQuestions.filter(q => !recentlySeen.has(q.question));
    if (pool.length < count) pool = allQuestions;

    return shuffleArray(pool).slice(0, count);
  } catch (err) {
    console.error('[Quiz] Local pool error:', err);
    return shuffleArray(allQuestions).slice(0, count);
  }
}

export default {
  createQuizSession,
  submitQuizSession,
  checkDailyLimit,
  saveQuizStateToStorage,
  loadQuizStateFromStorage,
  clearQuizStorage,
  hasResumableQuiz,
  getRandomEmoji,
  shuffleArray,
  getQuestionsFromLocalPool
};
