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
