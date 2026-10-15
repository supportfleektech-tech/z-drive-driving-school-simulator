// Z-DRIVE — NTSA License Merits, Vehicle Class Unlocking & Ranking Board
// Instructor: zingri_master · Developer: zingi_master · Powered by ZingTrixx Lab™

export interface ClassLicenseState {
  cls: string;
  licensed: boolean;
  merits: number;
  bestScore: number;
  testsPassed: number;
  challengesPassed: number;
  cleanDrives: number;
  distanceKm: number;
  // 3 tasks per class to earn full license for Free Roam:
  // [0] Complete a skill challenge or training drill in this class
  // [1] Pass an NTSA Practical Test (score >= 70) in this class
  // [2] Complete any drive/test in this class with 0 serious faults & >= 80 merit score
  tasks: [boolean, boolean, boolean];
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  title: string;
  merits: number;
  licenses: number;
  bestScore: number;
  expeditionSec: number | null;
  badge: string;
  isPlayer?: boolean;
}

export interface ProgressionData {
  driverName: string;
  totalMerits: number;
  expeditionBestSec: number | null;
  instructorOverride: boolean; // optional master key toggle in License Office
  classes: Record<string, ClassLicenseState>;
}

export const ALL_CLASS_IDS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C', 'CE', 'D1', 'D2', 'D3', 'E', 'F', 'G'] as const;

export const CLASS_TASK_LABELS: [string, string, string] = [
  'Complete a Skill Challenge or Training Drill in this class',
  'Pass the NTSA Practical Road Exam (≥ 70%) in this class',
  'Achieve a Clean Merit Drive (≥ 80% score, 0 serious faults)',
];

const STORAGE_KEY = 'zdrive_ntsa_progression_v2';

export function defaultClassState(cls: string): ClassLicenseState {
  // B1 starts licensed so a brand-new learner can immediately Free Roam in the basic automatic saloon,
  // while all other 14 classes require accomplishing their class missions/tasks to unlock for Free Roam!
  const starter = cls === 'B1';
  return {
    cls,
    licensed: starter,
    merits: starter ? 120 : 0,
    bestScore: starter ? 82 : 0,
    testsPassed: starter ? 1 : 0,
    challengesPassed: starter ? 1 : 0,
    cleanDrives: starter ? 1 : 0,
    distanceKm: starter ? 1.5 : 0,
    tasks: starter ? [true, true, true] : [false, false, false],
  };
}

export function loadProgression(): ProgressionData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ProgressionData>;
      const classes: Record<string, ClassLicenseState> = {};
      for (const id of ALL_CLASS_IDS) {
        const c = parsed.classes?.[id];
        classes[id] = c ? { ...defaultClassState(id), ...c, tasks: c.tasks ?? [false, false, false] } : defaultClassState(id);
      }
      const totalMerits = Object.values(classes).reduce((s, c) => s + c.merits, 0);
      return {
        driverName: parsed.driverName || 'Cadet_Driver',
        totalMerits,
        expeditionBestSec: parsed.expeditionBestSec ?? null,
        instructorOverride: parsed.instructorOverride ?? false,
        classes,
      };
    }
  } catch { /* ignore */ }
  const classes: Record<string, ClassLicenseState> = {};
  for (const id of ALL_CLASS_IDS) classes[id] = defaultClassState(id);
  return {
    driverName: 'Cadet_Driver',
    totalMerits: 120,
    expeditionBestSec: null,
    instructorOverride: false,
    classes,
  };
}

export function saveProgression(data: ProgressionData) {
  try {
    data.totalMerits = Object.values(data.classes).reduce((s, c) => s + c.merits, 0);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export function recordSessionResult(
  data: ProgressionData,
  cls: string,
  mode: 'free' | 'test' | 'challenge',
  passed: boolean,
  score: number,
  seriousFaults: number,
  distanceMeters: number,
  challengeId?: string,
  elapsedSec?: number,
): { updated: ProgressionData; newlyLicensed: boolean; meritsEarned: number } {
  const next: ProgressionData = {
    ...data,
    classes: { ...data.classes },
  };
  const prev = next.classes[cls] ?? defaultClassState(cls);
  const c: ClassLicenseState = { ...prev, tasks: [...prev.tasks] as [boolean, boolean, boolean] };
  const wasLicensed = c.licensed;

  c.distanceKm = +(c.distanceKm + distanceMeters / 1000).toFixed(2);
  if (score > c.bestScore) c.bestScore = score;

  let meritsEarned = 0;
  if (mode === 'challenge' && passed) {
    c.challengesPassed++;
    c.tasks[0] = true;
    meritsEarned += 45 + Math.round(score * 0.3);
    if (challengeId === 'expedition' && elapsedSec && (!next.expeditionBestSec || elapsedSec < next.expeditionBestSec)) {
      next.expeditionBestSec = Math.round(elapsedSec);
      meritsEarned += 60;
    }
  } else if (mode === 'test' && passed) {
    c.testsPassed++;
    c.tasks[1] = true;
    meritsEarned += 65 + Math.round(score * 0.4);
  } else if (passed) {
    meritsEarned += 20;
  } else {
    meritsEarned += Math.max(5, Math.round(score * 0.1));
  }

  if (passed && seriousFaults === 0 && score >= 80) {
    c.cleanDrives++;
    c.tasks[2] = true;
    meritsEarned += 25;
  }

  c.merits += meritsEarned;
  if (c.tasks[0] && c.tasks[1] && c.tasks[2]) {
    c.licensed = true;
  }

  next.classes[cls] = c;
  next.totalMerits = Object.values(next.classes).reduce((s, x) => s + x.merits, 0);
  saveProgression(next);
  return { updated: next, newlyLicensed: !wasLicensed && c.licensed, meritsEarned };
}

export function isClassUnlockedForFreeRoam(data: ProgressionData, cls: string): boolean {
  if (data.instructorOverride) return true;
  return Boolean(data.classes[cls]?.licensed);
}

export function driverRankTitle(totalMerits: number, licenses: number): { title: string; badge: string } {
  if (licenses >= 15 || totalMerits >= 2400) return { title: 'NTSA Grandmaster Captain', badge: '👑' };
  if (licenses >= 10 || totalMerits >= 1500) return { title: 'Senior Commercial & PSV Inspector', badge: '🏆' };
  if (licenses >= 6 || totalMerits >= 900) return { title: 'Certified Multi-Class Professional', badge: '🥇' };
  if (licenses >= 3 || totalMerits >= 450) return { title: 'Competent Highway Driver', badge: '🥈' };
  if (licenses >= 2 || totalMerits >= 220) return { title: 'Junior Licensed Motorist', badge: '🥉' };
  return { title: 'Provisional Learner (L)', badge: '🔰' };
}

export function buildLeaderboard(data: ProgressionData): LeaderboardEntry[] {
  const playerLicenses = Object.values(data.classes).filter(c => c.licensed).length;
  const playerBest = Math.max(0, ...Object.values(data.classes).map(c => c.bestScore));
  const playerRankInfo = driverRankTitle(data.totalMerits, playerLicenses);

  const rivals: Omit<LeaderboardEntry, 'rank'>[] = [
    { name: 'zingri_master', title: 'Chief Driving Instructor · ZingTrixx Lab™', merits: 3500, licenses: 15, bestScore: 100, expeditionSec: 162, badge: '👑' },
    { name: 'Capt_Mwangi_NBO', title: 'Senior PSV & Heavy Artic Examiner', merits: 2180, licenses: 13, bestScore: 98, expeditionSec: 179, badge: '🏆' },
    { name: 'Amina_Mombasa', title: 'CE Coast Haulage Specialist', merits: 1740, licenses: 11, bestScore: 96, expeditionSec: 188, badge: '🥇' },
    { name: 'Ochieng_KSM', title: 'Rift Escarpment Coach Captain', merits: 1320, licenses: 8, bestScore: 92, expeditionSec: 196, badge: '🥇' },
    { name: 'Wanjiku_ThikaRd', title: 'Class B3 VIP Ride-Hail Pro', merits: 940, licenses: 6, bestScore: 90, expeditionSec: 210, badge: '🥈' },
    { name: 'Kiprop_Eldoret', title: 'All-Terrain & Rally Instructor', merits: 680, licenses: 5, bestScore: 88, expeditionSec: 224, badge: '🥈' },
    { name: 'Mutua_Machakos', title: 'Commercial C1/C Fleet Driver', merits: 420, licenses: 3, bestScore: 84, expeditionSec: 245, badge: '🥉' },
    { name: 'Njeri_Westlands', title: 'Junior Saloon Motorist', merits: 210, licenses: 2, bestScore: 78, expeditionSec: null, badge: '🥉' },
    {
      name: data.driverName || 'You (Learner)',
      title: playerRankInfo.title,
      merits: data.totalMerits,
      licenses: playerLicenses,
      bestScore: playerBest,
      expeditionSec: data.expeditionBestSec,
      badge: playerRankInfo.badge,
      isPlayer: true,
    },
  ];

  rivals.sort((a, b) => b.merits - a.merits || b.licenses - a.licenses || b.bestScore - a.bestScore);
  return rivals.map((r, i) => ({ ...r, rank: i + 1 }));
}
