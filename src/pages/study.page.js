// ============================================
// SCRIPTUREQUEST V5 — Study Card Page
// Shown before every learning-path round.
// Displays hook, teaching, key verse, memory
// prompt, and challenge fact, then lets the
// user tap "Begin Round".
// Lazy-loaded — only imported when needed.
// ============================================

import { getRound }      from '../services/path.service.js';
import { showToast }     from '../utils/toast.js';

// Module state
let _roundId    = null;
let _callbacks  = {};

// Element helper
const el = id => document.getElementById(id);

// ============================================
// INIT
// ============================================

export function initStudyScreen(roundId, callbacks) {
  _roundId   = roundId;
  _callbacks = callbacks || {};

  const round = getRound(roundId);
  if (!round) {
    showToast('Could not load study card.', 'error');
    _callbacks.onBack?.();
    return;
  }

  _render(round);
  _wireButtons(roundId, round);
}

// ============================================
// RENDER
// ============================================

function _render(round) {
  const card = round.studyCard || {};

  // Passage chip
  _setText('study-passage-chip', round.passageRef || '');

  // Hook
  _setText('study-hook', card.hook || '');

  // Title + lesson label
  _setText('study-card-title',  card.title      || round.lessonTitle || '');
  _setText('study-lesson-label', `${round.passageRef || ''} · ${round.lessonId || ''}`);

  // Teaching body — split paragraphs on \n\n
  const teachingEl = el('study-teaching-body');
  if (teachingEl) {
    const raw = card.teaching || '';
    // Split on double newlines or literal \n\n from JSON
    const paragraphs = raw.split(/\n\n+/).filter(p => p.trim());
    if (paragraphs.length > 1) {
      teachingEl.innerHTML = paragraphs
        .map(p => `<p class="study-teaching-para">${_escapeHTML(p.trim())}</p>`)
        .join('');
    } else {
      // Fallback: treat the whole thing as one block
      teachingEl.innerHTML = `<p class="study-teaching-para">${_escapeHTML(raw)}</p>`;
    }
  }

  // Key verse
  _setText('study-key-verse', card.keyVerse || '');

  // Memory prompt
  _setText('study-memory-prompt', card.memoryPrompt || '');

  // Challenge fact
  _setText('study-challenge-fact', card.challengeFact || '');

  // Round info bar
  const roundLetter = (round.lessonId || '').split('-').pop() || 'A';
  _setText('study-round-label', `Round ${roundLetter} · 7 Questions`);

  // Difficulty chip — derive from the questions array
  const questions = round.questions || [];
  const levels    = [...new Set(questions.map(q => q.difficultyLevel).filter(Boolean))];
  const chipText  = levels.length
    ? levels.map(_formatDifficulty).join(' → ')
    : 'Hard → Expert';
  _setText('study-difficulty-chip', chipText);

  // Scroll study area to top
  const scrollEl = document.querySelector('.study-scroll-area');
  if (scrollEl) scrollEl.scrollTop = 0;
}

// ============================================
// BUTTON WIRING
// ============================================

function _wireButtons(roundId, round) {
  // Back button
  const backBtn = el('study-back-btn');
  if (backBtn) {
    const newBack = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(newBack, backBtn);
    newBack.addEventListener('click', () => _callbacks.onBack?.());
  }

  // Theme toggle (mirrors quiz screen)
  const themeBtn = el('study-theme-btn');
  if (themeBtn) {
    const newTheme = themeBtn.cloneNode(true);
    themeBtn.parentNode.replaceChild(newTheme, themeBtn);
    newTheme.addEventListener('click', () => {
      import('../services/theme.service.js').then(m => m.toggleTheme());
    });
  }

  // Begin Round button
  const beginBtn = el('study-begin-btn');
  if (beginBtn) {
    const newBegin = beginBtn.cloneNode(true);
    beginBtn.parentNode.replaceChild(newBegin, beginBtn);
    newBegin.addEventListener('click', () => {
      _callbacks.onBeginRound?.(roundId);
    });
  }
}

// ============================================
// UTILITIES
// ============================================

function _setText(id, text) {
  const node = el(id);
  if (node) node.textContent = text;
}

function _escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _formatDifficulty(level) {
  const map = {
    HARD:       'Hard',
    VERY_HARD:  'Very Hard',
    EXPERT:     'Expert'
  };
  return map[level] || level;
}

export default { initStudyScreen };
