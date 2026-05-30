import * as admin from 'firebase-admin';
if (!admin.apps.length) { admin.initializeApp(); }

export { createQuizSession }        from './quiz/createSession';
export { submitQuizSession }        from './quiz/submitSession';
export { processRewardClaim }       from './rewards/processReward';
export { archiveWeeklyLeaderboard } from './leaderboard/archiveWeek';
export { sendDailyReminders }       from './notifications/scheduler';
