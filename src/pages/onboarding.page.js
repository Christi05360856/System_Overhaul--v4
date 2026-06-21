
// ============================================
// SCRIPTUREQUEST V5 — Onboarding Sequence (REBUILT)
// ============================================
// REPLACES the earlier tooltip/spotlight version of
// this file entirely. That version pointed live
// tooltips at real UI elements (FABs, nav items).
// User testing showed that wasn't enough for new
// users to actually understand the app.
//
// This version is a full-screen, illustrated,
// slide-based walkthrough — its own self-contained
// flow shown BEFORE the user ever sees the real path
// screen. No live UI is shown during onboarding at
// all (pure illustration + text), so this can never
// break or be broken by changes to the real screens.
//
// Renders into #screen-onboarding-intro (a new screen
// div in index.html, sibling to #screen-path etc.).
// Routing into and out of this screen is handled by
// app.js — this file only renders slides and reports
// back via the onDone callback when the user finishes
// or explicitly skips.
// ============================================

import { ONBOARDING_SEEN_KEY } from '../utils/constants.js';

// ── Slide definitions ──
// icon: large emoji used as the illustration (no external
// image assets needed — keeps this fully self-contained).
// accent: which CSS accent variant to use for that slide's
// icon badge background (cycles through existing tokens).
const SLIDES = [
  {
    icon: '📖',
    accent: 'primary',
    title: 'Welcome to ScriptureQuest',
    body: 'A structured way to learn the entire Bible — one passage at a time, with quizzes, streaks, and friendly competition along the way.',
    isWelcome: true
  },
  {
    icon: '🗺️',
    accent: 'primary',
    title: 'The Learning Path',
    body: 'This is your home screen. Work through every book of the Bible in order. Tap a section to open it, then tap a round to start. Finish a round to unlock the next one.'
  },
  {
    icon: '📅',
    accent: 'warm',
    title: 'Daily Challenge',
    body: 'A quick timed quiz from the full question pool. You get two attempts a day, and it\'s the only thing that keeps your streak alive — so don\'t skip a day!'
  },
  {
    icon: '⚔️',
    accent: 'primary',
    title: 'Battle Mode',
    body: 'Challenge a friend head-to-head. Generate a code and share it, or challenge someone directly from the leaderboard. Made a mistake? You can cancel a pending challenge anytime before it\'s accepted.'
  },
  {
    icon: '🏆',
    accent: 'warm',
    title: 'Leaderboard',
    body: 'See how you rank against everyone this week. The green dot means someone\'s online right now — tap the sword icon next to their name to challenge them directly. Got a code from a friend? Enter it here to join instantly.'
  },
  {
    icon: '🎁',
    accent: 'success',
    title: 'Rewards',
    body: 'Earn points as you play and unlock real rewards at milestones. The top 3 on the weekly leaderboard also win prizes when the week resets.'
  },
  {
    icon: '👤',
    accent: 'primary',
    title: 'Your Profile',
    body: 'Customize your avatar, track your current and longest streak, and see every badge and achievement you\'ve unlocked along the way.'
  },
  {
    icon: '⚙️',
    accent: 'info',
    title: 'Settings',
    body: 'Switch between light and dark mode, manage notifications, contact support, or come back here anytime to replay this walkthrough.'
  },
  {
    icon: '🎉',
    accent: 'success',
    title: "You're All Set!",
    body: 'That\'s everything you need to get started. Jump in, start your first lesson, and build your streak from day one.',
    isClosing: true
  }
];

// ── Module state ──
let _currentSlide = 0;
let _onDone       = null;

// ── Element helper ──
const el = id => document.getElementById(id);

// ============================================
// PUBLIC: should onboarding run for this user?
// ============================================

export function shouldShowOnboarding() {
  try {
    return localStorage.getItem(ONBOARDING_SEEN_KEY) !== 'true';
  } catch {
    return false; // if localStorage is unavailable, don't force it
  }
}

export function markOnboardingSeen() {
  try { localStorage.setItem(ONBOARDING_SEEN_KEY, 'true'); } catch {}
}

// ============================================
// PUBLIC: init the onboarding screen
// Call this right before showing #screen-onboarding-intro.
// onDone is called when the user finishes or skips —
// the caller (app.js) is responsible for then routing
// to the real path screen.
// ============================================

export function initOnboardingScreen(onDone) {
  _onDone       = onDone || null;
  _currentSlide = 0;

  _renderSlide();
  _wireButtons();
}

// ============================================
// RENDER CURRENT SLIDE
// ============================================

function _renderSlide() {
  const slide = SLIDES[_currentSlide];
  if (!slide) return;

  const iconEl    = el('onb-slide-icon');
  const titleEl   = el('onb-slide-title');
  const bodyEl    = el('onb-slide-body');
  const badgeEl   = el('onb-slide-icon-badge');
  const skipBtn   = el('onb-skip-btn');
  const backBtn   = el('onb-back-btn');
  const nextBtn   = el('onb-next-btn');
  const dotsEl    = el('onb-dots');

  if (iconEl)  iconEl.textContent = slide.icon;
  if (titleEl) titleEl.textContent = slide.title;
  if (bodyEl)  bodyEl.textContent  = slide.body;

  if (badgeEl) {
    badgeEl.className = `onb-icon-badge onb-icon-badge--${slide.accent || 'primary'}`;
  }

  const isFirst = _currentSlide === 0;
  const isLast  = _currentSlide === SLIDES.length - 1;

  if (skipBtn) skipBtn.classList.toggle('hidden', isLast);
  if (backBtn) backBtn.classList.toggle('hidden', isFirst);
  if (nextBtn) {
    nextBtn.textContent = isLast ? "Let's Go!" : 'Next';
  }

  if (dotsEl) {
    dotsEl.innerHTML = SLIDES.map((_, i) =>
      `<span class="onb-dot ${i === _currentSlide ? 'onb-dot--active' : ''}"></span>`
    ).join('');
  }

  // Re-trigger entrance animation on the slide content
  const contentEl = el('onb-slide-content');
  if (contentEl) {
    contentEl.classList.remove('onb-slide-content--enter');
    void contentEl.offsetWidth; // reflow
    contentEl.classList.add('onb-slide-content--enter');
  }
}

// ============================================
// BUTTON WIRING
// ============================================

function _wireButtons() {
  _rewire('onb-skip-btn', _finish);
  _rewire('onb-back-btn', _goBack);
  _rewire('onb-next-btn', _goNext);
}

function _rewire(id, handler) {
  const old = el(id);
  if (!old) return;
  const fresh = old.cloneNode(true);
  old.parentNode.replaceChild(fresh, old);
  fresh.addEventListener('click', handler);
}

function _goNext() {
  if (_currentSlide < SLIDES.length - 1) {
    _currentSlide++;
    _renderSlide();
  } else {
    _finish();
  }
}

function _goBack() {
  if (_currentSlide > 0) {
    _currentSlide--;
    _renderSlide();
  }
}

function _finish() {
  markOnboardingSeen();
  _onDone?.();
  _onDone = null;
}

export default {
  shouldShowOnboarding,
  markOnboardingSeen,
  initOnboardingScreen
};
