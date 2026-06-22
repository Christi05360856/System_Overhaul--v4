// ============================================
// SCRIPTUREQUEST V5 — Notification Permission Gate
// ============================================
// Sits between onboarding finishing and the user
// ever reaching the real path screen. Per product
// decision: every user MUST grant notification
// permission to continue — no skip button.
//
// Handles three real browser states:
//   1. 'default'  — never asked yet. Show the request
//                    button, calling requestPermission()
//                    on tap (must be a real user gesture
//                    for the browser to honor the prompt).
//   2. 'granted'   — already allowed (e.g. replay flow,
//                    or a returning user somehow routed
//                    here again). Auto-advance immediately.
//   3. 'denied'    — permanently blocked at the browser
//                    level. requestPermission() CANNOT
//                    re-prompt once denied — browsers
//                    silently no-op it. So this state shows
//                    manual fix-it instructions + a
//                    "Try Again" button that re-checks
//                    Notification.permission after the user
//                    says they've changed it.
//
// Lazy-loaded — only imported when needed, same pattern
// as onboarding.page.js / path.page.js etc.
// ============================================

import { requestPushPermission } from '../services/notification.service.js';
import { showToast } from '../utils/toast.js';

let _onGranted = null;

const el = id => document.getElementById(id);

// ============================================
// PUBLIC: init the gate screen
// onGranted is called once permission is confirmed
// granted — the caller (app.js) then routes to path.
// ============================================

export function initNotificationGateScreen(onGranted) {
  _onGranted = onGranted || null;
  _render();
  _wireButtons();
}

// ============================================
// RENDER — branches on current Notification.permission
// ============================================

function _render() {
  const status = _getPermissionStatus();

  const defaultBlock = el('notif-gate-default');
  const deniedBlock   = el('notif-gate-denied');
  const grantedBlock  = el('notif-gate-granted');

  defaultBlock?.classList.toggle('hidden', status !== 'default' && status !== 'unsupported');
  deniedBlock?.classList.toggle('hidden', status !== 'denied');
  grantedBlock?.classList.toggle('hidden', status !== 'granted');

  // If the browser doesn't support push at all (rare, but possible on
  // some in-app browsers), don't trap the user forever — let them
  // through with a clear notice rather than an impossible requirement.
  if (status === 'unsupported') {
    const noteEl = el('notif-gate-unsupported-note');
    noteEl?.classList.remove('hidden');
  }

  if (status === 'granted') {
    // Already granted somehow (e.g. replay tour, browser already
    // had permission from before) — auto-advance after a brief beat
    // so the "granted" confirmation state is still visible momentarily.
    setTimeout(() => _finish(), 900);
  }
}

function _getPermissionStatus() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

// ============================================
// BUTTON WIRING
// ============================================

function _wireButtons() {
  _rewire('notif-gate-enable-btn', _handleEnableClick);
  _rewire('notif-gate-retry-btn', _handleRetryClick);
  _rewire('notif-gate-skip-unsupported-btn', _finish);
}

function _rewire(id, handler) {
  const old = el(id);
  if (!old) return;
  const fresh = old.cloneNode(true);
  old.parentNode.replaceChild(fresh, old);
  fresh.addEventListener('click', handler);
}

// ============================================
// ENABLE BUTTON — first attempt
// ============================================

async function _handleEnableClick() {
  const btn = el('notif-gate-enable-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Requesting…';
  }

  try {
    const result = await requestPushPermission();

    if (result.granted) {
      _showGrantedState();
      setTimeout(() => _finish(), 1100);
      return;
    }

    // Not granted — figure out why and re-render accordingly.
    // requestPushPermission() internally calls Notification.requestPermission(),
    // so by this point the real browser state is settled.
    _render();

    if (Notification.permission === 'denied') {
      showToast('Notifications were blocked. Follow the steps below to enable them.', 'warning', 5000);
    } else {
      showToast('Notifications are needed to continue. Please allow them to proceed.', 'warning', 4000);
    }

  } catch (err) {
    showToast(err.message || 'Something went wrong. Please try again.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-bell"></i> Enable Notifications';
    }
  }
}

// ============================================
// RETRY BUTTON — used after the user says they've
// manually changed their browser settings. Browsers
// won't let JS re-trigger the popup once denied, so
// this just re-checks the current real permission state.
// ============================================

async function _handleRetryClick() {
  const btn = el('notif-gate-retry-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking…';
  }

  // Small delay so the check doesn't feel instant/fake even though
  // it technically resolves immediately.
  await new Promise(r => setTimeout(r, 500));

  const status = Notification.permission;

  if (status === 'granted') {
    // Still need to actually fetch + save the token, since simply
    // having permission isn't the same as having a saved FCM token.
    try {
      const result = await requestPushPermission();
      if (result.granted) {
        _showGrantedState();
        setTimeout(() => _finish(), 1100);
        return;
      }
    } catch (err) {
      console.warn('[NotifGate] Token fetch after manual enable failed:', err.message);
    }
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-redo"></i> Try Again';
  }

  if (status !== 'granted') {
    showToast('Still blocked. Please double-check the steps above.', 'warning', 4000);
  }

  _render();
}

// ============================================
// VISUAL STATE HELPERS
// ============================================

function _showGrantedState() {
  el('notif-gate-default')?.classList.add('hidden');
  el('notif-gate-denied')?.classList.add('hidden');
  el('notif-gate-granted')?.classList.remove('hidden');
}

function _finish() {
  _onGranted?.();
  _onGranted = null;
}

export default { initNotificationGateScreen };
