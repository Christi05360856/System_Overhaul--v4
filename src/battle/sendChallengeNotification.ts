// ============================================
// SCRIPTUREQUEST V4 — sendChallengeNotification
// Called when User A directly challenges User B
// from the leaderboard.
//
// If User B is offline → sends FCM push notification
// (like the Duolingo-style one) with deep link back
// to the accept challenge modal.
//
// If User B is online → their Firestore listener on
// 'incomingChallenges' fires and shows the in-app
// full-screen modal directly (no FCM needed).
// This function handles the offline fallback only.
// ============================================

import * as functions from 'firebase-functions';
import * as admin      from 'firebase-admin';
import { log, logError } from '../utils/helpers';

const db        = admin.firestore();
const messaging = admin.messaging();

export const sendChallengeNotification = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
  }

  const { targetUid, challengerName, challengeCode, matchId } = data;

  if (!targetUid || !challengerName || !challengeCode || !matchId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
  }

  const uid = context.auth.uid;
  if (uid === targetUid) {
    throw new functions.https.HttpsError('invalid-argument', "You can't challenge yourself.");
  }

  log('sendChallengeNotification', 'Sending', { from: uid, to: targetUid, challengeCode });

  try {
    // Get target user's push tokens
    const tokenDoc = await db.collection('userPushTokens').doc(targetUid).get();
    if (!tokenDoc.exists) {
      // No tokens — user has no push permission, that's fine
      // The Firestore listener will still work if they're online
      return { sent: false, reason: 'no_token' };
    }

    const tokens: string[] = tokenDoc.data()?.tokens || [];
    if (!tokens.length) {
      return { sent: false, reason: 'no_token' };
    }

    // Check if target user is currently online via presence
    // If they're online, the Firestore listener handles it — no need for FCM
    const presenceDoc = await db.collection('presence').doc(targetUid).get();
    const lastSeen    = presenceDoc.data()?.lastSeen?.toMillis?.() || 0;
    const isOnline    = Date.now() - lastSeen < 90_000; // 90 seconds = online

    if (isOnline) {
      // Online users get in-app modal via Firestore listener
      // Still send FCM as backup in case their tab is backgrounded
      log('sendChallengeNotification', 'Target is online, sending backup FCM', { targetUid });
    }

    const appUrl = functions.config().app?.url || 'https://scripture-quest.vercel.app';

    // Send multicast FCM to all tokens
    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: `⚔️ ${challengerName} challenged you!`,
        body:  `Accept the Bible quiz battle challenge! Code: ${challengeCode}`
      },
      data: {
        type:          'direct_challenge',
        challengeCode,
        matchId,
        challengerName,
        url:           `${appUrl}/?challenge=${challengeCode}`
      },
      webpush: {
        notification: {
          title:   `⚔️ ${challengerName} challenged you!`,
          body:    `Accept the Bible quiz battle! Code: ${challengeCode}`,
          icon:    `${appUrl}/icons/icon-192.png`,
          badge:   `${appUrl}/icons/badge-72.png`,
          tag:     `sq-challenge-${matchId}`,
          vibrate: [200, 100, 200, 100, 200],
          actions: [
            { action: 'accept',  title: '⚔️ Accept Challenge' },
            { action: 'decline', title: 'Maybe Later'         }
          ]
        },
        fcmOptions: {
          link: `${appUrl}/?challenge=${challengeCode}`
        }
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'challenges',
          priority:  'max',
          sound:     'default'
        }
      }
    };

    const response = await messaging.sendEachForMulticast(message);
    log('sendChallengeNotification', 'FCM sent', {
      successCount: response.successCount,
      failureCount: response.failureCount
    });

    // Clean up invalid tokens
    const invalidTokens: string[] = [];
    response.responses.forEach((resp, i) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered') {
          invalidTokens.push(tokens[i]);
        }
      }
    });

    if (invalidTokens.length) {
      const validTokens = tokens.filter(t => !invalidTokens.includes(t));
      await db.collection('userPushTokens').doc(targetUid).update({
        tokens: validTokens,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return { sent: true, successCount: response.successCount };

  } catch (err: any) {
    if (err instanceof functions.https.HttpsError) throw err;
    logError('sendChallengeNotification', 'Error', err);
    // Non-fatal — app still works via Firestore listener
    return { sent: false, reason: err.message };
  }
});
