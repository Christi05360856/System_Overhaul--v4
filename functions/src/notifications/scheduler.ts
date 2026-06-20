// ============================================
// SCRIPTUREQUEST V5 — scheduler.ts
// Cloud Functions: Scheduled notifications
//
// 1. checkLeaderboardOvertakes — every 30 min
// 2. sendStreakReminders — daily at 9:00 AM (all users)
// 3. sendStreakRemindersEvening — daily at 7:00 PM (incomplete users only)
// 4. sendChallengeNotifications — every 15 min
// 5. sendBattleNotifications — every 5 min (online + active users only)
//
// Deploy all:
//   firebase deploy --only functions
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

// ── Helper: send push to a single user ──
async function sendPushToUser(
  uid: string,
  title: string,
  body: string,
  data: Record<string, string> = {},
  tag: string = 'sq-general'
): Promise<void> {
  try {
    const tokenDoc = await db.collection('userPushTokens').doc(uid).get();
    if (!tokenDoc.exists) return;

    const tokens: string[] = tokenDoc.data()?.tokens || [];
    if (!tokens.length) return;

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: { title, body },
      webpush: {
        notification: {
          title,
          body,
          icon:  '/icons/icon-192.png',
          badge: '/icons/badge-72.png',
          tag,
          vibrate: [200, 100, 200],
          requireInteraction: false
        },
        fcmOptions: { link: data.url || '/' }
      },
      data
    };

    const response = await messaging.sendEachForMulticast(message);
    console.log(`[Scheduler] Push to ${uid}: ${response.successCount} ok, ${response.failureCount} failed`);

    // Remove stale tokens
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
  } catch (err: any) {
    console.error(`[Scheduler] Push failed for ${uid}:`, err.message);
  }
}

// ── Helper: throttle check ──
async function isThrottled(uid: string, notifType: string, ms: number): Promise<boolean> {
  const ref = db.collection('notifThrottle').doc(uid);
  const snap = await ref.get();
  const lastField = `last${notifType}Notif`;
  const lastSent = snap.exists ? (snap.data()?.[lastField]?.toMillis?.() || 0) : 0;
  if (Date.now() - lastSent < ms) return true;
  await ref.set({ [lastField]: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return false;
}

// ═══════════════════════════════════════════
// 1. LEADERBOARD OVERTAKE (existing)
// ═══════════════════════════════════════════

export const checkLeaderboardOvertakes = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    const weekId = getCurrentWeekId();

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

    const currentRanks: Record<string, number> = {};
    const currentNames: Record<string, string> = {};
    entriesSnap.docs.forEach((doc, idx) => {
      currentRanks[doc.id]  = idx + 1;
      currentNames[doc.id]  = doc.data().displayName || 'Someone';
    });

    const snapshotRef  = db.collection('leaderboardSnapshots').doc(weekId);
    const snapshotSnap = await snapshotRef.get();
    const previousRanks: Record<string, number> =
      snapshotSnap.exists ? (snapshotSnap.data()?.ranks || {}) : {};

    await snapshotRef.set({
      ranks:   currentRanks,
      names:   currentNames,
      savedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (!snapshotSnap.exists) {
      console.log('[Scheduler] First snapshot saved — nothing to compare yet');
      return null;
    }

    const notifyJobs: Promise<void>[] = [];

    for (const uid of Object.keys(previousRanks)) {
      const oldRank = previousRanks[uid];
      const newRank = currentRanks[uid];

      const droppedOutTop3  = oldRank <= 3  && (!newRank || newRank > 3);
      const droppedOutTop10 = oldRank <= 10 && (!newRank || newRank > 10);
      const slippedInTop3   = oldRank <= 3  && newRank && newRank > oldRank && newRank <= 3;

      if (!droppedOutTop3 && !droppedOutTop10 && !slippedInTop3) continue;

      const overtakerUid = Object.keys(currentRanks).find(
        u => currentRanks[u] === oldRank && u !== uid
      );
      const overtakerName = overtakerUid ? (currentNames[overtakerUid] || 'Someone') : 'Someone';

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

      const throttled = await isThrottled(uid, 'Overtake', 60 * 60 * 1000);
      if (!throttled) {
        notifyJobs.push(sendPushToUser(uid, title, body, {
          type: 'overtake', oldRank: String(oldRank), newRank: String(newRank || 0), url: '/'
        }, 'sq-overtake'));
      }
    }

    await Promise.allSettled(notifyJobs);
    console.log(`[Scheduler] Processed ${notifyJobs.length} overtake notifications`);
    return null;
  });

// ═══════════════════════════════════════════
// 2. STREAK REMINDERS — 9:00 AM (all users)
// ═══════════════════════════════════════════

export const sendStreakReminders = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .pubsub
  .schedule('0 9 * * *')  // 9:00 AM daily
  .timeZone('UTC')
  .onRun(async () => {
    console.log('[Scheduler] Morning streak reminders starting...');

    // Get all users who have push tokens and want reminders
    const tokenSnap = await db.collection('userPushTokens').limit(500).get();
    if (tokenSnap.empty) {
      console.log('[Scheduler] No push tokens found');
      return null;
    }

    const jobs: Promise<void>[] = [];

    for (const doc of tokenSnap.docs) {
      const uid = doc.id;
      const throttled = await isThrottled(uid, 'StreakMorning', 20 * 60 * 60 * 1000); // 20hr
      if (throttled) continue;

      jobs.push(sendPushToUser(
        uid,
        '🔥 Keep Your Streak Alive!',
        'Good morning! Take your daily quiz to keep your learning streak going.',
        { type: 'streak_reminder', time: 'morning', url: '/' },
        'sq-streak-morning'
      ));
    }

    await Promise.allSettled(jobs);
    console.log(`[Scheduler] Sent ${jobs.length} morning streak reminders`);
    return null;
  });

// ═══════════════════════════════════════════
// 3. STREAK REMINDERS — 7:00 PM (incomplete users only)
// ═══════════════════════════════════════════

export const sendStreakRemindersEvening = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .pubsub
  .schedule('0 19 * * *')  // 7:00 PM daily
  .timeZone('UTC')
  .onRun(async () => {
    console.log('[Scheduler] Evening streak reminders starting...');

    // Find users who started a lesson or quiz today but did not finish enough
    // to maintain their streak. We look at userProgress for "incomplete" activity.
    const tokenSnap = await db.collection('userPushTokens').limit(500).get();
    if (tokenSnap.empty) return null;

    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const jobs: Promise<void>[] = [];

    for (const doc of tokenSnap.docs) {
      const uid = doc.id;

      // Check if user has incomplete activity today
      const progressSnap = await db.collection('userProgress').doc(uid).get();
      if (!progressSnap.exists) continue;

      const progress = progressSnap.data() || {};
      const lastActivity = progress.updatedAt?.toMillis?.() || 0;
      const hasStarted = lastActivity > todayStart.getTime() - ONE_DAY_MS;
      const hasCompleted = progress.completedRounds &&
        Object.values(progress.completedRounds).some((r: any) => {
          const completedAt = r.completedAt ? new Date(r.completedAt).getTime() : 0;
          return completedAt > todayStart.getTime();
        });

      // Only notify users who started something but did not complete a round today
      if (!hasStarted || hasCompleted) continue;

      const throttled = await isThrottled(uid, 'StreakEvening', 20 * 60 * 60 * 1000);
      if (throttled) continue;

      jobs.push(sendPushToUser(
        uid,
        '⏰ Finish Your Daily Quiz!',
        'You started learning today but have not finished a round yet. Complete one now to keep your streak!',
        { type: 'streak_reminder', time: 'evening', url: '/' },
        'sq-streak-evening'
      ));
    }

    await Promise.allSettled(jobs);
    console.log(`[Scheduler] Sent ${jobs.length} evening streak reminders`);
    return null;
  });

// ═══════════════════════════════════════════
// 4. CHALLENGE NOTIFICATIONS — every 15 min
// Notify users when they receive a new challenge.
// ═══════════════════════════════════════════

export const sendChallengeNotifications = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    // Find challenges created in the last 15 minutes that have not been notified
    const fifteenMinAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 15 * 60 * 1000);

    const challengesSnap = await db
      .collection('challenges')
      .where('createdAt', '>', fifteenMinAgo)
      .where('notified', '!=', true)
      .limit(100)
      .get();

    if (challengesSnap.empty) {
      console.log('[Scheduler] No new challenges to notify');
      return null;
    }

    const jobs: Promise<void>[] = [];

    for (const doc of challengesSnap.docs) {
      const challenge = doc.data();
      const opponentUid = challenge.opponentId;
      if (!opponentUid) continue;

      // Mark as notified
      await doc.ref.update({ notified: true });

      const throttled = await isThrottled(opponentUid, 'Challenge', 30 * 60 * 1000); // 30min
      if (throttled) continue;

      const challengerName = challenge.challengerName || 'Someone';

      jobs.push(sendPushToUser(
        opponentUid,
        '⚔️ New Challenge!',
        `${challengerName} challenged you to a battle. Accept now!`,
        {
          type: 'challenge',
          challengeId: doc.id,
          challengerId: challenge.challengerId || '',
          url: '/?challenge=' + (challenge.code || '')
        },
        'sq-challenge'
      ));
    }

    await Promise.allSettled(jobs);
    console.log(`[Scheduler] Sent ${jobs.length} challenge notifications`);
    return null;
  });

// ═══════════════════════════════════════════
// 5. BATTLE NOTIFICATIONS — every 5 min
// Notify users of incoming battles ONLY when:
//   - They are online (internet active)
//   - They are actively using the app (green pulsating status)
// ═══════════════════════════════════════════

export const sendBattleNotifications = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const fiveMinAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);

    // Find pending matches created in the last 5 minutes where opponent has not been notified
    const matchesSnap = await db
      .collection('matches')
      .where('createdAt', '>', fiveMinAgo)
      .where('status', '==', 'waiting')
      .where('opponentNotified', '!=', true)
      .limit(100)
      .get();

    if (matchesSnap.empty) {
      console.log('[Scheduler] No new battles to notify');
      return null;
    }

    const jobs: Promise<void>[] = [];

    for (const doc of matchesSnap.docs) {
      const match = doc.data();
      const opponentUid = match.opponentId;
      if (!opponentUid) continue;

      // Check if opponent is online and active (green dot)
      const presenceSnap = await db.collection('presence').doc(opponentUid).get();
      if (!presenceSnap.exists) continue;

      const presence = presenceSnap.data() || {};
      const lastSeen = presence.lastSeen?.toMillis?.() || 0;
      const isOnline = presence.isOnline === true;
      const isActive = isOnline && (Date.now() - lastSeen < 90 * 1000); // 90s threshold

      if (!isActive) {
        console.log(`[Scheduler] Opponent ${opponentUid} not active, skipping battle notification`);
        continue;
      }

      // Mark as notified so we do not spam
      await doc.ref.update({ opponentNotified: true });

      const throttled = await isThrottled(opponentUid, 'Battle', 10 * 60 * 1000); // 10min
      if (throttled) continue;

      const creatorName = match.creatorName || 'Someone';

      jobs.push(sendPushToUser(
        opponentUid,
        '⚔️ Battle Incoming!',
        `${creatorName} started a battle with you. Join now!`,
        {
          type: 'battle',
          matchId: doc.id,
          creatorId: match.creatorId || '',
          url: '/?battle=' + doc.id
        },
        'sq-battle'
      ));
    }

    await Promise.allSettled(jobs);
    console.log(`[Scheduler] Sent ${jobs.length} battle notifications`);
    return null;
  });
