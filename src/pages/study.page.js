// ============================================
// SCRIPTUREQUEST V5 — Study Card Page
// Shown before every learning-path round.
// Displays hook, teaching, key verse, memory
// prompt, and challenge fact, then lets the
// user tap "Begin Round".
// Lazy-loaded — only imported when needed.
//
// UPDATE: Study cards now use bullet points
// (5-6 items, 20-50 words each) for easier reading.
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

  // Teaching body — show as bullet points for easy reading.
  // Each bullet should be 20-50 words, covering key takeaways.
  // If the data comes as an array of bullets, use them directly.
  // If it comes as plain text, split into sentences and group.
  const teachingEl = el('study-teaching-body');
  if (teachingEl) {
    const raw = card.teaching || '';

    if (Array.isArray(raw) && raw.length > 0) {
      // Data already comes as bullet array
      teachingEl.innerHTML = raw
        .filter(b => String(b).trim())
        .map(b => `<li class="study-bullet">${_escapeHTML(String(b).trim())}</li>`)
        .join('');
      teachingEl.tagName === 'UL' || (teachingEl.innerHTML = `<ul class="study-bullet-list">${teachingEl.innerHTML}</ul>`);
    } else if (typeof raw === 'string' && raw.trim()) {
      // Split text into bullet points
      // First try splitting by double newlines, then by sentence groups
      let bullets = raw.split(/\n\n+/).filter(p => p.trim());
      if (bullets.length < 3) {
        // Not enough paragraphs — split by sentences and group
        const sentences = raw.match(/[^.!?]+[.!?]+/g) || [raw];
        bullets = [];
        let current = '';
        sentences.forEach(s => {
          current += ' ' + s.trim();
          if (current.length > 40) {
            bullets.push(current.trim());
            current = '';
          }
        });
        if (current.trim()) bullets.push(current.trim());
      }
      // Limit to 5-6 bullets, each 20-50 words
      bullets = bullets.slice(0, 6).map(b => {
        const words = b.trim().split(/\s+/);
        if (words.length > 50) return words.slice(0, 50).join(' ') + '...';
        return b.trim();
      });
      teachingEl.innerHTML = `<ul class="study-bullet-list">${
        bullets.map(b => `<li class="study-bullet">${_escapeHTML(b)}</li>`).join('')
      }</ul>`;
    } else {
      teachingEl.innerHTML = '';
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

  // Passing requirement notice
  const noticeEl = el('study-passing-notice');
  if (noticeEl) {
    const total = questions.length || 7;
    const needed = Math.ceil(total * 0.7);
    noticeEl.innerHTML = `
      <div class="passing-notice-box">
        <span class="passing-notice-icon">🎯</span>
        <p class="passing-notice-text">
          You need <strong>${needed} out of ${total}</strong> correct to pass.
        </p>
        <p class="passing-notice-sub">Take your time. You can review this card anytime.</p>
      </div>
    `;
    noticeEl.classList.remove('hidden');
  }

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
