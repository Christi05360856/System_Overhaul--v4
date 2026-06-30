import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getCurrentWeekId, log } from '../utils/helpers';

const db = admin.firestore();

// ── Weekly XP prizes (replaces old data-bundle prizes) ──
// Update these numbers any time without touching the rest of the logic.
const WEEKLY_XP_PRIZES = [5000, 2500, 1000]; // [1st, 2nd, 3rd]
const WEEKLY_XP_LABELS = ['5,000 XP', '2,500 XP', '1,000 XP'];
const WEEKLY_MEDALS    = ['🥇', '🥈', '🥉'];

// Runs every Monday at 09:00 WAT (08:00 UTC)
export const archiveWeeklyLeaderboard = functions.pubsub
  .schedule('0 8 * * 1')
  .timeZone('UTC')
  .onRun(async () => {
    const current = getCurrentWeekId();

    const [yearStr, weekStr] = current.split('-W');
    let year = parseInt(yearStr);
    let week = parseInt(weekStr);

    week -= 1;
    if (week < 1) { year -= 1; week = 52; }

    const prevWeekId = `${year}-W${String(week).padStart(2, '0')}`;

    log('archiveWeek', 'Archiving', { prevWeekId });

    const entriesSnap = await db.collection('leaderboardWeekly')
      .doc(prevWeekId).collection('entries')
      .orderBy('points', 'desc').limit(10).get();

    const entries: any[] = [];
    entriesSnap.forEach(d => entries.push({ userId: d.id, ...d.data() }));

    if (entries.length === 0) { log('archiveWeek', 'No entries to archive'); return null; }

    const top3 = entries.slice(0, 3);

    await db.collection('weeklyWinners').doc(prevWeekId).set({
      firstPlace:  top3[0] || null,
      secondPlace: top3[1] || null,
      thirdPlace:  top3[2] || null,
      rewardType:  'xp',
      rewardsSent: true,            // XP is credited immediately below, no manual step needed
      archivedAt:  admin.firestore.Timestamp.now()
    });

    // ── Credit XP directly to each winner's userStats, and queue a
    //    celebratory notification they'll see next time they open the app. ──
    const batch = db.batch();

    top3.forEach((entry, i) => {
      const xpAward = WEEKLY_XP_PRIZES[i];

      // 1. Credit XP straight to their stats — no claim, no admin approval needed
      const statsRef = db.collection('userStats').doc(entry.userId);
      batch.set(statsRef, {
        totalXp: admin.firestore.FieldValue.increment(xpAward)
      }, { merge: true });

      // 2. Keep a lightweight history record (for admin visibility / debugging)
      const claimRef = db.collection('rewardClaims').doc();
      batch.set(claimRef, {
        userId: entry.userId,
        type: 'weekly',
        rank: i + 1,
        rewardType: WEEKLY_XP_LABELS[i],
        xpAwarded: xpAward,
        weekId: prevWeekId,
        status: 'auto_credited',   // distinguishes from old manual 'pending' flow
        createdAt: admin.firestore.Timestamp.now()
      });

      // 3. Queue a one-time notification the app shows on next login.
      //    app.js's checkAndShowAnnouncements()-style check picks this up.
      const notifRef = db.collection('pendingNotifications').doc();
      batch.set(notifRef, {
        userId: entry.userId,
        type: 'weekly_win',
        rank: i + 1,
        medal: WEEKLY_MEDALS[i],
        xpAwarded: xpAward,
        weekId: prevWeekId,
        message: `${WEEKLY_MEDALS[i]} You placed #${i + 1} last week — +${WEEKLY_XP_LABELS[i]} awarded!`,
        seen: false,
        createdAt: admin.firestore.Timestamp.now()
      });
    });

    await batch.commit();

    log('archiveWeek', 'Archived + XP credited', { prevWeekId, top3Count: top3.length });
    return null;
  });
                 
