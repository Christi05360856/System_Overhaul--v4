// ============================================
// SCRIPTUREQUEST V4 — scheduler.ts
// Cloud Function: Leaderboard overtake push
// Runs every 30 minutes via Cloud Scheduler.
// Compares current vs cached leaderboard snapshot,
// sends FCM push to any user who dropped.
// ============================================
// Deploy: firebase deploy --only functions:checkLeaderboardOvertakes
// ============================================

import * as functions  from 'firebase-functions';
import * as admin      from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();

const db        = admin.firestore();
const messaging = admin.messaging();

// ── Helper: get current week ID (matches client utils/week.js) ──
function getCurrentWeekId(): string {
  const EPOCH    = new Date('2026-05-04T08:00:00Z').getTime();
  const MS_WEEK  = 7 * 24 * 60 * 60 * 1000;
  const weekNum  = Math.floor((Date.now() - EPOCH) / MS_WEEK);
  return `week_${weekNum}`;
}

// ── Snapshot cache collection: leaderboardSnapshots/{weekId} ──
// Each document: { ranks: { [uid]: number }, savedAt: Timestamp }

export const checkLeaderboardOvertakes = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    const weekId = getCurrentWeekId();

    // 1. Fetch current leaderboard
    const entriesSnap = await db
      .collection('leaderboardWeekly').doc(weekId)
      .collection('entries')
      .orderBy('points', 'desc')
      .limit(50)
      .get();

    if (entriesSnap.empty) {
      console.log('[Scheduler] No leaderboard entries yet for', weekId);
      return null;
    }

    // Build current rank map: { uid: rank }
    const currentRanks: Record<string, number> = {};
    const currentNames: Record<string, string> = {};
    entriesSnap.docs.forEach((doc, idx) => {
      currentRanks[doc.id]  = idx + 1;
      currentNames[doc.id]  = doc.data().displayName || 'Someone';
    });

    // 2. Load previous snapshot
    const snapshotRef  = db.collection('leaderboardSnapshots').doc(weekId);
    const snapshotSnap = await snapshotRef.get();
    const previousRanks: Record<string, number> =
      snapshotSnap.exists ? (snapshotSnap.data()?.ranks || {}) : {};

    // 3. Save current as new snapshot
    await snapshotRef.set({
      ranks:   currentRanks,
      names:   currentNames,
      savedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // If no previous snapshot, nothing to compare yet
    if (!snapshotSnap.exists) {
      console.log('[Scheduler] First snapshot saved — nothing to compare yet');
      return null;
    }

    // 4. Find users who dropped and should be notified
    const notifyJobs: Promise<void>[] = [];

    for (const uid of Object.keys(previousRanks)) {
      const oldRank = previousRanks[uid];
      const newRank = currentRanks[uid]; // undefined if they fell off top 50

      // Determine if drop is notification-worthy
      const droppedOutTop3  = oldRank <= 3  && (!newRank || newRank > 3);
      const droppedOutTop10 = oldRank <= 10 && (!newRank || newRank > 10);
      const slippedInTop3   = oldRank <= 3  && newRank && newRank > oldRank && newRank <= 3;

      if (!droppedOutTop3 && !droppedOutTop10 && !slippedInTop3) continue;

      // Find who overtook them (person now at their old rank)
      const overtakerUid = Object.keys(currentRanks).find(
        u => currentRanks[u] === oldRank && u !== uid
      );
      const overtakerName = overtakerUid ? (currentNames[overtakerUid] || 'Someone') : 'Someone';

      // Build notification message
      let title: string, body: string;
      if (droppedOutTop3) {
        title = '📉 You dropped out of Top 3!';
        body  = `${overtakerName} overtook you. Take your quiz now to reclaim your spot!`;
      } else if (droppedOutTop10) {
        title = '⚠️ You left the Top 10!';
        body  = `${overtakerName} passed you on the leaderboard. Get back in!`;
      } else {
        title = '🔥 You slipped in Top 3!';
        body  = `${overtakerName} just passed you. Quiz now to reclaim your spot!`;
      }

      notifyJobs.push(sendPushToUser(uid, title, body, oldRank, newRank));
    }

    await Promise.allSettled(notifyJobs);
    console.log(`[Scheduler] Processed ${notifyJobs.length} overtake notifications`);
    return null;
  });

// ── Send push notification to a single user ──
async function sendPushToUser(
  uid: string,
  title: string,
  body: string,
  oldRank: number,
  newRank: number | undefined
): Promise<void> {
  try {
    // Get their FCM tokens
    const tokenDoc = await db.collection('userPushTokens').doc(uid).get();
    if (!tokenDoc.exists) return;

    const tokens: string[] = tokenDoc.data()?.tokens || [];
    if (!tokens.length) return;

    // Throttle: check last notification time in Firestore
    const throttleRef  = db.collection('notifThrottle').doc(uid);
    const throttleSnap = await throttleRef.get();
    const lastSent     = throttleSnap.exists
      ? (throttleSnap.data()?.lastOvertakeNotif?.toMillis() || 0)
      : 0;

    const ONE_HOUR = 60 * 60 * 1000;
    if (Date.now() - lastSent < ONE_HOUR) {
      console.log(`[Scheduler] Throttled notification for ${uid} (sent < 1hr ago)`);
      return;
    }

    // Send FCM multicast
    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: { title, body },
      webpush: {
        notification: {
          title,
          body,
          icon:  '/icons/icon-192.png',
          badge: '/icons/badge-72.png',
          tag:   'sq-overtake',
          vibrate: [200, 100, 200],
          requireInteraction: false,
          actions: [
            { action: 'take-quiz', title: '📝 Take Quiz Now' },
            { action: 'dismiss',   title: 'Later' }
          ]
        },
        fcmOptions: { link: '/' }
      },
      data: {
        type:    'overtake',
        oldRank: String(oldRank),
        newRank: String(newRank || 0),
        url:     '/'
      }
    };

    const response = await messaging.sendEachForMulticast(message);
    console.log(`[Scheduler] Push sent to ${uid}: ${response.successCount} ok, ${response.failureCount} failed`);

    // Remove stale/invalid tokens
    const staleTokens: string[] = [];
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
      await tokenDoc.ref.update({ tokens: freshTokens });
      console.log(`[Scheduler] Removed ${staleTokens.length} stale tokens for ${uid}`);
    }

    // Update throttle timestamp
    await throttleRef.set({
      lastOvertakeNotif: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

  } catch (err: any) {
    console.error(`[Scheduler] Push failed for ${uid}:`, err.message);
  }
}
