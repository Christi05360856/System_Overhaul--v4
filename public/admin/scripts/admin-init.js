// ============================================
// admin-init.js  — Bible Battle Admin
// ============================================
// THIS is the ONE file loaded as type="module"
// in admin.html. It imports everything else and
// wires all onclick handlers. No race conditions.
// ============================================

import {
  auth, db,
  toggleTheme, initTheme, toggleSB, closeSB,
  showSec, getCurSec,
  adminLogin, adminLogout,
  togglePw, showConfirm, closeConfirm,
  startAuthListener, startCountdown
} from './admin-core.js';

import { loadOverview, loadTopWinners, loadRecentAttempts, confirmArchiveWeek }
  from './admin-overview.js';

import { loadRewards, filterRewards }
  from './admin-rewards.js';

import { loadUsers, filterUsers }
  from './admin-users.js';

import { loadQuestions, filterQuestions, openAddQ, editQ, closeQModal, saveQ, deleteQ }
  from './admin-questions.js';

import { loadLeaderboard }
  from './admin-leaderboard.js';

import { loadAnnouncements, openNewAnn, closeAnnModal, saveAnn }
  from './admin-announcements.js';

import { updatePreview, toggleSchedule, fillTemplate, clearNotif, sendNotif, loadNotifHistory }
  from './admin-notifications.js';

import { previewEpoch, confirmReset }
  from './admin-launch.js';

// ── Wire ALL onclick handlers to window ───────────────
// Theme & layout
window.toggleTheme       = toggleTheme;
window.toggleSB          = toggleSB;
window.closeSB           = closeSB;
window.showSec           = showSec;
window.togglePw          = togglePw;

// Auth
window.adminLogin        = adminLogin;
window.adminLogout       = adminLogout;

// Modals
window.closeConfirm      = closeConfirm;
window.closeQModal       = closeQModal;
window.closeAnnModal     = closeAnnModal;

// Overview
window.loadOverview      = loadOverview;
window.loadTopWinners    = loadTopWinners;
window.loadRecentAttempts= loadRecentAttempts;
window.confirmArchiveWeek= confirmArchiveWeek;

// Rewards
window.loadRewards       = loadRewards;
window.filterRewards     = filterRewards;
window.updateReward      = window._adminRewards?.updateReward;  // set by module

// Users
window.loadUsers         = loadUsers;
window.filterUsers       = filterUsers;
window.toggleBan         = window._adminUsers?.toggleBan;

// Questions
window.loadQuestions     = loadQuestions;
window.filterQuestions   = filterQuestions;
window.openAddQ          = openAddQ;
window.editQ             = editQ;
window.saveQ             = saveQ;
window.deleteQ           = deleteQ;

// Leaderboard
window.loadLeaderboard   = loadLeaderboard;
window.disqualify        = window._adminLB?.disqualify;

// Announcements
window.loadAnnouncements = loadAnnouncements;
window.openNewAnn        = openNewAnn;
window.closeAnnModal     = closeAnnModal;
window.saveAnn           = saveAnn;

// Notifications
window.updatePreview     = updatePreview;
window.toggleSchedule    = toggleSchedule;
window.fillT             = fillTemplate;
window.clearNotif        = clearNotif;
window.sendNotif         = sendNotif;
window.loadNotifHistory  = loadNotifHistory;

// Launch
window.previewEpoch      = previewEpoch;
window.confirmReset      = confirmReset;

// Refresh current section
window.refreshCurrent = () => ({
  overview:      loadOverview,
  users:         loadUsers,
  rewards:       loadRewards,
  questions:     loadQuestions,
  leaderboard:   loadLeaderboard,
  announce:      loadAnnouncements,
  notifications: loadNotifHistory,
  launch:        () => {}
}[getCurSec()] || loadOverview)();

// ── Auth state ─────────────────────────────────────────
initTheme();

startAuthListener(
  // Signed in
  (profile) => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard').style.display   = 'block';
    const name = profile.displayName || 'Admin';
    const sbN  = document.getElementById('sb-name');
    const sbAv = document.getElementById('sb-avatar');
    if (sbN)  sbN.textContent  = name;
    if (sbAv) sbAv.textContent = name.charAt(0).toUpperCase();

    startCountdown();

    // Load all sections in parallel — everything is ready because we're inside the module
    Promise.all([
      loadOverview(),
      loadUsers(),
      loadRewards(),
      loadQuestions(),
      loadLeaderboard(),
      loadAnnouncements(),
      loadNotifHistory()
    ]).catch(e => console.error('[Admin init]', e));
  },
  // Signed out
  () => {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('dashboard').style.display   = 'none';
    const btn = document.getElementById('admin-login-btn');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In'; }
  }
);

// ── Close modals on backdrop click ─────────────────────
document.addEventListener('click', e => {
  if (e.target.id === 'q-modal')       closeQModal();
  if (e.target.id === 'confirm-modal') closeConfirm();
  if (e.target.id === 'ann-modal')     closeAnnModal();
});

// ── Enter key on login ─────────────────────────────────
document.getElementById('admin-password')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') adminLogin();
});
document.getElementById('admin-email')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('admin-password').focus();
});
