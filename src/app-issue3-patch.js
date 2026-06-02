// ============================================
// app.js — Issue 3 patch: Call announcements on login
// Find the initAuthListener block in app.js.
// Inside the onLogin callback (first argument),
// add the two lines marked with ← ADD after
// the existing initTheme call.
// ============================================

initAuthListener(
  async (user, profile, stats) => {
    await initTheme(profile);
    checkNewWeek();

    // ← ADD THESE TWO LINES:
    const { checkAndShowAnnouncements } = await import('./services/notification.service.js');
    checkAndShowAnnouncements().catch(e => console.warn('[Announce]', e.message));

    // ... rest of your existing onLogin code unchanged ...
    const code = getChallengeCodeFromURL();
    if (code) {
      // ...
    } else {
      showScreen('landing');
      initLandingScreen();
    }
  },
  () => {
    // onLogout — unchanged
  }
);
