import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getTodayBoundaries, log, logError } from '../utils/helpers';

const db        = admin.firestore();
const messaging = admin.messaging();

// Daily reminder — 9:00 AM UTC (adjust for your timezone)
export const sendDailyReminders = functions.pubsub
  .schedule('0 8 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    log('sendDailyReminders', 'Running daily reminders');

    const { start, end } = getTodayBoundaries();

    // Find users who have NOT completed a quiz today
    // and have push tokens registered
    const tokensSnap = await db.collection('userPushTokens').limit(500).get();
    if (tokensSnap.empty) { log('sendDailyReminders', 'No tokens found'); return null; }

    let sent = 0;
    const promises: Promise<any>[] = [];

    for (const tokenDoc of tokensSnap.docs) {
      const uid    = tokenDoc.id;
      const tokens = tokenDoc.data().tokens as string[];
      if (!tokens || tokens.length === 0) continue;

      // Check if user already completed quiz today
      const attemptsSnap = await db.collection('quizAttempts')
        .where('userId', '==', uid)
        .where('timestamp', '>=', start)
        .where('timestamp', '<', end)
        .limit(1).get();

      if (!attemptsSnap.empty) continue; // Already played today

      // Check notification preferences
      const userSnap = await db.collection('users').doc(uid).get();
      const prefs    = userSnap.data()?.notificationPrefs;
      if (prefs && prefs.remindersEnabled === false) continue;

      const message = {
        notification: { title: '📖 ScriptureQuest', body: 'Your daily Bible challenge awaits!' },
        data:         { type: 'daily_reminder', url: '/' },
        tokens
      };

      promises.push(
        messaging.sendEachForMulticast(message)
          .then(() => { sent++; })
          .catch(err => logError('sendDailyReminders', `Failed for ${uid}`, err))
      );
    }

    await Promise.allSettled(promises);
    log('sendDailyReminders', 'Complete', { sent });
    return null;
  });

// ============================================
// LEADERBOARD OVERTAKE WATCHER
// Runs every 30 minutes, checks top 10 changes
// Sends push to users who dropped in rank
// ============================================

import * as admin from 'firebase-admin';

// Store previous leaderboard snapshot in Firestore
// so we can compare on each run
export const checkLeaderboardOvertakes = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    const db        = admin.firestore();
    const messaging = admin.messaging();

    // Get current week ID
    const WEEK_EPOCH = new Date('2026-05-04T08:00:00Z').getTime();
    const weekNum    = Math.floor((Date.now() - WEEK_EPOCH) / (7*24*60*60*1000)) + 1;
    const weekId     = `2026-W${weekNum}`;

    // Get current top 15
    const snap = await db.collection('leaderboardWeekly')
      .doc(weekId).collection('entries')
      .orderBy('points','desc').limit(15).get();

    const current: {uid:string,name:string,rank:number}[] = [];
    snap.forEach((d,i) => current.push({ uid:d.id, name:d.data().displayName||'Anonymous', rank:i+1 }));

    // Get previous snapshot
    const prevRef  = db.collection('leaderboardSnapshots').doc(weekId);
    const prevSnap = await prevRef.get();
    const previous: {uid:string,rank:number}[] = prevSnap.exists ? prevSnap.data()!.entries : [];

    // Compare — find users who dropped
    const prevMap = new Map(previous.map(e => [e.uid, e.rank]));

    for (const entry of current) {
      const oldRank = prevMap.get(entry.uid);
      if (!oldRank) continue;

      // Only notify meaningful drops
      const droppedOutTop3  = oldRank <= 3  && entry.rank > 3;
      const droppedOutTop10 = oldRank <= 10 && entry.rank > 10;

      if (!droppedOutTop3 && !droppedOutTop10) continue;

      // Throttle: check last notification time
      const throttleRef  = db.collection('notificationThrottle').doc(entry.uid);
      const throttleSnap = await throttleRef.get();
      const lastSent     = throttleSnap.data()?.overtakeAt?.toMillis() || 0;
      if (Date.now() - lastSent < 60 * 60 * 1000) continue; // 1 hour

      // Get push token
      const tokenSnap = await db.collection('userPushTokens').doc(entry.uid).get();
      const tokens    = tokenSnap.data()?.tokens as string[] || [];
      if (!tokens.length) continue;

      // Find who overtook them
      const overtaker = current.find(e => e.rank === oldRank);

      const title = droppedOutTop3  ? '📉 You dropped out of Top 3!' : '⚠️ You left the Top 10!';
      const body  = `${overtaker?.name || 'Someone'} overtook you. Take your quiz now to reclaim your spot!`;

      try {
        await messaging.sendEachForMulticast({
          tokens,
          notification: { title, body },
          data: { type: 'overtake', url: '/' }
        });

        // Update throttle
        await throttleRef.set({ overtakeAt: admin.firestore.Timestamp.now() }, { merge: true });
      } catch (err) {
        console.error('[Scheduler] Push failed for', entry.uid, err);
      }
    }

    // Save current as new snapshot
    await prevRef.set({
      entries:   current,
      updatedAt: admin.firestore.Timestamp.now()
    });

    console.log(`[checkLeaderboardOvertakes] Checked ${current.length} entries`);
    return null;
  });
