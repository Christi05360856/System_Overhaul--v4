// ============================================
// SCRIPTUREQUEST V4 — Rewards Service
// Handles milestone claims, tier display,
// weekly reward status. Calls Cloud Function
// for all authoritative reward processing.
// ============================================

import { httpsCallable }           from 'firebase/functions';
import {
  collection, query, where,
  getDocs, doc, getDoc
} from 'firebase/firestore';
import { functions, db, auth }     from '../firebase/config.js';
import { showToast }               from '../utils/toast.js';
import { getCurrentWeekId }        from '../utils/week.js';
import {
  COLLECTIONS, FUNCTIONS,
  REWARD_TIERS, WEEKLY_REWARDS
} from '../utils/constants.js';

const _processRewardClaim = httpsCallable(functions, FUNCTIONS.CLAIM_REWARD);

// ============================================
// FETCH SENT MILESTONES
// Returns array of threshold numbers already sent
// ============================================

export async function getSentMilestones(userId) {
  try {
    const q = query(
      collection(db, COLLECTIONS.REWARD_CLAIMS),
      where('userId', '==', userId),
      where('type',   '==', 'milestone'),
      where('status', '==', 'sent')
    );
    const snap = await getDocs(q);
    const sent = [];
    snap.forEach(d => { if (d.data().tier) sent.push(d.data().tier); });
    return sent;
  } catch (err) {
    console.error('[Rewards] getSentMilestones error:', err);
    return [];
  }
}

// ============================================
// CLAIM MILESTONE REWARD (via Cloud Function)
// ============================================

export async function claimMilestoneReward(threshold, rewardType) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please log in to claim your reward');

  try {
    const result = await _processRewardClaim({
      type:      'milestone',
      threshold,
      rewardType,
      weekId:    getCurrentWeekId()
    });
    return result.data;
  } catch (err) {
    const msg = err?.details?.userMessage || err.message || 'Failed to claim reward';
    throw new Error(msg);
  }
}

// ============================================
// RENDER REWARD TIERS
// Pure UI renderer — no business logic here.
// ============================================

export function renderRewardTiers(
  containerEl,
  currentPoints,
  claimedMilestones = [],
  sentMilestones    = [],
  onClaim
) {
  if (!containerEl) return;

  const html = REWARD_TIERS.map(tier => {
    const isUnlocked = currentPoints >= tier.threshold;
    const isClaimed  = claimedMilestones.includes(tier.threshold);
    const isSent     = sentMilestones.includes(tier.threshold);

    // Hide tiers that have been fulfilled
    if (isSent) return '';

    let statusHTML = '';
    let cardClass  = 'reward-tier';

    if (isClaimed) {
      statusHTML = `<div class="tier-status tier-status--pending">Claimed — Pending ⏳</div>`;
      cardClass += ' reward-tier--claimed';
    } else if (isUnlocked) {
      statusHTML = `
        <button
          class="btn-primary btn-sm claim-btn"
          data-threshold="${tier.threshold}"
          data-reward="${tier.reward}"
        >Claim ${tier.label}</button>`;
      cardClass += ' reward-tier--unlocked';
    } else {
      const remaining = (tier.threshold - currentPoints).toLocaleString();
      statusHTML = `<div class="tier-status tier-status--locked">${remaining} pts to go 🔒</div>`;
    }

    return `
      <div class="${cardClass}">
        <div class="tier-icon">📱</div>
        <div class="tier-info">
          <h4>${tier.reward}</h4>
          <p>Reach ${tier.threshold.toLocaleString()} points</p>
        </div>
        <div class="tier-action">${statusHTML}</div>
      </div>`;
  }).join('');

  containerEl.innerHTML = html || '<p class="empty-state">All milestone rewards claimed! 🎉</p>';

  // Attach claim button listeners
  containerEl.querySelectorAll('.claim-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const threshold  = parseInt(btn.dataset.threshold);
      const rewardType = btn.dataset.reward;

      btn.disabled    = true;
      btn.textContent = 'Claiming...';

      try {
        await onClaim(threshold, rewardType);
      } catch (err) {
        btn.disabled    = false;
        btn.textContent = `Claim ${rewardType.split(' ')[0]}`;
      }
    });
  });
}

// ============================================
// RENDER PROGRESS BAR
// ============================================

export function renderRewardProgress(fillEl, labelEl, currentPoints) {
  if (!fillEl) return;

  let nextMilestone = 5000;
  let prevMilestone = 0;

  if (currentPoints >= 5000)  { prevMilestone = 5000;  nextMilestone = 10000; }
  if (currentPoints >= 10000) { prevMilestone = 10000; nextMilestone = 20000; }
  if (currentPoints >= 20000) { prevMilestone = 20000; nextMilestone = 20000; }

  const range    = nextMilestone - prevMilestone;
  const progress = range > 0
    ? Math.min(100, ((currentPoints - prevMilestone) / range) * 100)
    : 100;

  fillEl.style.width = `${progress}%`;
  if (labelEl) labelEl.textContent = nextMilestone.toLocaleString();
}

// ============================================
// CHECK WEEKLY REWARD ELIGIBILITY
// Returns rank if in top 3, else null
// ============================================

export async function checkWeeklyRewardEligibility(userId) {
  try {
    const weekId     = getCurrentWeekId();
    const entriesRef = collection(db, COLLECTIONS.LEADERBOARD, weekId, 'entries');
    const q          = query(entriesRef, where('userId', '==', userId));
    const snap       = await getDocs(q);

    if (snap.empty) return null;

    // Check full leaderboard for rank
    const { fetchLeaderboard } = await import('./leaderboard.service.js');
    const entries = await fetchLeaderboard();
    const rank    = entries.findIndex(e => e.userId === userId) + 1;

    return rank > 0 && rank <= 3 ? rank : null;
  } catch (err) {
    console.error('[Rewards] Weekly eligibility check error:', err);
    return null;
  }
}

export default {
  getSentMilestones,
  claimMilestoneReward,
  renderRewardTiers,
  renderRewardProgress,
  checkWeeklyRewardEligibility
};
