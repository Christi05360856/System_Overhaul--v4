// ============================================
// SCRIPTUREQUEST V4 — completeBattle
// Called by each player after submitting answers.
// Server-side atomic completion — no client-side
// transaction needed, no race condition possible.
//
// Flow:
//   1. Client writes own score to match doc
//   2. Client calls completeBattle(matchId)
//   3. This function reads the match inside a
//      Firestore transaction
//   4. If both scores present → calculates winner,
//      writes status:'completed'
//   5. Both clients' onSnapshot listeners fire
//      and navigate to battle-result screen
// ============================================

import * as functions from 'firebase-functions';
import * as admin      from 'firebase-admin';
import { log, logError } from '../utils/helpers';

const db = admin.firestore();

export const completeBattle = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
  }

  const { matchId } = data;
  if (!matchId || typeof matchId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'matchId is required.');
  }

  const uid = context.auth.uid;
  log('completeBattle', 'Called', { uid, matchId });

  try {
    const matchRef = db.collection('matches').doc(matchId);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists) {
        throw new functions.https.HttpsError('not-found', 'Match not found.');
      }

      const match = snap.data()!;

      // Already completed — return result without writing
      if (match.status === 'completed') {
        return { alreadyCompleted: true, winnerId: match.winnerId };
      }

      // Not active yet (still waiting for opponent to join)
      if (match.status === 'waiting') {
        return { waiting: true };
      }

      const creatorScore  = match.creatorScore;
      const opponentScore = match.opponentScore;

      // Both scores must be present (not null/undefined)
      const creatorDone  = creatorScore  !== null && creatorScore  !== undefined;
      const opponentDone = opponentScore !== null && opponentScore !== undefined;

      if (!creatorDone || !opponentDone) {
        // One player hasn't submitted yet — nothing to do
        return { bothDone: false };
      }

      // Both submitted — calculate winner
      let winnerId: string;
      let winnerName: string | null = null;

      if (creatorScore > opponentScore) {
        winnerId   = match.creatorId;
        winnerName = match.creatorName;
      } else if (opponentScore > creatorScore) {
        winnerId   = match.opponentId;
        winnerName = match.opponentName;
      } else {
        winnerId = 'draw';
      }

      const resultText = winnerId === 'draw'
        ? "🤝 It's a draw! Well played by both!"
        : `🏆 ${winnerName} wins the battle!`;

      const existingMessages = match.messages || [];

      tx.update(matchRef, {
        status:      'completed',
        winnerId,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        messages: [
          ...existingMessages,
          {
            type:      'result',
            text:      resultText,
            timestamp: Date.now()
          }
        ]
      });

      log('completeBattle', 'Match completed', { matchId, winnerId });
      return { bothDone: true, winnerId };
    });

    return result;

  } catch (err: any) {
    if (err instanceof functions.https.HttpsError) throw err;
    logError('completeBattle', 'Unexpected error', err);
    throw new functions.https.HttpsError('internal', 'Failed to complete battle.');
  }
});
