// ============================================
// SCRIPTUREQUEST V5 — Path Service
// Structural backbone for the Learning Path.
//
// Derives sections -> units -> lessons -> rounds
// from the flat `learningPath` object (keyed by
// lessonId, e.g. "GEN-01-A") plus hardcoded
// section/unit metadata from the V5 Blueprint.
//
// Unlock rule (confirmed):
//   Round A complete -> unlocks Round B (if it
//     exists for that chapter group)
//   All rounds in a chapter group complete ->
//     unlocks the next chapter group's first round
//   Last chapter group of a book complete ->
//     unlocks the next book's first round
//   Last book of a section complete -> unlocks
//     the next section's first round
//
// This file does NOT talk to Firestore. It is
// pure data shape + lock-state computation.
// progress.service.js calls into this file and
// combines it with userProgress to get the
// actual per-user lock/unlock state.
// ============================================

import { learningPath } from '../data/learning-path.js';

// ============================================
// SECTION METADATA (Blueprint Phase 0)
// Order here = display/unlock order.
// bookCodes = order books unlock within section.
// ============================================

const SECTION_DEFS = [
  {
    id: 'section-1',
    title: 'The Pentateuch',
    theme: 'Creation, the Law, the Covenant, the Exodus',
    order: 1,
    bookCodes: ['GEN', 'EXO', 'LEV', 'NUM', 'DEU']
  },
  {
    id: 'section-2',
    title: 'Historical Books',
    theme: 'Israel in the Promised Land through exile and return',
    order: 2,
    bookCodes: ['JOS', 'JDG', 'RUT', 'SA1', 'SA2', 'KG1', 'KG2',
                'CH1', 'CH2', 'EZR', 'NEH', 'EST']
  },
  {
    id: 'section-3',
    title: 'Wisdom & Poetry',
    theme: 'Suffering, worship, wisdom, love, the human condition',
    order: 3,
    bookCodes: ['JOB', 'PSA', 'PRO', 'ECC', 'SOS']
  },
  {
    id: 'section-4',
    title: 'Major Prophets',
    theme: 'Warning, judgement, exile, hope, apocalyptic vision',
    order: 4,
    bookCodes: ['ISA', 'JER', 'LAM', 'EZK', 'DAN']
  },
  {
    id: 'section-5',
    title: 'Minor Prophets',
    theme: "God's justice, mercy and the Day of the Lord",
    order: 5,
    bookCodes: ['HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC',
                'NAH', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL']
  },
  {
    id: 'section-6',
    title: 'The Gospels',
    theme: 'The life, ministry, death and resurrection of Jesus Christ',
    order: 6,
    bookCodes: ['MAT', 'MRK', 'LUK', 'JHN']
  },
  {
    id: 'section-7',
    title: 'Acts & The Epistles',
    theme: 'The early church, doctrine, Christian living',
    order: 7,
    bookCodes: ['ACT', 'ROM', 'CO1', 'CO2', 'GAL', 'EPH', 'PHP',
                'COL', 'TH1', 'TH2', 'TI1', 'TI2', 'TIT', 'PHM',
                'HEB', 'JAS', 'PE1', 'PE2', 'JN1', 'JN2', 'JN3', 'JUD']
  },
  {
    id: 'section-8',
    title: 'Revelation',
    theme: 'End times, judgement, the new creation, eternity',
    order: 8,
    bookCodes: ['REV']
  }
];

// Book code -> full book name (for display only)
const BOOK_NAMES = {
  GEN: 'Genesis', EXO: 'Exodus', LEV: 'Leviticus', NUM: 'Numbers', DEU: 'Deuteronomy',
  JOS: 'Joshua', JDG: 'Judges', RUT: 'Ruth', SA1: '1 Samuel', SA2: '2 Samuel',
  KG1: '1 Kings', KG2: '2 Kings', CH1: '1 Chronicles', CH2: '2 Chronicles',
  EZR: 'Ezra', NEH: 'Nehemiah', EST: 'Esther',
  JOB: 'Job', PSA: 'Psalms', PRO: 'Proverbs', ECC: 'Ecclesiastes', SOS: 'Song of Solomon',
  ISA: 'Isaiah', JER: 'Jeremiah', LAM: 'Lamentations', EZK: 'Ezekiel', DAN: 'Daniel',
  HOS: 'Hosea', JOL: 'Joel', AMO: 'Amos', OBA: 'Obadiah', JON: 'Jonah', MIC: 'Micah',
  NAH: 'Nahum', HAB: 'Habakkuk', ZEP: 'Zephaniah', HAG: 'Haggai', ZEC: 'Zechariah', MAL: 'Malachi',
  MAT: 'Matthew', MRK: 'Mark', LUK: 'Luke', JHN: 'John',
  ACT: 'Acts', ROM: 'Romans', CO1: '1 Corinthians', CO2: '2 Corinthians',
  GAL: 'Galatians', EPH: 'Ephesians', PHP: 'Philippians', COL: 'Colossians',
  TH1: '1 Thessalonians', TH2: '2 Thessalonians', TI1: '1 Timothy', TI2: '2 Timothy',
  TIT: 'Titus', PHM: 'Philemon', HEB: 'Hebrews', JAS: 'James',
  PE1: '1 Peter', PE2: '2 Peter', JN1: '1 John', JN2: '2 John', JN3: '3 John', JUD: 'Jude',
  REV: 'Revelation'
};

// ============================================
// LESSON ID PARSING
// "GEN-01-A" -> { bookCode:'GEN', chapterGroup:'01', round:'A',
//                 lessonKey:'GEN-01', roundId:'GEN-01-A' }
// ============================================

export function parseRoundId(roundId) {
  const parts = String(roundId || '').split('-');
  const bookCode     = parts[0] || '';
  const chapterGroup = parts[1] || '';
  const round        = parts[2] || '';
  return {
    bookCode,
    chapterGroup,
    round,
    lessonKey: `${bookCode}-${chapterGroup}`,
    roundId
  };
}

// ============================================
// BUILD STRUCTURE
// Walks the flat `learningPath` object once and
// groups it into section -> unit -> lesson -> round.
// Cached after first build (data is static at runtime).
// ============================================

let _structureCache = null;

export function getPathStructure() {
  if (_structureCache) return _structureCache;

  // bookCode -> lessonKey -> [roundIds]
  const byBook = {};

  Object.keys(learningPath).forEach(roundId => {
    const { bookCode, lessonKey } = parseRoundId(roundId);
    if (!bookCode || !lessonKey) return;

    if (!byBook[bookCode]) byBook[bookCode] = {};
    if (!byBook[bookCode][lessonKey]) byBook[bookCode][lessonKey] = [];
    byBook[bookCode][lessonKey].push(roundId);
  });

  // Sort rounds within each lesson alphabetically (A, B, ...)
  Object.values(byBook).forEach(lessons => {
    Object.values(lessons).forEach(roundIds => roundIds.sort());
  });

  const structure = SECTION_DEFS.map(sectionDef => {
    const units = sectionDef.bookCodes
      .filter(bookCode => byBook[bookCode]) // only include books with actual data
      .map(bookCode => {
        const lessonsForBook = byBook[bookCode];

        // Sort lesson keys by chapter group number ascending
        const sortedLessonKeys = Object.keys(lessonsForBook).sort((a, b) => {
          const numA = parseInt(a.split('-')[1], 10) || 0;
          const numB = parseInt(b.split('-')[1], 10) || 0;
          return numA - numB;
        });

        const lessons = sortedLessonKeys.map(lessonKey => {
          const roundIds = lessonsForBook[lessonKey];
          // Use the first round's lessonTitle for the lesson's display title
          const firstRound = learningPath[roundIds[0]];
          return {
            lessonKey,
            lessonTitle: firstRound?.lessonTitle || lessonKey,
            passageRef:  firstRound?.passageRef  || '',
            roundIds
          };
        });

        return {
          bookCode,
          bookName: BOOK_NAMES[bookCode] || bookCode,
          lessons
        };
      });

    return {
      id: sectionDef.id,
      title: sectionDef.title,
      theme: sectionDef.theme,
      order: sectionDef.order,
      units
    };
  }).filter(section => section.units.length > 0); // only sections with actual content

  _structureCache = structure;
  return structure;
}

// ============================================
// FLAT ORDERED LIST OF ALL ROUND IDS
// In strict unlock order: section -> unit ->
// lesson -> round. Used to determine "what is
// the very first round" and "what comes after X".
// ============================================

let _flatOrderCache = null;

function getFlatRoundOrder() {
  if (_flatOrderCache) return _flatOrderCache;

  const flat = [];
  getPathStructure().forEach(section => {
    section.units.forEach(unit => {
      unit.lessons.forEach(lesson => {
        lesson.roundIds.forEach(roundId => {
          flat.push({
            roundId,
            sectionId: section.id,
            bookCode:  unit.bookCode,
            lessonKey: lesson.lessonKey
          });
        });
      });
    });
  });

  _flatOrderCache = flat;
  return flat;
}

// ============================================
// GET A SINGLE ROUND'S FULL DATA
// (study card + questions) by roundId.
// ============================================

export function getRound(roundId) {
  return learningPath[roundId] || null;
}

// ============================================
// GET THE VERY FIRST ROUND IN THE WHOLE PATH
// (used to seed a brand-new user's progress)
// ============================================

export function getFirstRoundId() {
  const flat = getFlatRoundOrder();
  return flat.length ? flat[0].roundId : null;
}

// ============================================
// COMPUTE LOCK STATE
// Given a user's progress (completedRounds map),
// returns a map of roundId -> 'locked' | 'available' | 'complete'
// plus convenience lookups for lessons/units/sections.
//
// Rule: the first round overall is always available.
// A round is available if it is the first round overall,
// OR the round immediately before it (in flat order) is
// complete (passed).
// ============================================

export function computeLockState(progress) {
  const completedRounds = progress?.completedRounds || {};
  const flat = getFlatRoundOrder();

  const roundState = {};

  flat.forEach((entry, i) => {
    const { roundId } = entry;
    const isPassed = !!completedRounds[roundId]?.passed;

    if (isPassed) {
      roundState[roundId] = 'complete';
      return;
    }

    if (i === 0) {
      roundState[roundId] = 'available';
      return;
    }

    const prevRoundId = flat[i - 1].roundId;
    const prevPassed  = !!completedRounds[prevRoundId]?.passed;
    roundState[roundId] = prevPassed ? 'available' : 'locked';
  });

  return {
    roundState,
    // helper: is a given round currently unlocked (available or complete)?
    isUnlocked: (roundId) => roundState[roundId] === 'available' || roundState[roundId] === 'complete',
    isComplete: (roundId) => roundState[roundId] === 'complete'
  };
}

// ============================================
// GET NEXT ROUND AFTER A GIVEN ROUND
// Used by the UI to navigate "Next Round ->"
// after a round-result screen.
// Returns null if it was the last round in the
// entire path (i.e. Revelation's final round).
// ============================================

export function getNextRoundId(roundId) {
  const flat = getFlatRoundOrder();
  const idx = flat.findIndex(e => e.roundId === roundId);
  if (idx === -1 || idx === flat.length - 1) return null;
  return flat[idx + 1].roundId;
}

// ============================================
// LESSON / UNIT / SECTION LOOKUPS
// Used by progress.service.js cascade checks
// and by the UI to render breadcrumbs.
// ============================================

export function findLessonByKey(lessonKey) {
  const { bookCode } = parseRoundId(`${lessonKey}-A`);
  for (const section of getPathStructure()) {
    const unit = section.units.find(u => u.bookCode === bookCode);
    if (!unit) continue;
    const lesson = unit.lessons.find(l => l.lessonKey === lessonKey);
    if (lesson) return { section, unit, lesson };
  }
  return null;
}

export function findUnitByBookCode(bookCode) {
  for (const section of getPathStructure()) {
    const unit = section.units.find(u => u.bookCode === bookCode);
    if (unit) return { section, unit };
  }
  return null;
}

export function getSectionById(sectionId) {
  return getPathStructure().find(s => s.id === sectionId) || null;
}

// ============================================
// RESET CACHES (testing / hot-reload safety)
// ============================================

export function _resetCaches() {
  _structureCache = null;
  _flatOrderCache = null;
}

export default {
  parseRoundId,
  getPathStructure,
  getRound,
  getFirstRoundId,
  computeLockState,
  getNextRoundId,
  findLessonByKey,
  findUnitByBookCode,
  getSectionById,
  _resetCaches
};
