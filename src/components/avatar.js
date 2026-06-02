// ============================================
// SCRIPTUREQUEST V4 — Avatar System
// 24 SVG avatars: 12 male + 12 female
// 6 skin tones × 2 styles each
// Pure SVG — no images, no uploads
// ============================================

// ── Skin tone palette ──
const SKIN_TONES = {
  light:       { skin: '#FDDBB4', shadow: '#F0C090' },
  mediumLight: { skin: '#E8A87C', shadow: '#D4905E' },
  medium:      { skin: '#C68642', shadow: '#A0622A' },
  mediumDark:  { skin: '#8D5524', shadow: '#6B3A10' },
  dark:        { skin: '#5C3317', shadow: '#3E200A' },
  veryDark:    { skin: '#3B1F0E', shadow: '#251208' }
};

// ── Accent colors (Bible-themed) ──
const ACCENTS = {
  royal:   '#4A90D9',   // Royal blue
  gold:    '#F5A623',   // Gold
  purple:  '#8B5CF6',   // Royal purple
  crimson: '#DC2626',   // Crimson
  green:   '#16A34A',   // Olive/forest green
  white:   '#E8E8E8'    // White/silver
};

// ── Generate Male SVG ──
// style 0 = plain, style 1 = glasses
function maleSVG(toneKey, accentKey, style = 0) {
  const t = SKIN_TONES[toneKey] || SKIN_TONES.medium;
  const a = ACCENTS[accentKey] || ACCENTS.royal;

  const glasses = style === 1 ? `
    <rect x="26" y="38" width="14" height="9" rx="4" fill="none" stroke="${a}" stroke-width="2.2"/>
    <rect x="44" y="38" width="14" height="9" rx="4" fill="none" stroke="${a}" stroke-width="2.2"/>
    <line x1="40" y1="42" x2="44" y2="42" stroke="${a}" stroke-width="2.2"/>
    <line x1="22" y1="42" x2="26" y2="42" stroke="${a}" stroke-width="1.5"/>
    <line x1="58" y1="42" x2="62" y2="42" stroke="${a}" stroke-width="1.5"/>` : '';

  return `<svg viewBox="0 0 84 84" xmlns="http://www.w3.org/2000/svg">
    <!-- Background circle -->
    <circle cx="42" cy="42" r="42" fill="${a}" opacity="0.15"/>
    <!-- Shirt/body -->
    <ellipse cx="42" cy="76" rx="22" ry="14" fill="${a}"/>
    <ellipse cx="42" cy="72" rx="18" ry="10" fill="${a}" opacity="0.7"/>
    <!-- Neck -->
    <rect x="36" y="58" width="12" height="10" rx="3" fill="${t.skin}"/>
    <!-- Head -->
    <ellipse cx="42" cy="40" rx="22" ry="24" fill="${t.skin}"/>
    <!-- Hair (short, flat top) -->
    <ellipse cx="42" cy="19" rx="22" ry="10" fill="#2C1810"/>
    <rect x="20" y="19" width="44" height="8" fill="#2C1810"/>
    <!-- Ear left -->
    <ellipse cx="20" cy="42" rx="4" ry="5" fill="${t.skin}"/>
    <ellipse cx="20" cy="42" rx="2.5" ry="3.5" fill="${t.shadow}"/>
    <!-- Ear right -->
    <ellipse cx="64" cy="42" rx="4" ry="5" fill="${t.skin}"/>
    <ellipse cx="64" cy="42" rx="2.5" ry="3.5" fill="${t.shadow}"/>
    <!-- Eyes -->
    <ellipse cx="33" cy="42" rx="5" ry="5.5" fill="white"/>
    <ellipse cx="51" cy="42" rx="5" ry="5.5" fill="white"/>
    <circle cx="34" cy="43" r="3" fill="#1a1a2e"/>
    <circle cx="52" cy="43" r="3" fill="#1a1a2e"/>
    <circle cx="35" cy="41.5" r="1" fill="white"/>
    <circle cx="53" cy="41.5" r="1" fill="white"/>
    ${glasses}
    <!-- Eyebrows -->
    <path d="M28 36 Q33 33 38 36" stroke="#2C1810" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M46 36 Q51 33 56 36" stroke="#2C1810" stroke-width="2" fill="none" stroke-linecap="round"/>
    <!-- Nose -->
    <ellipse cx="42" cy="50" rx="3" ry="2" fill="${t.shadow}" opacity="0.6"/>
    <!-- Smile -->
    <path d="M35 57 Q42 63 49 57" stroke="#2C1810" stroke-width="2" fill="none" stroke-linecap="round"/>
    <!-- Cheeks -->
    <ellipse cx="27" cy="54" rx="5" ry="3" fill="#FF9999" opacity="0.3"/>
    <ellipse cx="57" cy="54" rx="5" ry="3" fill="#FF9999" opacity="0.3"/>
  </svg>`;
}

// ── Generate Female SVG ──
// styles: 0=afro, 1=braids, 2=natural/curly, 3=straight, 4=short bob, 5=crown braids
function femaleSVG(toneKey, accentKey, style = 0) {
  const t = SKIN_TONES[toneKey] || SKIN_TONES.medium;
  const a = ACCENTS[accentKey] || ACCENTS.purple;

  const hairStyles = {
    0: `<!-- Afro -->
        <ellipse cx="42" cy="22" rx="26" ry="22" fill="#2C1810"/>
        <ellipse cx="42" cy="30" rx="22" ry="16" fill="${t.skin}"/>`,
    1: `<!-- Braids -->
        <ellipse cx="42" cy="18" rx="22" ry="12" fill="#2C1810"/>
        <rect x="20" y="18" width="44" height="6" fill="#2C1810"/>
        <rect x="30" y="58" width="4" height="16" rx="2" fill="#2C1810"/>
        <rect x="50" y="58" width="4" height="16" rx="2" fill="#2C1810"/>
        <rect x="22" y="24" width="3" height="20" rx="1.5" fill="#2C1810"/>
        <rect x="59" y="24" width="3" height="20" rx="1.5" fill="#2C1810"/>`,
    2: `<!-- Natural curly -->
        <ellipse cx="42" cy="20" rx="24" ry="14" fill="#2C1810"/>
        <circle cx="22" cy="28" r="8" fill="#2C1810"/>
        <circle cx="62" cy="28" r="8" fill="#2C1810"/>
        <circle cx="30" cy="18" r="7" fill="#2C1810"/>
        <circle cx="54" cy="18" r="7" fill="#2C1810"/>`,
    3: `<!-- Straight long -->
        <ellipse cx="42" cy="18" rx="22" ry="10" fill="#2C1810"/>
        <rect x="20" y="18" width="44" height="6" fill="#2C1810"/>
        <rect x="18" y="22" width="6" height="32" rx="3" fill="#2C1810"/>
        <rect x="60" y="22" width="6" height="32" rx="3" fill="#2C1810"/>`,
    4: `<!-- Short bob -->
        <ellipse cx="42" cy="20" rx="22" ry="12" fill="#2C1810"/>
        <rect x="20" y="20" width="44" height="8" fill="#2C1810"/>
        <rect x="18" y="24" width="5" height="18" rx="2.5" fill="#2C1810"/>
        <rect x="61" y="24" width="5" height="18" rx="2.5" fill="#2C1810"/>`,
    5: `<!-- Crown braids / updo -->
        <ellipse cx="42" cy="18" rx="22" ry="11" fill="#2C1810"/>
        <ellipse cx="42" cy="14" rx="14" ry="8" fill="#2C1810"/>
        <rect x="20" y="18" width="44" height="6" fill="#2C1810"/>
        <ellipse cx="42" cy="13" rx="10" ry="5" fill="${a}" opacity="0.6"/>
        <circle cx="32" cy="13" r="3" fill="${a}"/>
        <circle cx="42" cy="10" r="3" fill="${a}"/>
        <circle cx="52" cy="13" r="3" fill="${a}"/>`
  };

  return `<svg viewBox="0 0 84 84" xmlns="http://www.w3.org/2000/svg">
    <!-- Background circle -->
    <circle cx="42" cy="42" r="42" fill="${a}" opacity="0.15"/>
    <!-- Shirt/body -->
    <ellipse cx="42" cy="76" rx="22" ry="14" fill="${a}"/>
    <ellipse cx="42" cy="72" rx="18" ry="10" fill="${a}" opacity="0.7"/>
    <!-- Neck -->
    <rect x="36" y="58" width="12" height="10" rx="3" fill="${t.skin}"/>
    <!-- Head -->
    <ellipse cx="42" cy="42" rx="22" ry="24" fill="${t.skin}"/>
    <!-- Hair -->
    ${hairStyles[style] || hairStyles[0]}
    <!-- Ear left -->
    <ellipse cx="20" cy="44" rx="4" ry="5" fill="${t.skin}"/>
    <ellipse cx="20" cy="44" rx="2.5" ry="3.5" fill="${t.shadow}"/>
    <!-- Earring left -->
    <circle cx="20" cy="50" r="2" fill="${a}"/>
    <!-- Ear right -->
    <ellipse cx="64" cy="44" rx="4" ry="5" fill="${t.skin}"/>
    <ellipse cx="64" cy="44" rx="2.5" ry="3.5" fill="${t.shadow}"/>
    <!-- Earring right -->
    <circle cx="64" cy="50" r="2" fill="${a}"/>
    <!-- Eyes (slightly larger, more expressive) -->
    <ellipse cx="33" cy="44" rx="5.5" ry="6" fill="white"/>
    <ellipse cx="51" cy="44" rx="5.5" ry="6" fill="white"/>
    <circle cx="34" cy="45" r="3.5" fill="#1a1a2e"/>
    <circle cx="52" cy="45" r="3.5" fill="#1a1a2e"/>
    <circle cx="35.2" cy="43.5" r="1.2" fill="white"/>
    <circle cx="53.2" cy="43.5" r="1.2" fill="white"/>
    <!-- Eyelashes -->
    <path d="M28 39 L29.5 37.5 M31 38 L31.5 36.5 M34 37.5 L34 36" stroke="#2C1810" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M46 38 L46.5 36.5 M49 37.5 L49.5 36 M52 38 L53 36.5" stroke="#2C1810" stroke-width="1.2" stroke-linecap="round"/>
    <!-- Eyebrows (arched) -->
    <path d="M27 37 Q33 33 38 36" stroke="#2C1810" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M46 36 Q51 33 57 37" stroke="#2C1810" stroke-width="2" fill="none" stroke-linecap="round"/>
    <!-- Nose -->
    <ellipse cx="42" cy="52" rx="2.5" ry="1.8" fill="${t.shadow}" opacity="0.5"/>
    <!-- Smile with lips -->
    <path d="M35 59 Q42 66 49 59" stroke="#C0392B" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M36 59 Q42 62 48 59" fill="#E74C3C" opacity="0.4"/>
    <!-- Cheeks -->
    <ellipse cx="26" cy="55" rx="6" ry="4" fill="#FF9999" opacity="0.35"/>
    <ellipse cx="58" cy="55" rx="6" ry="4" fill="#FF9999" opacity="0.35"/>
  </svg>`;
}

// ── Full avatar catalog ──
export const AVATARS = [
  // ── MALE ──
  { id: 'M01', gender: 'male',   label: 'Scholar',      svg: () => maleSVG('medium',     'royal',   0) },
  { id: 'M02', gender: 'male',   label: 'Scribe',       svg: () => maleSVG('dark',       'gold',    0) },
  { id: 'M03', gender: 'male',   label: 'Prophet',      svg: () => maleSVG('veryDark',   'purple',  0) },
  { id: 'M04', gender: 'male',   label: 'Apostle',      svg: () => maleSVG('mediumDark', 'crimson', 0) },
  { id: 'M05', gender: 'male',   label: 'Sage',         svg: () => maleSVG('light',      'green',   0) },
  { id: 'M06', gender: 'male',   label: 'Shepherd',     svg: () => maleSVG('mediumLight','white',   0) },
  { id: 'M07', gender: 'male',   label: 'Deacon',       svg: () => maleSVG('medium',     'purple',  1) },
  { id: 'M08', gender: 'male',   label: 'Elder',        svg: () => maleSVG('dark',       'royal',   1) },
  { id: 'M09', gender: 'male',   label: 'Bishop',       svg: () => maleSVG('veryDark',   'gold',    1) },
  { id: 'M10', gender: 'male',   label: 'Levite',       svg: () => maleSVG('mediumDark', 'green',   1) },
  { id: 'M11', gender: 'male',   label: 'Evangelist',   svg: () => maleSVG('light',      'crimson', 1) },
  { id: 'M12', gender: 'male',   label: 'Disciple',     svg: () => maleSVG('mediumLight','gold',    1) },

  // ── FEMALE ──
  { id: 'F01', gender: 'female', label: 'Prophetess',   svg: () => femaleSVG('medium',     'purple',  0) },
  { id: 'F02', gender: 'female', label: 'Evangelist',   svg: () => femaleSVG('dark',       'royal',   1) },
  { id: 'F03', gender: 'female', label: 'Deaconess',    svg: () => femaleSVG('veryDark',   'gold',    2) },
  { id: 'F04', gender: 'female', label: 'Servant',      svg: () => femaleSVG('mediumDark', 'crimson', 3) },
  { id: 'F05', gender: 'female', label: 'Worshipper',   svg: () => femaleSVG('light',      'green',   4) },
  { id: 'F06', gender: 'female', label: 'Proverbs 31',  svg: () => femaleSVG('mediumLight','purple',  5) },
  { id: 'F07', gender: 'female', label: 'Minister',     svg: () => femaleSVG('medium',     'royal',   2) },
  { id: 'F08', gender: 'female', label: 'Intercessor',  svg: () => femaleSVG('dark',       'crimson', 0) },
  { id: 'F09', gender: 'female', label: 'Psalmist',     svg: () => femaleSVG('veryDark',   'green',   5) },
  { id: 'F10', gender: 'female', label: 'Missionary',   svg: () => femaleSVG('mediumDark', 'gold',    4) },
  { id: 'F11', gender: 'female', label: 'Witness',      svg: () => femaleSVG('light',      'crimson', 1) },
  { id: 'F12', gender: 'female', label: 'Chosen',       svg: () => femaleSVG('mediumLight','royal',   3) }
];

// ── Get avatar by ID ──
export function getAvatarById(id) {
  return AVATARS.find(a => a.id === id) || AVATARS[0];
}

// ── Render avatar SVG string by ID ──
export function renderAvatarSVG(avatarId) {
  const avatar = getAvatarById(avatarId);
  return avatar.svg();
}

// ── Render avatar into a DOM element ──
export function mountAvatar(avatarId, containerEl) {
  if (!containerEl) return;
  const avatar = getAvatarById(avatarId);
  containerEl.innerHTML = avatar.svg();
}

export default { AVATARS, getAvatarById, renderAvatarSVG, mountAvatar };
