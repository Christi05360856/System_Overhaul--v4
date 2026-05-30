import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  getCurrentWeekId, getTodayDateString, getTodayBoundaries,
  calculateXp, calculateLevel, calculateStreak, calculateScore,
  isSuspiciousSubmission, safeCommit, log, logError
} from '../utils/helpers';

const db = admin.firestore();

interface SubmitData { sessionId: string; answers: Record<string, number>; }

export const submitQuizSession = functions.https.onCall(async (data: SubmitData, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
  const uid = context.auth.uid;
  const { sessionId, answers } = data;

  if (!sessionId) throw new functions.https.HttpsError('invalid-argument', 'sessionId required.');
  if (!answers || typeof answers !== 'object') throw new functions.https.HttpsError('invalid-argument', 'answers required.');

  log('submitQuizSession', 'Submission received', { uid, sessionId });

  try {
    const sessionRef  = db.collection('quizSessions').doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) throw new functions.https.HttpsError('not-found', 'Session not found.',
      { userMessage: 'Quiz session not found. Please start a new quiz.' });

    const session = sessionSnap.data()!;
    if (session.userId !== uid) throw new functions.https.HttpsError('permission-denied', 'Not your session.');
    if (session.completed) throw new functions.https.HttpsError('already-exists', 'Already submitted.',
      { userMessage: 'This quiz has already been submitted.' });

    const submittedAt = new Date();

    // Anti-cheat: impossible speed
    if (isSuspiciousSubmission(session.createdAt, submittedAt, session.questionIds.length)) {
      log('submitQuizSession', 'SUSPICIOUS: impossible speed', { uid, sessionId });
      db.collection('adminLogs').add({ adminId: 'SYSTEM', action: 'suspicious_activity',
        targetId: uid, metadata: { sessionId, type: 'impossible_speed' },
        timestamp: admin.firestore.Timestamp.now() });
    }

    // Duplicate submission guard
    const dupSnap = await db.collection('quizAttempts')
      .where('userId', '==', uid).where('sessionId', '==', sessionId).limit(1).get();
    if (!dupSnap.empty) throw new functions.https.HttpsError('already-exists', 'Duplicate.',
      { userMessage: 'This quiz has already been recorded.' });

    const questionIds = session.questionIds as string[];
    const questionDocs = await fetchFullQuestions(questionIds);

    // Server-side scoring
    const { score, percentage, allAnswered, passed } = calculateScore(answers, questionDocs, questionIds.length);

    // User stats
    const statsRef  = db.collection('userStats').doc(uid);
    const statsSnap = await statsRef.get();
    const stats     = statsSnap.exists ? statsSnap.data()! : {
      totalXp: 0, level: 1, currentLevelXp: 0, currentStreak: 0,
      longestStreak: 0, quizzesTaken: 0, bestScore: 0, perfectScores: 0
    };

    const xpResult   = calculateXp(score, questionIds.length, stats.currentStreak, allAnswered);
    const newTotalXp = (stats.totalXp || 0) + xpResult.totalXp;
    const levelResult = calculateLevel(newTotalXp, stats.level || 1);

    const dailyRef   = db.collection('userDailyState').doc(uid);
    const dailySnap  = await dailyRef.get();
    const lastDate   = dailySnap.exists ? dailySnap.data()!.lastQuizDate : null;
    const streakResult = calculateStreak(lastDate, stats.currentStreak || 0, stats.longestStreak || 0);

    const weekId   = getCurrentWeekId();
    const todayStr = getTodayDateString();
    const achievements = checkAchievements(stats, score, questionIds.length, percentage,
      streakResult.newStreak, levelResult.newLevel);

    const batch = db.batch();

    // Mark session complete
    batch.update(sessionRef, { completed: true, validated: true,
      submittedAt: admin.firestore.Timestamp.fromDate(submittedAt),
      answers, score, percentage, xpEarned: xpResult.totalXp });

    // Immutable attempt record
    batch.set(db.collection('quizAttempts').doc(), {
      userId: uid, sessionId, score, totalQuestions: questionIds.length,
      percentage, xpEarned: xpResult.totalXp, allAnswered,
      timestamp: admin.firestore.Timestamp.fromDate(submittedAt), weekId, validated: true });

    // Update userStats
    batch.set(statsRef, {
      totalXp: newTotalXp, level: levelResult.newLevel,
      currentLevelXp: levelResult.currentLevelXp,
      currentStreak: streakResult.newStreak, longestStreak: streakResult.longestStreak,
      quizzesTaken: admin.firestore.FieldValue.increment(1),
      bestScore: Math.max(stats.bestScore || 0, percentage),
      perfectScores: score === questionIds.length ? admin.firestore.FieldValue.increment(1) : (stats.perfectScores || 0),
      updatedAt: admin.firestore.Timestamp.fromDate(submittedAt)
    }, { merge: true });

    // Update userDailyState
    const existingHistory: string[] = dailySnap.exists ? (dailySnap.data()!.questionHistory || []) : [];
    const newHistory = [...new Set([...existingHistory, ...questionIds])].slice(-100);
    batch.set(dailyRef, { todayQuizCount: admin.firestore.FieldValue.increment(1),
      lastQuizDate: todayStr, questionHistory: newHistory,
      updatedAt: admin.firestore.Timestamp.fromDate(submittedAt) }, { merge: true });

    // Update leaderboard
    batch.set(db.collection('leaderboardWeekly').doc(weekId).collection('entries').doc(uid), {
      userId: uid, displayName: context.auth.token.name || 'Anonymous',
      points: admin.firestore.FieldValue.increment(xpResult.totalXp),
      level: levelResult.newLevel, streak: streakResult.newStreak,
      quizzesTaken: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.Timestamp.fromDate(submittedAt)
    }, { merge: true });

    await safeCommit(batch, 'submitQuizSession');

    // Question analytics (non-blocking)
    updateQuestionAnalytics(questionDocs, answers).catch(() => {});

    log('submitQuizSession', 'Complete', { uid, score, percentage, xpEarned: xpResult.totalXp });

    return {
      score, totalQuestions: questionIds.length, percentage, passed,
      xpEarned: xpResult.totalXp,
      xpBreakdown: { base: xpResult.baseXp, accuracy: xpResult.accuracyBonus,
        completion: xpResult.completionBonus, streak: xpResult.streakBonus },
      totalXp: newTotalXp, leveledUp: levelResult.leveledUp,
      oldLevel: levelResult.oldLevel, newLevel: levelResult.newLevel,
      streak: streakResult.newStreak, streakBroken: streakResult.streakBroken,
      longestStreak: streakResult.longestStreak,
      weeklyPoints: xpResult.totalXp, achievementUnlocks: achievements, badgeUnlocks: []
    };

  } catch (err: any) {
    if (err instanceof functions.https.HttpsError) throw err;
    logError('submitQuizSession', 'Error', err);
    throw new functions.https.HttpsError('internal', 'Submission failed. Please try again.');
  }
});

async function fetchFullQuestions(ids: string[]) {
  const results: any[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await db.collection('questions')
      .where(admin.firestore.FieldPath.documentId(), 'in', ids.slice(i, i + 30)).get();
    snap.forEach(d => results.push({ id: d.id, ...d.data() }));
  }
  return ids.map(id => results.find(q => q.id === id)).filter(Boolean);
}

function checkAchievements(stats: any, score: number, total: number,
  pct: number, streak: number, level: number): string[] {
  const unlocks: string[] = [];
  const count = (stats.quizzesTaken || 0) + 1;
  if (pct === 100)        unlocks.push('Perfect Score! 🏆');
  if (streak === 7)       unlocks.push('7-Day Streak! 🔥');
  if (streak === 30)      unlocks.push('30-Day Streak! 🌟');
  if (count === 10)       unlocks.push('10 Quizzes Completed! 📚');
  if (count === 50)       unlocks.push('50 Quizzes — Bible Scholar! 🎓');
  if (count === 100)      unlocks.push('100 Quizzes — Legend! 👑');
  if (level === 5)        unlocks.push('Level 5 Reached! ⭐');
  if (level === 10)       unlocks.push('Level 10 — Bible Expert! 🏅');
  return unlocks;
}

async function updateQuestionAnalytics(questions: any[], answers: Record<string, number>) {
  const batch = db.batch();
  questions.forEach((q, i) => {
    const correct = answers[i.toString()] === q.correctAnswer;
    batch.set(db.collection('questions').doc(q.id).collection('analytics').doc('stats'), {
      attempts: admin.firestore.FieldValue.increment(1),
      correctAttempts: admin.firestore.FieldValue.increment(correct ? 1 : 0),
      incorrectAttempts: admin.firestore.FieldValue.increment(correct ? 0 : 1),
      lastUpdated: admin.firestore.Timestamp.now()
    }, { merge: true });
  });
  await batch.commit();
      }
