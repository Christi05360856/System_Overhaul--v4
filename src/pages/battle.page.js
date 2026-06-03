// ============================================
// SCRIPTUREQUEST V4 — Battle Page
// Fixes:
//   - Timer uses BATTLE_DURATION_SECS (2:50)
//   - Persists matchId to localStorage (Issue 4)
//   - Robust cleanup / destroyBattleScreen
//   - Waiting screen re-subscribes correctly
//   - No correct answer revealed on wrong pick
// ============================================

import { submitBattleAnswers, listenToMatch, getMatchResult } from '../services/match.service.js';
import { getCurrentUser }      from '../state/store.js';
import { mountAvatar }         from '../components/avatar.js';
import { LETTERS, BATTLE_DURATION_SECS, PENDING_BATTLE_KEY } from '../utils/constants.js';

let _matchId   = null;
let _questions = [];
let _answers   = {};
let _current   = 0;
let _timeLeft  = BATTLE_DURATION_SECS;
let _timer     = null;
let _matchUnsub = null;
let _submitting = false;
let _callbacks  = {};

const el = id => document.getElementById(id);

// ============================================
// INIT
// ============================================

export async function initBattleScreen(matchId, questions, match, callbacks) {
  // Always destroy previous state first
  destroyBattleScreen();

  _matchId    = matchId;
  _questions  = (questions || match?.questions || []).slice();
  _answers    = {};
  _current    = 0;
  _timeLeft   = BATTLE_DURATION_SECS;
  _submitting = false;
  _callbacks  = callbacks || {};

  // Issue 4: Persist matchId so we can recover result after page close
  try { localStorage.setItem(PENDING_BATTLE_KEY, matchId); } catch(e) {}

  const user      = getCurrentUser();
  const isCreator = match.creatorId === user?.uid;
  const myName    = isCreator ? match.creatorName    : match.opponentName;
  const oppName   = isCreator ? match.opponentName   : match.creatorName;
  const myAvatar  = isCreator ? match.creatorAvatar  : match.opponentAvatar;
  const oppAvatar = isCreator ? match.opponentAvatar : match.creatorAvatar;

  if (el('battle-my-name'))         el('battle-my-name').textContent       = myName  || 'You';
  if (el('battle-opponent-name'))   el('battle-opponent-name').textContent  = oppName || 'Opponent';
  if (el('battle-my-avatar'))       mountAvatar(myAvatar  || 'M01', el('battle-my-avatar'));
  if (el('battle-opponent-avatar')) mountAvatar(oppAvatar || 'M01', el('battle-opponent-avatar'));

  // Wire buttons (clone to remove stale listeners)
  _wire('battle-prev-btn',   prevQ);
  _wire('battle-next-btn',   nextQ);
  _wire('battle-submit-btn', () => _submit());

  renderQuestion();
  _startTimer();

  // Listen for opponent finishing first
  _matchUnsub = listenToMatch(matchId, match => {
    if (match.status === 'completed' && !_submitting) {
      // Opponent finished while we were still answering — auto-submit
      _submit(true);
    }
  });
}

function _wire(id, fn) {
  const orig = el(id);
  if (!orig) return;
  const clone = orig.cloneNode(true);
  orig.parentNode.replaceChild(clone, orig);
  clone.addEventListener('click', fn);
}

// ============================================
// RENDER
// ============================================

function renderQuestion() {
  const q        = _questions[_current];
  if (!q) return;
  const answered = _answers[_current] !== undefined;

  if (el('battle-q-chip'))    el('battle-q-chip').textContent    = `Question ${_current + 1} of ${_questions.length}`;
  if (el('battle-q-text'))    el('battle-q-text').textContent    = q.question;
  if (el('battle-progress'))  el('battle-progress').style.width  = `${((_current + 1) / _questions.length) * 100}%`;
  if (el('battle-prog-fill')) el('battle-prog-fill').style.width = `${((_current + 1) / _questions.length) * 100}%`;

  const optEl = el('battle-options');
  if (optEl) {
    optEl.innerHTML = q.options.map((opt, i) => {
      let cls = 'option';
      if (answered && _answers[_current] === i) {
        cls += _answers[_current] === q.correctAnswer ? ' correct' : ' wrong';
      } else if (answered) {
        cls += ' disabled';
      }
      return `<button class="${cls}" data-index="${i}" ${answered ? 'disabled' : ''}>
        <span class="option-letter">${LETTERS[i]}</span><span>${opt}</span>
      </button>`;
    }).join('');

    if (!answered) {
      optEl.querySelectorAll('.option').forEach(b =>
        b.addEventListener('click', () => _selectAnswer(parseInt(b.dataset.index)))
      );
    }
  }

  _updateNav();
}

function _selectAnswer(idx) {
  if (_submitting || _answers[_current] !== undefined) return;
  _answers[_current] = idx;

  // Only colour the chosen button — never reveal correct answer
  const q = _questions[_current];
  el('battle-options')?.querySelectorAll('.option').forEach((b, i) => {
    b.disabled = true;
    if (i === idx) b.classList.add(idx === q.correctAnswer ? 'correct' : 'wrong');
    else           b.classList.add('disabled');
  });

  _updateNav();
}

function _updateNav() {
  const isLast      = _current === _questions.length - 1;
  const allAnswered = Object.keys(_answers).length === _questions.length;
  const answered    = _answers[_current] !== undefined;

  if (el('battle-prev-btn'))   el('battle-prev-btn').disabled = _current === 0;
  el('battle-next-btn')?.classList.toggle('hidden',   isLast);
  el('battle-submit-btn')?.classList.toggle('hidden', !isLast && !allAnswered);
  if (el('battle-next-btn') && !isLast) el('battle-next-btn').disabled = !answered;
}

function nextQ() { if (_current < _questions.length - 1) { _current++; renderQuestion(); } }
function prevQ() { if (_current > 0)                     { _current--; renderQuestion(); } }

// ============================================
// TIMER
// ============================================

function _startTimer() {
  const t = el('battle-timer');
  const tick = () => {
    if (_timeLeft <= 0) { destroyBattleScreen(); _submit(true); return; }
    const m = Math.floor(_timeLeft / 60), s = _timeLeft % 60;
    if (t) { t.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; t.classList.toggle('urgent', _timeLeft <= 30); }
    _timeLeft--;
  };
  tick();
  _timer = setInterval(tick, 1000);
}

// ============================================
// SUBMIT
// ============================================

async function _submit(autoSubmit = false) {
  if (_submitting) return;
  _submitting = true;

  if (_timer) { clearInterval(_timer); _timer = null; }
  if (_matchUnsub) { _matchUnsub(); _matchUnsub = null; }

  const btn = el('battle-submit-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…'; }

  // Fill unanswered with null
  const answers = {};
  _questions.forEach((_, i) => { answers[i] = _answers[i] !== undefined ? _answers[i] : null; });

  try {
    const result = await submitBattleAnswers(_matchId, answers);

    if (result.bothDone) {
      const match = await getMatchResult(_matchId);
      try { localStorage.removeItem(PENDING_BATTLE_KEY); } catch(e) {}
      _callbacks.onComplete?.(match);
    } else {
      _showWaiting();
    }
  } catch(err) {
    console.error('[Battle] Submit error:', err);
    _submitting = false;
    _showWaiting(); // Show waiting anyway — don't hang on error
  }
}

function _showWaiting() {
  // Issue 4: matchId already in localStorage — user can close and come back
  const screen = el('screen-battle');
  if (screen) {
    screen.innerHTML = `
      <div style="max-width:480px;margin:80px auto;text-align:center;padding:40px 20px">
        <div style="font-size:64px;margin-bottom:16px">⏳</div>
        <h2 style="font-size:22px;font-weight:900;color:var(--text-primary);margin-bottom:8px">Answers Submitted!</h2>
        <p style="color:var(--text-muted);font-size:15px;margin-bottom:8px">Waiting for your opponent to finish…</p>
        <div class="spinner" style="margin:20px auto"></div>
        <p style="font-size:13px;color:var(--text-muted);margin-top:8px">
          You can safely close this page.<br>We'll show results next time you open the app. 📱
        </p>
      </div>`;
  }

  // Re-subscribe to catch completion
  _matchUnsub = listenToMatch(_matchId, match => {
    if (match.status === 'completed') {
      try { localStorage.removeItem(PENDING_BATTLE_KEY); } catch(e) {}
      if (_matchUnsub) { _matchUnsub(); _matchUnsub = null; }
      _callbacks.onComplete?.(match);
    }
  });
}

// ============================================
// DESTROY
// ============================================

export function destroyBattleScreen() {
  if (_timer)     { clearInterval(_timer); _timer = null; }
  if (_matchUnsub){ _matchUnsub(); _matchUnsub = null; }
  _submitting = false;
}

export default { initBattleScreen, destroyBattleScreen };
