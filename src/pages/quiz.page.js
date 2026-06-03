// ============================================
// SCRIPTUREQUEST V4 — Quiz Page
// Handles the active quiz screen:
// timer, questions, answers, submission.
// Lazy-loaded — only imported when quiz starts.
// ============================================

import { submitQuizSession,
         saveQuizStateToStorage,
         clearQuizStorage,
         getRandomEmoji }       from '../services/quiz.service.js';
import { setState, getState }   from '../state/store.js';
import { showToast }            from '../utils/toast.js';
import { LETTERS, TOTAL_QUESTIONS,
         QUIZ_DURATION_SECS }   from '../utils/constants.js';

// ── Module state ──
let _questions     = [];
let _sessionId     = null;
let _expiresAt     = null;
let _currentIndex  = 0;
let _userAnswers   = {};
let _timeLeft      = QUIZ_DURATION_SECS;
let _timerInterval = null;
let _answered      = false;
let _callbacks     = {};
let _submitting    = false;

// ── Element refs ──
const el = id => document.getElementById(id);

// ============================================
// INIT
// ============================================

export async function initQuizScreen(sessionData, callbacks) {
  _callbacks  = callbacks || {};
  _sessionId  = sessionData.sessionId;
  _expiresAt  = sessionData.expiresAt;
  _questions  = sessionData.questions || [];
  _userAnswers = sessionData.userAnswers || {};
  _currentIndex = sessionData.currentIndex || 0;
  _timeLeft    = sessionData.timeLeft ?? QUIZ_DURATION_SECS;
  _submitting  = false;
  _callbacks._localSubmit = callbacks?.localSubmit || null;

  setState('quiz', {
    session:      { sessionId: _sessionId, expiresAt: _expiresAt },
    questions:    _questions,
    currentIndex: _currentIndex,
    userAnswers:  _userAnswers,
    timeLeft:     _timeLeft,
    submitted:    false
  });

  const nameEl = el('quiz-user-name');
  if (nameEl) {
    const user    = (await import('../state/store.js')).getCurrentUser();
    const profile = (await import('../state/store.js')).getUserProfile();
    nameEl.textContent = profile?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || '—';
  }

  renderCurrentQuestion();
  startTimer();

  el('quiz-next-btn')?.addEventListener('click', handleNext);
  el('quiz-prev-btn')?.addEventListener('click', handlePrev);
  el('quiz-submit-btn')?.addEventListener('click', () => handleSubmit(false));
  el('quit-quiz-btn')?.addEventListener('click', handleQuit);
  el('quiz-theme-toggle')?.addEventListener('click', () => {
    import('../services/theme.service.js').then(m => m.toggleTheme());
  });
}

// ============================================
// RENDER QUESTION
// ============================================

function renderCurrentQuestion() {
  if (_currentIndex >= _questions.length) return;

  const q        = _questions[_currentIndex];
  const total    = _questions.length;
  const answered = _userAnswers[_currentIndex];

  _answered = answered !== undefined;

  const chip = el('question-chip');
  const prog = el('quiz-progress-label');
  const fill = el('quiz-progress-fill');

  if (chip) chip.textContent = `Question ${_currentIndex + 1} of ${total}`;
  if (prog) prog.textContent = `Q ${_currentIndex + 1} / ${total}`;
  if (fill) fill.style.width = `${((_currentIndex + 1) / total) * 100}%`;

  const qEl = el('question-text');
  if (qEl) {
    qEl.textContent = q.question;
    qEl.style.animation = 'none';
    qEl.offsetHeight;
    qEl.style.animation = 'fadeInUp 0.25s ease';
  }

  const optionsEl = el('options-list');
  if (optionsEl) {
    optionsEl.innerHTML = q.options.map((opt, i) => `
      <button
        class="option"
        role="listitem"
        data-index="${i}"
        aria-label="Option ${LETTERS[i]}: ${opt}"
        ${_answered ? 'disabled' : ''}
      >
        <span class="option-letter">${LETTERS[i]}</span>
        <span class="option-text">${opt}</span>
      </button>
    `).join('');

    if (_answered) {
      applyAnswerState(answered);
    } else {
      optionsEl.querySelectorAll('.option').forEach(btn => {
        btn.addEventListener('click', () => handleAnswer(parseInt(btn.dataset.index)));
      });
    }
  }

  // Feedback — NEVER reveal the correct answer
  const fbEl = el('feedback-area');
  if (fbEl) {
    if (_answered) {
      const isCorrect = answered === q.correctAnswer;
      fbEl.className  = `feedback-area ${isCorrect ? 'correct-fb' : 'wrong-fb'}`;
      fbEl.innerHTML  = `
        <span class="feedback-emoji">${getRandomEmoji(isCorrect)}</span>
        <p class="feedback-msg">${isCorrect ? 'Correct! Well done! 🎉' : 'Wrong answer. Keep studying! 📖'}</p>
        ${isCorrect && q.verseReference ? `<p style="font-size:12px;margin-top:4px;opacity:0.75">📖 ${q.verseReference}</p>` : ''}
      `;
      fbEl.classList.remove('hidden');
    } else {
      fbEl.classList.add('hidden');
      fbEl.innerHTML = '';
    }
  }

  updateNavButtons();

  const card = el('question-card');
  if (card) {
    card.style.animation = 'none';
    card.offsetHeight;
    card.style.animation = 'fadeInUp 0.3s ease';
  }
}

// applyAnswerState — only marks chosen as wrong or correct, never highlights the right answer
function applyAnswerState(chosen) {
  const q         = _questions[_currentIndex];
  const optionsEl = el('options-list');
  if (!optionsEl) return;

  optionsEl.querySelectorAll('.option').forEach(btn => {
    const idx = parseInt(btn.dataset.index);
    btn.disabled = true;
    if (idx === chosen) {
      // Only mark the chosen button — green if right, red if wrong
      btn.classList.add(chosen === q.correctAnswer ? 'correct' : 'wrong');
    } else {
      btn.classList.add('disabled');
    }
    // Intentionally never add 'correct' to any other button
  });
}

// ============================================
// ANSWER HANDLER
// ============================================

function handleAnswer(chosenIndex) {
  if (_answered || _submitting) return;

  const q   = _questions[_currentIndex];
  _answered = true;
  _userAnswers[_currentIndex] = chosenIndex;

  applyAnswerState(chosenIndex);

  const isCorrect = chosenIndex === q.correctAnswer;

  const fbEl = el('feedback-area');
  if (fbEl) {
    fbEl.className = `feedback-area ${isCorrect ? 'correct-fb' : 'wrong-fb'}`;
    fbEl.innerHTML = `
      <span class="feedback-emoji">${getRandomEmoji(isCorrect)}</span>
      <p class="feedback-msg">${isCorrect ? 'Correct! Well done! 🎉' : 'Wrong answer. Keep studying! 📖'}</p>
      ${isCorrect && q.verseReference ? `<p style="font-size:12px;margin-top:4px;opacity:0.75">📖 ${q.verseReference}</p>` : ''}
    `;
    fbEl.classList.remove('hidden');
  }

  saveQuizStateToStorage({
    sessionId:    _sessionId,
    questions:    _questions,
    currentIndex: _currentIndex,
    userAnswers:  _userAnswers,
    expiresAt:    _expiresAt
  });

  updateNavButtons();
}

// ============================================
// NAVIGATION
// ============================================

function handleNext() {
  if (_currentIndex < _questions.length - 1) {
    _currentIndex++;
    setState('quiz', { currentIndex: _currentIndex });
    _answered = _userAnswers[_currentIndex] !== undefined;
    renderCurrentQuestion();
  }
}

function handlePrev() {
  if (_currentIndex > 0) {
    _currentIndex--;
    setState('quiz', { currentIndex: _currentIndex });
    _answered = _userAnswers[_currentIndex] !== undefined;
    renderCurrentQuestion();
  }
}

function updateNavButtons() {
  const prevBtn   = el('quiz-prev-btn');
  const nextBtn   = el('quiz-next-btn');
  const submitBtn = el('quiz-submit-btn');

  if (prevBtn) prevBtn.disabled = _currentIndex === 0;

  const isLast      = _currentIndex === _questions.length - 1;
  const allAnswered = Object.keys(_userAnswers).length === _questions.length;

  if (isLast && _answered) {
    nextBtn?.classList.add('hidden');
    submitBtn?.classList.remove('hidden');
  } else {
    nextBtn?.classList.remove('hidden');
    submitBtn?.classList.add('hidden');
    if (nextBtn) nextBtn.disabled = !_answered;
  }

  if (allAnswered) {
    submitBtn?.classList.remove('hidden');
  }
}

// ============================================
// TIMER
// ============================================

function startTimer() {
  stopTimer();
  const timerEl = el('quiz-timer');
  if (!timerEl) return;

  function tick() {
    if (_timeLeft <= 0) {
      stopTimer();
      showToast("⏰ Time's up! Submitting your answers…", 'warning', 3000);
      handleSubmit(true);
      return;
    }
    const m = Math.floor(_timeLeft / 60);
    const s = _timeLeft % 60;
    timerEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    timerEl.classList.toggle('urgent', _timeLeft <= 60);
    _timeLeft--;
  }

  tick();
  _timerInterval = setInterval(tick, 1000);
}

function stopTimer() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
}

// ============================================
// SUBMIT
// ============================================

async function handleSubmit(timeExpired = false) {
  if (_submitting) return;
  _submitting = true;
  stopTimer();

  const submitBtn = el('quiz-submit-btn');
  const nextBtn   = el('quiz-next-btn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…'; }
  if (nextBtn)   nextBtn.disabled = true;

  document.querySelectorAll('.option').forEach(b => b.disabled = true);

  try {
    let result;
    if (_callbacks._localSubmit) {
      result = await _callbacks._localSubmit(_sessionId, _userAnswers, _questions);
    } else {
      result = await submitQuizSession(_sessionId, _userAnswers);
    }
    clearQuizStorage();
    _callbacks.onComplete?.(result);
  } catch (err) {
    // FIX: Always reset _submitting so the user can retry.
    // FIX: Clear storage if the error indicates the session is dead
    // (already submitted, permission denied, or session not found).
    // This prevents the user from being stuck in a broken state.
    _submitting = false;

    const msg = err.message || '';
    const isDeadSession =
      msg.includes('already submitted') ||
      msg.includes('permission-denied') ||
      msg.includes('Missing or insufficient permissions') ||
      msg.includes('Failed to create quiz session') ||
      msg.includes('Session check failed') ||
      msg.includes('Failed to lock session');

    if (isDeadSession) {
      clearQuizStorage();
      showToast(
        'Your quiz session could not be saved. Please start a new quiz.',
        'error',
        5000
      );
      // Give the user a moment to read the toast, then navigate away
      setTimeout(() => {
        _callbacks.onAbandon?.();
      }, 2500);
      return;
    }

    showToast(err.message || 'Submission failed. Please try again.', 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit'; }
    startTimer();
  }
}

// ============================================
// QUIT
// ============================================

function handleQuit() {
  if (window.SQ?.showConfirm) {
    window.SQ.showConfirm({
      icon:    '🚪',
      title:   'Abandon Quiz?',
      message: 'Your progress will be lost. Are you sure?',
      onConfirm: () => { stopTimer(); clearQuizStorage(); _callbacks.onAbandon?.(); }
    });
  } else {
    if (confirm('Abandon quiz? Progress will be lost.')) {
      stopTimer(); clearQuizStorage(); _callbacks.onAbandon?.();
    }
  }
}

export default { initQuizScreen };
