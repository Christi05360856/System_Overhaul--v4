// ============================================
// SCRIPTUREQUEST V4 — Avatar Service
// Saves/loads avatar selection from Firestore
// ============================================

import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, auth }               from '../firebase/config.js';
import { setState, getUserProfile } from '../state/store.js';
import { getAvatarById }           from '../components/avatar.js';

const AVATAR_KEY = 'sq_avatar_id';

// ── Save avatar selection ──
export async function saveAvatar(avatarId) {
  // Save to localStorage immediately for instant UI
  localStorage.setItem(AVATAR_KEY, avatarId);

  // Sync to Firestore
  const user = auth.currentUser;
  if (user) {
    try {
      await updateDoc(doc(db, 'users', user.uid), { avatarId });
    } catch (err) {
      console.warn('[Avatar] Firestore sync failed:', err.message);
    }
  }
}

// ── Get current avatar ID ──
export function getAvatarId(profile = null) {
  // Priority: Firestore profile > localStorage > default
  if (profile?.avatarId) return profile.avatarId;
  const local = localStorage.getItem(AVATAR_KEY);
  if (local) return local;
  return 'M01'; // default
}

// ── Get avatar display name ──
export function getAvatarLabel(avatarId) {
  return getAvatarById(avatarId)?.label || 'Scholar';
}

export default { saveAvatar, getAvatarId, getAvatarLabel };
