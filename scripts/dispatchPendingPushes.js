// ============================================
// SCRIPTUREQUEST V5 — scripts/dispatchPendingPushes.js
// Run via GitHub Actions every 3 minutes.
//
// Processes the `pendingPushes` collection, which is
// already being written to by the client app
// (notification.service.js: notifyChallengeReceived,
// notifyBattleIncoming, notifyRematchReady) but had
// NOTHING consuming it until this script existed —
// those notifications were being silently created and
// never delivered.
//
// Logic:
//   1. Query pendingPushes where sent == false.
//   2. For each doc, load that uid's current FCM tokens.
//   3. Send the notification via FCM.
//   4. Mark the doc sent: true (kept, not deleted, for
//      a basic audit trail — Firestore storage cost for
//      this is negligible at free-tier scale).
//   5. Clean up stale/invalid tokens along the way.
//
// Near-instant delivery (3-minute worst case) without
// needing the Blaze plan or any Cloud Functions trigger.
// ============================================

const { initFirebaseAdmin } = require('./firebaseAdmin');

async function run() {
  console.log('[PendingPushes] Starting dispatch run');

  const admin = initFirebaseAdmin();
  const db = admin.firestore();
  const messaging = admin.messaging();

  const pendingSnap = await db
    .collection('pendingPushes')
    .where('sent', '==', false)
    .get();

  if (pendingSnap.empty) {
    console.log('[PendingPushes] Nothing pending — exiting.');
    return;
  }

  console.log(`[PendingPushes] ${pendingSnap.size} pending push(es) to process`);

  let sentCount = 0;
  let failedCount = 0;
  let skippedNoTokenCount = 0;

  for (const docSnap of pendingSnap.docs) {
    const pushData = docSnap.data();
    const { uid, title, body, data } = pushData;

    if (!uid) {
      console.warn(`[PendingPushes] Doc ${docSnap.id} has no uid — marking sent to avoid retry loop`);
      await docSnap.ref.update({ sent: true, sentAt: admin.firestore.FieldValue.serverTimestamp(), error: 'missing_uid' });
      continue;
    }

    try {
      const tokenSnap = await db.collection('userPushTokens').doc(uid).get();
      const tokens = tokenSnap.exists ? (tokenSnap.data().tokens || []) : [];

      if (!tokens.length) {
        skippedNoTokenCount++;
        // Still mark as sent — there's no token to retry with later,
        // so leaving it unsent would just have this doc reprocessed
        // forever on every future run for no benefit.
        await docSnap.ref.update({
          sent: true,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          error: 'no_push_token'
        });
        continue;
      }

      const message = {
        tokens,
        notification: { title: title || 'ScriptureQuest', body: body || '' },
        webpush: {
          notification: {
            title: title || 'ScriptureQuest',
            body: body || '',
            icon: '/icons/icon-192.png',
            badge: '/icons/badge-72.png',
            tag: data?.type || 'sq-push',
            vibrate: [200, 100, 200],
            requireInteraction: false,
            actions: [
              { action: 'take-quiz', title: '📝 Take Quiz Now' },
              { action: 'dismiss', title: 'Later' }
            ]
          },
          fcmOptions: { link: data?.url || '/' }
        },
        data: {
          ...(data || {}),
          url: data?.url || '/'
        },
        android: { ttl: 6 * 60 * 60 * 1000 } // 6 hour TTL, matches streak reminder policy
      };

      const response = await messaging.sendEachForMulticast(message);
      sentCount++;

      await docSnap.ref.update({
        sent: true,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        successCount: response.successCount,
        failureCount: response.failureCount
      });

      // Clean up stale/invalid tokens
      const staleTokens = [];
      response.responses.forEach((r, i) => {
        if (!r.success && (
          r.error?.code === 'messaging/registration-token-not-registered' ||
          r.error?.code === 'messaging/invalid-registration-token'
        )) {
          staleTokens.push(tokens[i]);
        }
      });

      if (staleTokens.length) {
        const freshTokens = tokens.filter(t => !staleTokens.includes(t));
        await tokenSnap.ref.update({ tokens: freshTokens });
        console.log(`[PendingPushes] Removed ${staleTokens.length} stale token(s) for ${uid}`);
      }

    } catch (err) {
      failedCount++;
      console.error(`[PendingPushes] Failed for doc ${docSnap.id} (uid ${uid}):`, err.message);
      // Mark as sent anyway after a single failed attempt to avoid an
      // infinite retry loop on a permanently broken doc. If this needs
      // real retry-with-backoff later, that's a deliberate future upgrade,
      // not something to guess at now.
      await docSnap.ref.update({
        sent: true,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        error: err.message
      }).catch(() => {});
    }
  }

  console.log(
    `[PendingPushes] Done. Sent: ${sentCount}, ` +
    `Skipped (no token): ${skippedNoTokenCount}, ` +
    `Failed: ${failedCount}`
  );
}

run().then(() => {
  console.log('[PendingPushes] Run complete.');
  process.exit(0);
}).catch(err => {
  console.error('[PendingPushes] Fatal error:', err);
  process.exit(1);
});

