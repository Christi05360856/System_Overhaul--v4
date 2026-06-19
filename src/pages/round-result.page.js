// ============================================
// SCRIPTUREQUEST V5 — Round Result Page
// Shown after each learning-path round.
// Handles pass/fail display, XP, per-question
// summary, and celebration cascade routing.
// Lazy-loaded — only imported when needed.
// ============================================

import { getRound, getNextRoundId } from '../services/path.service.js';

// Element helper
const el = id => document.getElementById(id);

// Stroke circumference for the SVG ring (radius = 50, so c = 2π×50 ≈ 314.16)
const RING_CIRCUMFERENCE = 2 * Math.PI * 50;

// ============================================
// INIT
// ============================================

export function initRoundResultScreen(result, callbacks) {
  const cb = callbacks || {};

  _renderHeader(result);
  _renderScoreRing(result);
  _renderPassBadge(result);
  _renderXp(result);
  _renderQSummary(result);
  _renderCelebration(result);
  _wireButtons(result, cb);
}

// ============================================
// HEADER
// ============================================

function _renderHeader(result) {
  const { percentage, passed, isPerfect } = result;

  const icon  = isPerfect ? '🏆' : passed ? '🎉' : '📖';
  const title = isPerfect ? 'Perfect Round!' : passed ? 'Round Passed!' : 'Keep Studying!';

  _setText('round-result-icon',    icon);
  _setText('round-result-title',   title);

  // Show passage from the round
  const round = getRound(result.roundId);
  _setText('round-result-passage', round?.passageRef || result.roundId || '');
}

// ============================================
// SCORE RING (SVG circle animation)
// ============================================

function _renderScoreRing(result) {
  const { percentage, score, totalQuestions } = result;

  _setText('round-result-pct',    `${percentage}%`);
  _setText('round-result-detail', `${score}/${totalQuestions}`);

  // Animate ring fill
  const ringEl = el('round-ring-fill');
  if (ringEl) {
    const offset = RING_CIRCUMFERENCE * (1 - (percentage / 100));
    // Set initial state (no dash)
    ringEl.style.strokeDasharray  = `${RING_CIRCUMFERENCE}`;
    ringEl.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;
    // Apply colour based on percentage
    ringEl.style.stroke = _ringColor(percentage);
    // Animate after a short delay
    requestAnimationFrame(() => {
      setTimeout(() => {
        ringEl.style.transition      = 'stroke-dashoffset 0.7s ease';
        ringEl.style.strokeDashoffset = `${offset}`;
      }, 120);
    });
  }
}

function _ringColor(pct) {
  if (pct === 100) return '#ffd700';  // gold for perfect
  if (pct >= 70)  return '#22c55e';  // green for pass
  return '#ef4444';                   // red for fail
}

// ============================================
// PASS / FAIL BADGE
// ============================================

function _renderPassBadge(result) {
  const badge   = el('round-pass-badge');
  const textEl  = el('round-pass-text');
  if (!badge || !textEl) return;

  if (result.isPerfect) {
    badge.className    = 'round-pass-badge round-pass-badge--perfect';
    textEl.textContent = '⭐ Perfect!';
  } else if (result.passed) {
    badge.className    = 'round-pass-badge round-pass-badge--pass';
    textEl.textContent = '✅ Passed';
  } else {
    badge.className    = 'round-pass-badge round-pass-badge--fail';
    textEl.textContent = `❌ ${result.percentage}% — Need 70% to pass`;
  }
}

// ============================================
// XP EARNED
// ============================================

function _renderXp(result) {
  const xpEl = el('round-xp-earned');
  if (xpEl) xpEl.textContent = `+${result.xpEarned || 0} XP`;
}

// ============================================
// PER-QUESTION SUMMARY
// Dots showing right/wrong per question.
// No answers revealed — just hit/miss indicator.
// ============================================

function _renderQSummary(result) {
  const container = el('round-q-summary');
  if (!container) return;

  const { userAnswers, questions } = result;
  if (!questions?.length) { container.innerHTML = ''; return; }

  container.innerHTML = questions.map((q, i) => {
    const chosen    = userAnswers?.[i];
    const answered  = chosen !== undefined;
    const isCorrect = answered && chosen === q.correctAnswer;
    const cls       = !answered     ? 'round-q-dot--skipped'
                    : isCorrect     ? 'round-q-dot--correct'
                    :                 'round-q-dot--wrong';
    return `<span class="round-q-dot ${cls}" title="Q${i + 1}: ${isCorrect ? 'Correct' : answered ? 'Wrong' : 'Skipped'}"></span>`;
  }).join('');
}

// ============================================
// CELEBRATION BLOCK
// Shows extra XP for lesson/unit/section completion.
// ============================================

function _renderCelebration(result) {
  const block  = el('round-celebration-block');
  const iconEl = el('round-celebration-icon');
  const msgEl  = el('round-celebration-msg');
  const xpEl   = el('round-celebration-xp');

  if (!block) return;

  // Only show on pass
  if (!result.passed) {
    block.classList.add('hidden');
    return;
  }

  if (result.sectionComplete) {
    block.classList.remove('hidden');
    if (iconEl) iconEl.textContent = '🏆';
    if (msgEl)  msgEl.textContent  = 'Section complete! Incredible work.';
    if (xpEl)   xpEl.textContent   = '+1000 XP section bonus';
  } else if (result.unitComplete) {
    block.classList.remove('hidden');
    if (iconEl) iconEl.textContent = '📚';
    if (msgEl)  msgEl.textContent  = 'Book complete! Outstanding.';
    if (xpEl)   xpEl.textContent   = '+200 XP book bonus';
  } else if (result.lessonComplete) {
    block.classList.remove('hidden');
    if (iconEl) iconEl.textContent = '🏅';
    if (msgEl)  msgEl.textContent  = 'Lesson complete!';
    if (xpEl)   xpEl.textContent   = '+100 XP lesson bonus';
  } else {
    block.classList.add('hidden');
  }
}

// ============================================
// BUTTON WIRING
// ============================================

function _wireButtons(result, cb) {
  const passActions = el('round-pass-actions');
  const failActions = el('round-fail-actions');

  if (result.passed) {
    passActions?.classList.remove('hidden');
    failActions?.classList.add('hidden');
    _wireBtnOnce('round-next-round-btn', async () => {
      // If section/unit/lesson complete, route to celebration first
      if (result.sectionComplete) {
        const round = getRound(result.roundId);
        cb.onSectionComplete?.({
          sectionTitle: _getSectionTitle(result),
          xp:          1000,
          nextRoundId: getNextRoundId(result.roundId)
        });
        return;
      }
      if (result.unitComplete) {
        const round = getRound(result.roundId);
        cb.onUnitComplete?.({
          bookTitle:   _getBookTitle(result.roundId),
          xp:          200,
          nextRoundId: getNextRoundId(result.roundId)
        });
        return;
      }
      if (result.lessonComplete) {
        cb.onLessonComplete?.({
          lessonTitle: getRound(result.roundId)?.lessonTitle || '',
          passageRef:  getRound(result.roundId)?.passageRef  || '',
          xp:          100,
          nextRoundId: getNextRoundId(result.roundId)
        });
        return;
      }
      // Plain next round
      const nextId = getNextRoundId(result.roundId);
      if (nextId) {
        cb.onNextRound?.(nextId);
      } else {
        cb.onBackToPath?.();
      }
    });
    _wireBtnOnce('round-back-path-btn', () => cb.onBackToPath?.());
  } else {
    passActions?.classList.add('hidden');
    failActions?.classList.remove('hidden');
    _wireBtnOnce('round-study-again-btn', () => cb.onStudyAgain?.(result.roundId));
    _wireBtnOnce('round-retry-btn',       () => cb.onRetry?.(result.roundId));
    _wireBtnOnce('round-fail-back-btn',   () => cb.onBackToPath?.());
  }
}

// Clone button to remove stale listeners, then attach new one
function _wireBtnOnce(id, handler) {
  const old = el(id);
  if (!old) return;
  const newBtn = old.cloneNode(true);
  old.parentNode.replaceChild(newBtn, old);
  newBtn.addEventListener('click', handler);
}

// ============================================
// HELPERS — derive section/book titles from roundId
// ============================================

function _getSectionTitle(result) {
  // e.g. "GEN-01-A" → section 1 = The Pentateuch
  // path.service.js getPathStructure() could be used here,
  // but to keep this file lean we derive from sectionId.
  const SECTION_NAMES = {
    1: 'The Pentateuch',
    2: 'Historical Books',
    3: 'Wisdom & Poetry',
    4: 'Major Prophets',
    5: 'Minor Prophets',
    6: 'The Gospels',
    7: 'Acts & The Epistles',
    8: 'Revelation'
  };
  if (result.sectionId) {
    const num = parseInt(String(result.sectionId).replace(/\D/g, ''));
    return SECTION_NAMES[num] || `Section ${num}`;
  }
  return 'Section Complete';
}

function _getBookTitle(roundId) {
  const BOOK_NAMES = {
    GEN: 'Genesis', EXO: 'Exodus', LEV: 'Leviticus', NUM: 'Numbers', DEU: 'Deuteronomy',
    JOS: 'Joshua', JDG: 'Judges', RUT: 'Ruth',
    SA1: '1 Samuel', SA2: '2 Samuel', KG1: '1 Kings', KG2: '2 Kings',
    CH1: '1 Chronicles', CH2: '2 Chronicles', EZR: 'Ezra', NEH: 'Nehemiah', EST: 'Esther',
    JOB: 'Job', PSA: 'Psalms', PRO: 'Proverbs', ECC: 'Ecclesiastes', SOS: 'Song of Solomon',
    ISA: 'Isaiah', JER: 'Jeremiah', LAM: 'Lamentations', EZK: 'Ezekiel', DAN: 'Daniel',
    HOS: 'Hosea', JOL: 'Joel', AMO: 'Amos', OBA: 'Obadiah', JON: 'Jonah', MIC: 'Micah',
    NAH: 'Nahum', HAB: 'Habakkuk', ZEP: 'Zephaniah', HAG: 'Haggai', ZEC: 'Zechariah', MAL: 'Malachi',
    MAT: 'Matthew', MRK: 'Mark', LUK: 'Luke', JHN: 'John',
    ACT: 'Acts', ROM: 'Romans', CO1: '1 Corinthians', CO2: '2 Corinthians',
    GAL: 'Galatians', EPH: 'Ephesians', PHP: 'Philippians', COL: 'Colossians',
    TH1: '1 Thessalonians', TH2: '2 Thessalonians', TI1: '1 Timothy', TI2: '2 Timothy',
    TIT: 'Titus', PHM: 'Philemon', HEB: 'Hebrews', JAS: 'James',
    PE1: '1 Peter', PE2: '2 Peter', JN1: '1 John', JN2: '2 John', JN3: '3 John',
    JUD: 'Jude', REV: 'Revelation'
  };
  const code = (roundId || '').split('-')[0];
  return BOOK_NAMES[code] || code;
}

function _setText(id, text) {
  const node = el(id);
  if (node) node.textContent = text;
}

export default { initRoundResultScreen };
