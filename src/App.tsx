import { useEffect, useRef, useState } from 'react';
import { Engine, CHALLENGES, type EndResult, type Settings } from './game/engine';
import { VEHICLES, type VehicleKind } from './game/vehicles';
import { EDGES, NODES, dTo } from './game/map';
import type { TransMode } from './game/physics';
import {
  loadProgression,
  saveProgression,
  recordSessionResult,
  isClassUnlockedForFreeRoam,
  buildLeaderboard,
  driverRankTitle,
  CLASS_TASK_LABELS,
  type ProgressionData,
} from './game/progression';
import HUD from './ui/HUD';
import Results from './ui/Results';
import Theory from './ui/Theory';
import MapCanvas from './ui/MapCanvas';

type Screen = 'loading' | 'menu' | 'vehicle' | 'challenges' | 'ranking' | 'settings' | 'briefing' | 'playing' | 'results' | 'theory' | 'about';
type Pending = { mode: 'free' | 'test' | 'challenge'; challenge?: string };

const KIND_ICON: Record<VehicleKind, string> = {
  moped: '🛵',
  moto: '🏍️',
  tuktuk: '🛺',
  car: '🚗',
  taxi: '🚕',
  pwd: '♿',
  van: '🚐',
  mbus: '🚌',
  bus: '🚍',
  truck: '🚚',
  mtruck: '🚛',
  artic: '⛟',
  coach: '🚎',
  plant: '🚜',
};

function Logo({ big }: { big?: boolean }) {
  return (
    <div className="select-none">
      <div className={`${big ? 'text-6xl md:text-7xl' : 'text-3xl'} font-black italic tracking-tighter leading-none`}>
        <span className="text-yellow-400 drop-shadow-[0_0_25px_rgba(250,204,21,0.6)]">Z</span>
        <span className="text-white">-DRIVE</span>
      </div>
      {big && (
        <div className="flex items-center gap-2 mt-2">
          <div className="h-1 w-6 bg-black border border-white/20" />
          <div className="h-1 w-6 bg-red-600" />
          <div className="h-1 w-6 bg-green-600" />
          <span className="text-[11px] tracking-[0.28em] text-slate-300 uppercase ml-1">
            Nairobi CBD & All-Terrain NTSA Simulator
          </span>
        </div>
      )}
    </div>
  );
}

function FooterBar() {
  return (
    <div className="text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3 mt-6">
      <span>🧑‍✈️ Chief Driving Instructor: <b className="text-yellow-300">zingri_master</b></span>
      <span>Sole Developer: <b className="text-cyan-300">zingi_master</b> · Powered by <b className="text-yellow-400">ZingTrixx Lab™</b></span>
    </div>
  );
}

function Stat({ label, v, max }: { label: string; v: number; max: number }) {
  return (
    <div className="text-[10px] text-slate-400">
      <div className="flex justify-between"><span>{label}</span></div>
      <div className="h-1.5 bg-slate-800 rounded mt-0.5">
        <div className="h-full rounded bg-gradient-to-r from-cyan-400 to-yellow-400" style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
      </div>
    </div>
  );
}

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [screen, setScreen] = useState<Screen>('menu');
  const [pending, setPending] = useState<Pending>({ mode: 'test' });
  const [vehicle, setVehicle] = useState('B1');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [result, setResult] = useState<EndResult | null>(null);
  const [lastReward, setLastReward] = useState<{ merits: number; newlyLicensed: boolean }>({ merits: 0, newlyLicensed: false });
  const [prog, setProg] = useState<ProgressionData>(() => loadProgression());
  const [settings, setSettings] = useState<Settings>({
    quality: 'high',
    time: 'day',
    weather: 'clear',
    trans: 'both',
    hints: true,
    traffic: 18,
    sound: true,
  });
  const [showRoute, setShowRoute] = useState(false);
  const [brief, setBrief] = useState(0);
  const [progress, setProgress] = useState({ p: 0, label: 'Starting…' });
  const [fatal, setFatal] = useState<string | null>(null);
  const [runtimeErr, setRuntimeErr] = useState<string | null>(null);
  const [bootKey, setBootKey] = useState(0);
  const [bootQuality, setBootQuality] = useState<'high' | 'low'>('high');
  const [warnings, setWarnings] = useState<string[]>([]);
  const stageRef = useRef('Starting');

  useEffect(() => {
    const onErr = (e: ErrorEvent) => setRuntimeErr(e.message || String(e.error));
    const onRej = (e: PromiseRejectionEvent) => setRuntimeErr(String(e.reason?.message ?? e.reason));
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);

  useEffect(() => {
    let eng: Engine | null = null;
    let cancelled = false;
    setScreen('menu');
    setFatal(null);
    setProgress({ p: 0, label: 'Starting…' });
    const boot = async () => {
      await new Promise(r => setTimeout(r, 60));
      if (cancelled || !hostRef.current) return;
      const test = document.createElement('canvas');
      const gl = test.getContext('webgl2') || test.getContext('webgl');
      if (!gl) throw new Error('WebGL is not available in this browser/device. Enable hardware acceleration or try Chrome/Edge/Firefox.');
      eng = new Engine(hostRef.current, bootQuality);
      eng.onError = (m) => setRuntimeErr(m.split('\n')[0]);
      await eng.init((p, label) => {
        stageRef.current = label;
        if (!cancelled) setProgress({ p, label });
      });
      if (cancelled) {
        eng.dispose();
        return;
      }
      setWarnings([...eng.world.failures]);
      setEngine(eng);
    };
    boot().catch((e) => {
      console.error(e);
      if (cancelled) return;
      const msg = e instanceof Error ? e.message : String(e);
      const where = e instanceof Error && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ').slice(0, 200) : '';
      setFatal(`${msg}${where ? ' — ' + where : ''} (stage: ${stageRef.current})`);
    });
    return () => {
      cancelled = true;
      eng?.dispose();
      setEngine(null);
    };
  }, [bootKey, bootQuality]);

  useEffect(() => {
    if (!engine) return;
    return engine.on({
      end: (r) => {
        const seriousCount = r.offenses.filter(o => o.sev === 'fail').length;
        const rec = recordSessionResult(
          loadProgression(),
          r.vehicleClass,
          r.mode === 'attract' ? 'free' : r.mode,
          r.passed,
          r.score,
          seriousCount,
          r.distance,
          r.challengeId,
          r.time,
        );
        setProg(rec.updated);
        setLastReward({ merits: rec.meritsEarned, newlyLicensed: rec.newlyLicensed });
        setResult(r);
        setTimeout(() => setScreen('results'), 550);
      },
    });
  }, [engine]);

  useEffect(() => {
    engine?.applySettings(settings);
  }, [engine, settings]);

  const start = (p: Pending = pending, v = vehicle) => {
    if (!engine) return;
    setResult(null);
    (document.activeElement as HTMLElement | null)?.blur?.();
    try {
      if (p.mode === 'free') {
        engine.startFree(v);
        setScreen('playing');
      } else if (p.mode === 'test') {
        engine.startTest(v);
        engine.paused = true;
        setShowRoute(false);
        setBrief(b => b + 1);
        setScreen('briefing');
      } else {
        engine.startChallenge(p.challenge!, v);
        if (p.challenge === 'night') {
          engine.paused = true;
          setShowRoute(true);
          setBrief(b => b + 1);
          setScreen('briefing');
        } else {
          setBrief(b => b + 1);
          setScreen('playing');
        }
      }
    } catch (e) {
      console.error(e);
      setRuntimeErr(e instanceof Error ? e.message : String(e));
      engine.quitToMenu();
      setScreen('menu');
    }
  };

  const toMenu = () => {
    engine?.quitToMenu();
    setScreen('menu');
  };

  const choose = (p: Pending) => {
    setPending(p);
    if (p.mode === 'challenge' && p.challenge) {
      const ch = CHALLENGES.find(c => c.id === p.challenge);
      if (ch?.recommendedClass) setVehicle(ch.recommendedClass);
    }
    setScreen('vehicle');
  };

  let snap: ReturnType<Engine['snapshot']> | null = null;
  if (engine && screen === 'briefing') {
    try { snap = engine.snapshot(); } catch (e) { console.error(e); snap = null; }
  }
  const startPose = engine?.car ? { x: engine.car.x, z: engine.car.z, heading: engine.car.heading } : null;
  const mapW = Math.max(260, Math.min(620, (typeof window !== 'undefined' ? window.innerWidth : 800) - (typeof window !== 'undefined' && window.innerWidth >= 1024 ? 460 : 70)));

  const licensedCount = Object.values(prog.classes).filter(c => c.licensed).length;
  const rankInfo = driverRankTitle(prog.totalMerits, licensedCount);
  const selectedSpec = VEHICLES.find(v => v.id === vehicle) ?? VEHICLES[3];
  const selectedClassState = prog.classes[selectedSpec.id];
  const freeRoamAllowed = pending.mode !== 'free' || isClassUnlockedForFreeRoam(prog, selectedSpec.id);

  const groups = ['ALL', 'Class A', 'Class B', 'Class C', 'Class D', 'Class E', 'Class F', 'Class G'];
  const visibleVehicles = classFilter === 'ALL' ? VEHICLES : VEHICLES.filter(v => v.group.startsWith(classFilter));

  return (
    <div className="fixed inset-0 bg-black overflow-hidden text-white">
      {/* Backdrop while 3D town loads */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 70% 40%, #1e3a5f 0%, #0b1324 45%, #020617 100%)' }}>
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'linear-gradient(rgba(250,204,21,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(250,204,21,0.25) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            transform: 'perspective(600px) rotateX(60deg) translateY(30%) scale(2)',
            transformOrigin: 'center bottom',
          }}
        />
      </div>
      <div ref={hostRef} className="absolute inset-0" style={{ opacity: engine ? 1 : 0, transition: 'opacity 1.2s' }} />

      {warnings.length > 0 && screen === 'menu' && (
        <div className="absolute bottom-4 left-4 z-40 max-w-[460px] bg-amber-950/90 border border-amber-500/60 rounded-xl p-3 text-[11px] text-amber-100 shadow-2xl">
          <div className="flex justify-between items-center mb-1">
            <b>Some scenery was skipped (the game still works)</b>
            <button onClick={() => setWarnings([])} className="px-2 rounded bg-amber-800">×</button>
          </div>
          <div className="max-h-28 overflow-auto space-y-0.5 opacity-90 break-words">
            {warnings.slice(0, 8).map((w, i) => <div key={i}>• {w}</div>)}
          </div>
        </div>
      )}

      {runtimeErr && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] bg-red-950/95 border border-red-500 rounded-xl px-4 py-2 text-xs text-red-100 flex items-center gap-3 shadow-2xl">
          <span>⚠ Runtime notice: {runtimeErr}</span>
          <button onClick={() => setRuntimeErr(null)} className="px-2 py-0.5 rounded bg-red-800 hover:bg-red-700">Dismiss</button>
        </div>
      )}

      {screen === 'playing' && engine && (
        <HUD key={String(brief) + pending.mode + (pending.challenge ?? '')} engine={engine} onQuit={toMenu} onRestart={() => start()} />
      )}

      {/* ==================== MAIN MENU ==================== */}
      {screen === 'menu' && (
        <div className="absolute inset-0 overflow-y-auto" style={{ background: 'linear-gradient(90deg, rgba(2,6,23,0.95) 0%, rgba(2,6,23,0.78) 45%, rgba(2,6,23,0.18) 80%)' }}>
          <div className="min-h-full flex flex-col justify-between p-6 md:px-14 md:py-8 max-w-2xl">
            {/* Driver Profile Header Badge */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-700/80 rounded-2xl px-4 py-2.5 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{rankInfo.badge}</span>
                <div>
                  <div className="text-xs font-bold text-white">{prog.driverName} · <span className="text-yellow-300">{rankInfo.title}</span></div>
                  <div className="text-[11px] text-slate-400">Chief Instructor: <b className="text-cyan-300">zingri_master</b></div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="text-right">
                  <div className="text-yellow-400 font-black">{prog.totalMerits} XP</div>
                  <div className="text-[10px] text-slate-400">Licenses: {licensedCount}/15</div>
                </div>
                <button onClick={() => setScreen('ranking')} className="px-3 py-1.5 rounded-lg bg-yellow-400/20 border border-yellow-400/50 text-yellow-300 font-bold hover:bg-yellow-400 hover:text-slate-950 transition">
                  🏆 Ranking
                </button>
              </div>
            </div>

            <div className="my-6">
              <Logo big />
              <p className="text-slate-300 mt-4 text-xs md:text-sm leading-relaxed">
                Welcome to <b className="text-yellow-300">Nairobi CBD</b> & the <b className="text-cyan-300">All-in-One Kenya Proving Ground</b>, guided by Chief Instructor <b className="text-yellow-300">zingri_master</b>. Master all <b>15 NTSA vehicle classes (A1–G)</b>, realistic clutch bite-point (<kbd className="px-1 bg-slate-800 rounded">Q + Shift</kbd>) & H-shifter or <kbd className="px-1 bg-slate-800 rounded">P–R–N–D–M</kbd> transmission, and earn your licenses to unlock Free Roam!
              </p>

              <div className="mt-5 grid sm:grid-cols-2 gap-2.5">
                {[
                  ['🎓', 'NTSA Practical Test', 'Official MTB route exam · Earn class license', () => choose({ mode: 'test' }), true],
                  ['🌍', 'All-in-One Expedition', 'Highway · Hills · Winding · Offroad · Desert · Snow · Mud', () => choose({ mode: 'challenge', challenge: 'expedition' }), true],
                  ['🏁', '12 Skill Challenges', 'Hill Start · 3-Point Turn · VIP Taxi · Parking · Overtake', () => setScreen('challenges'), false],
                  ['🚗', 'Free Roam (Licensed)', `Drive your licensed classes (${licensedCount}/15 unlocked)`, () => choose({ mode: 'free' }), false],
                  ['🏆', 'Ranking & License Merits', 'National leaderboard & 15-class license cards', () => setScreen('ranking'), false],
                  ['🗺️', 'MTB Theory Room', 'Interactive toy-car route planner & NTSA quiz', () => setScreen('theory'), false],
                  ['⚙️', 'Settings & Weather', 'Auto/Manual/Both · Rain/Snow/Storm · 24h Cycle', () => setScreen('settings'), false],
                  ['📘', 'Controls & Handbook', 'Clutch bite Q+Shift · Indicators , / . · MTB rules', () => setScreen('about'), false],
                ].map(([i, t, d, fn, primary]) => (
                  <button
                    key={t as string}
                    onClick={fn as () => void}
                    className={`group flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all border ${
                      primary
                        ? 'bg-yellow-400 text-slate-950 border-yellow-300 hover:bg-yellow-300 shadow-[0_0_25px_rgba(250,204,21,0.3)]'
                        : 'bg-slate-900/75 border-slate-700/70 hover:border-yellow-400/70 hover:bg-slate-800/85 backdrop-blur'
                    }`}
                  >
                    <span className="text-2xl">{i as string}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-sm truncate">{t as string}</span>
                      <span className={`block text-[11px] truncate ${primary ? 'text-slate-800' : 'text-slate-400'}`}>{d as string}</span>
                    </span>
                    <span className="opacity-0 group-hover:opacity-100 transition">›</span>
                  </button>
                ))}
              </div>

              {!engine && !fatal && (
                <div className="mt-4">
                  <div className="flex justify-between text-[10px] tracking-widest uppercase text-slate-400 mb-1">
                    <span>Building Nairobi CBD & 7 Biomes · {progress.label}</span>
                    <span>{Math.round(progress.p * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-yellow-400 to-cyan-400 transition-all duration-300" style={{ width: `${Math.max(4, progress.p * 100)}%` }} />
                  </div>
                </div>
              )}

              {fatal && (
                <div className="mt-4 bg-red-950/80 border border-red-500/60 rounded-xl p-4 text-xs text-red-100">
                  <div className="font-bold text-sm mb-1">3D engine failed to start</div>
                  <div className="break-words opacity-90">{fatal}</div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => { setBootQuality('low'); setSettings(s => ({ ...s, quality: 'low' })); setBootKey(k => k + 1); }} className="flex-1 py-2 rounded-lg bg-yellow-400 text-slate-950 font-bold">Retry (Performance)</button>
                    <button onClick={() => setBootKey(k => k + 1)} className="flex-1 py-2 rounded-lg bg-slate-800">Retry</button>
                  </div>
                </div>
              )}
            </div>

            <FooterBar />
          </div>
        </div>
      )}

      {/* ==================== VEHICLE CLASS SELECTION (15 NTSA CLASSES + LICENSE MERITS) ==================== */}
      {screen === 'vehicle' && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md overflow-auto">
          <div className="max-w-7xl mx-auto p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <Logo />
                <h2 className="text-2xl font-bold mt-1">
                  Select NTSA Vehicle Class ({pending.mode === 'free' ? 'Free Roam — Licensed Classes Only' : pending.mode === 'test' ? 'NTSA Practical Exam' : 'Skill Challenge'})
                </h2>
                <p className="text-slate-400 text-xs">
                  {pending.mode === 'free'
                    ? 'To Free Roam with any vehicle class, accomplish all 3 class missions/tasks to earn its NTSA License!'
                    : 'Pass tests & challenges in any class to earn Merit XP and unlock its Full NTSA License for Free Roam.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Transmission Selector Pill */}
                <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl p-1 text-xs">
                  <span className="px-2 text-slate-400 font-semibold">Gearbox:</span>
                  {(['auto', 'manual', 'both'] as TransMode[]).map(tm => (
                    <button
                      key={tm}
                      onClick={() => setSettings(s => ({ ...s, trans: tm }))}
                      className={`px-2.5 py-1 rounded-lg font-bold uppercase ${settings.trans === tm ? 'bg-yellow-400 text-slate-950' : 'text-slate-300 hover:text-white'}`}
                    >
                      {tm}
                    </button>
                  ))}
                </div>
                <button onClick={() => setScreen(pending.mode === 'challenge' ? 'challenges' : 'menu')} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-sm">
                  ← Back
                </button>
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex flex-wrap gap-1.5">
                {groups.map(g => (
                  <button
                    key={g}
                    onClick={() => setClassFilter(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      classFilter === g ? 'bg-cyan-400 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              {pending.mode === 'free' && (
                <label className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prog.instructorOverride}
                    onChange={(e) => {
                      const next = { ...prog, instructorOverride: e.target.checked };
                      setProg(next);
                      saveProgression(next);
                    }}
                    className="accent-yellow-400"
                  />
                  🔑 Chief Instructor Override (zingri_master Master Key)
                </label>
              )}
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {visibleVehicles.map(v => {
                const st = prog.classes[v.id];
                const unlockedFree = isClassUnlockedForFreeRoam(prog, v.id);
                const lockedInCurrentMode = pending.mode === 'free' && !unlockedFree;
                const tasksDoneCount = st ? st.tasks.filter(Boolean).length : 0;

                return (
                  <button
                    key={v.id}
                    onClick={() => setVehicle(v.id)}
                    className={`text-left rounded-2xl border p-4 transition-all relative ${
                      vehicle === v.id
                        ? 'border-yellow-400 bg-yellow-400/10 shadow-[0_0_25px_rgba(250,204,21,0.2)]'
                        : lockedInCurrentMode
                        ? 'border-slate-800 bg-slate-900/50 opacity-75 hover:opacity-100 hover:border-slate-600'
                        : 'border-slate-700 bg-slate-900/80 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] text-cyan-300 tracking-wider uppercase font-semibold">
                          {v.group} · Min Age {v.minAge}y
                        </div>
                        <div className="text-base font-bold">{v.name}</div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-2xl font-black text-yellow-400 leading-none">{v.cls}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded mt-1 font-bold ${st?.licensed ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                          {st?.licensed ? '✔ LICENSED' : `🔒 ${tasksDoneCount}/3 TASKS`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between my-2">
                      <span className="text-3xl">{KIND_ICON[v.kind]}</span>
                      <div className="text-right text-[10px] text-slate-400 font-mono">
                        <div>{v.mass.toLocaleString()} kg · {v.gears}-spd {v.defaultTrans.toUpperCase()}</div>
                        <div className="text-yellow-300 font-bold">Merits: {st?.merits ?? 0} XP · Best: {st?.bestScore ?? 0}%</div>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-300 min-h-[30px]">{v.desc}</p>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                      <Stat label={`Speed ${v.maxSpeed} km/h`} v={v.maxSpeed} max={160} />
                      <Stat label="Torque / Accel" v={v.accel} max={4.0} />
                    </div>

                    {/* Class License Tasks Checklist */}
                    <div className="mt-2.5 pt-2 border-t border-slate-800/90 space-y-0.5 text-[10px]">
                      {CLASS_TASK_LABELS.map((lbl, idx) => {
                        const done = st?.tasks[idx];
                        return (
                          <div key={idx} className={`flex items-center gap-1.5 truncate ${done ? 'text-emerald-300' : 'text-slate-500'}`}>
                            <span>{done ? '✔' : '○'}</span>
                            <span className="truncate">{lbl}</span>
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Sticky Action Footer */}
            <div className="sticky bottom-0 mt-5 py-3.5 px-4 rounded-2xl border border-slate-700 bg-slate-900/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shadow-2xl">
              <div className="text-xs md:text-sm text-slate-200">
                <div>
                  Selected: <b className="text-yellow-300">Class {selectedSpec.cls} · {selectedSpec.name}</b> ({selectedSpec.category})
                </div>
                {!freeRoamAllowed && (
                  <div className="text-xs text-amber-300 mt-0.5">
                    🔒 Class {selectedSpec.cls} is not yet licensed for Free Roam ({selectedClassState?.tasks.filter(Boolean).length ?? 0}/3 tasks complete). Complete its tasks below to unlock!
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {!freeRoamAllowed ? (
                  <>
                    <button
                      disabled={!engine}
                      onClick={() => {
                        const nextP: Pending = { mode: 'challenge', challenge: 'roundabout' };
                        setPending(nextP);
                        start(nextP, selectedSpec.id);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-black text-xs md:text-sm hover:bg-cyan-400 disabled:opacity-40"
                    >
                      🏁 Task 1: Start Class {selectedSpec.cls} Skill Drill →
                    </button>
                    <button
                      disabled={!engine}
                      onClick={() => {
                        const nextP: Pending = { mode: 'test' };
                        setPending(nextP);
                        start(nextP, selectedSpec.id);
                      }}
                      className="px-5 py-2.5 rounded-xl bg-yellow-400 text-slate-950 font-black text-xs md:text-sm hover:bg-yellow-300 disabled:opacity-40"
                    >
                      🎓 Task 2 & 3: Take Class {selectedSpec.cls} NTSA Exam →
                    </button>
                  </>
                ) : engine ? (
                  <button
                    onClick={() => start()}
                    className="px-8 py-3 rounded-xl bg-yellow-400 text-slate-950 font-black text-base hover:bg-yellow-300 shadow-[0_0_30px_rgba(250,204,21,0.35)]"
                  >
                    {pending.mode === 'test' ? 'Proceed to Route Briefing →' : 'Start Driving →'}
                  </button>
                ) : fatal ? (
                  <button
                    onClick={() => {
                      setBootQuality('low');
                      setSettings(s => ({ ...s, quality: 'low' }));
                      setBootKey(k => k + 1);
                    }}
                    className="px-6 py-3 rounded-xl bg-red-600 font-bold text-sm"
                  >
                    3D failed — Retry in Performance mode
                  </button>
                ) : (
                  <button disabled className="px-8 py-3 rounded-xl bg-slate-700 text-slate-300 font-bold cursor-wait min-w-[240px] relative overflow-hidden">
                    <span className="absolute inset-y-0 left-0 bg-yellow-400/30 transition-all" style={{ width: `${progress.p * 100}%` }} />
                    <span className="relative">Loading town… {Math.round(progress.p * 100)}%</span>
                  </button>
                )}
              </div>
            </div>

            <FooterBar />
          </div>
        </div>
      )}

      {/* ==================== 12 SKILL CHALLENGES & EXPEDITION ==================== */}
      {screen === 'challenges' && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md overflow-auto">
          <div className="max-w-6xl mx-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <Logo />
                <h2 className="text-2xl font-bold mt-2">NTSA Skill Challenges & Multi-Biome Sidequest</h2>
                <p className="text-slate-400 text-sm">Supervised by Chief Instructor <b className="text-yellow-300">zingri_master</b>. Passing a challenge completes Task 1 for your chosen vehicle class!</p>
              </div>
              <button onClick={() => setScreen('menu')} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700">← Back</button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CHALLENGES.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => choose({ mode: 'challenge', challenge: c.id })}
                  className={`text-left rounded-2xl border p-5 hover:-translate-y-1 transition-all ${
                    c.id === 'expedition'
                      ? 'border-yellow-400/80 bg-gradient-to-b from-yellow-500/15 to-slate-950 shadow-[0_0_25px_rgba(250,204,21,0.15)]'
                      : 'border-slate-700 bg-gradient-to-b from-slate-900 to-slate-950 hover:border-yellow-400'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-4xl">{c.icon}</span>
                    <span className="text-xs text-slate-400 font-mono">
                      #{String(i + 1).padStart(2, '0')} {c.recommendedClass ? `· Rec: ${c.recommendedClass}` : ''}
                    </span>
                  </div>
                  <div className="font-bold text-lg mt-2.5">{c.title}</div>
                  <p className="text-xs text-slate-300 mt-1 min-h-[54px]">{c.desc}</p>
                  <div className="text-[10px] text-cyan-300 mt-2 border-t border-slate-800 pt-2">{c.skill}</div>
                </button>
              ))}
            </div>
            <FooterBar />
          </div>
        </div>
      )}

      {/* ==================== RANKING BOARD & LICENSE MERITS OFFICE ==================== */}
      {screen === 'ranking' && (
        <div className="absolute inset-0 bg-slate-950/92 backdrop-blur-md overflow-auto">
          <div className="max-w-6xl mx-auto p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <Logo />
                <h2 className="text-2xl font-bold mt-2">🏆 National NTSA Ranking Board & License Merits</h2>
                <p className="text-slate-400 text-xs">Official Merit Registry · Chief Examiner: <b className="text-yellow-300">zingri_master</b></p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={prog.driverName}
                  onChange={(e) => {
                    const next = { ...prog, driverName: e.target.value.slice(0, 22) };
                    setProg(next);
                    saveProgression(next);
                  }}
                  placeholder="Your Driver Name"
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-yellow-300"
                />
                <button onClick={() => setScreen('menu')} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">← Back</button>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6">
              {/* National Leaderboard Table */}
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
                <h3 className="font-bold text-yellow-300 mb-3 text-base">🇰🇪 Kenya Driving School Leaderboard</h3>
                <div className="space-y-2">
                  {buildLeaderboard(prog).map(row => (
                    <div
                      key={row.name}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs ${
                        row.isPlayer
                          ? 'bg-yellow-400/15 border-yellow-400 text-white shadow-[0_0_20px_rgba(250,204,21,0.2)]'
                          : row.rank === 1
                          ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-100'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-center font-mono font-black text-sm text-yellow-400">#{row.rank}</span>
                        <span className="text-xl">{row.badge}</span>
                        <div>
                          <div className="font-bold text-sm">
                            {row.name} {row.isPlayer && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400 text-slate-950 ml-1">YOU</span>}
                          </div>
                          <div className="text-[10px] text-slate-400">{row.title}</div>
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="font-black text-yellow-300">{row.merits} XP</div>
                        <div className="text-[10px] text-slate-400">
                          {row.licenses}/15 Lic · Best {row.bestScore}% {row.expeditionSec ? `· 🌍 ${row.expeditionSec}s` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 15-Class License Merits Grid */}
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-cyan-300 text-base">🪪 Your 15-Class NTSA License Endorsements</h3>
                  <span className="text-xs font-mono text-emerald-300 font-bold">{licensedCount} / 15 Licensed</span>
                </div>
                <div className="grid grid-cols-3 gap-2 max-h-[430px] overflow-auto pr-1">
                  {VEHICLES.map(v => {
                    const st = prog.classes[v.id];
                    const done = st?.tasks.filter(Boolean).length ?? 0;
                    return (
                      <div
                        key={v.id}
                        onClick={() => { setVehicle(v.id); setPending({ mode: 'test' }); setScreen('vehicle'); }}
                        className={`cursor-pointer rounded-xl border p-2.5 transition ${
                          st?.licensed ? 'border-emerald-500/50 bg-emerald-500/10 hover:border-emerald-400' : 'border-slate-800 bg-slate-950/70 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-black text-yellow-400 text-base">{v.cls}</span>
                          <span className="text-lg">{KIND_ICON[v.kind]}</span>
                        </div>
                        <div className="text-[10px] font-semibold truncate mt-0.5">{v.name}</div>
                        <div className="text-[9px] text-slate-400 font-mono mt-1">
                          {st?.merits ?? 0} XP · {st?.licensed ? 'LICENSED ✔' : `${done}/3 Tasks`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <FooterBar />
          </div>
        </div>
      )}

      {/* ==================== SETTINGS & WEATHER ==================== */}
      {screen === 'settings' && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-[500px] max-w-[94vw]">
            <h2 className="text-2xl font-bold mb-4">⚙️ Simulation, Weather & Gearbox Settings</h2>
            {([
              ['Graphics quality', 'quality', [['high', 'High (Shadows + Bloom)'], ['low', 'Performance']]],
              ['Time of day / Solar cycle', 'time', [['day', '☀️ Day'], ['dusk', '🌇 Dusk'], ['night', '🌙 Night'], ['cycle', '🕒 Real-Time 24h']]],
              ['Weather conditions', 'weather', [['clear', '☀️ Clear'], ['rain', '🌧️ Rain'], ['storm', '⛈️ Storm'], ['fog', '🌫️ Fog'], ['snow', '❄️ Snow']]],
              ['Transmission & Shifter UI', 'trans', [['auto', 'Auto (PRNDM)'], ['manual', 'Manual (Clutch+H)'], ['both', 'Both (Dual UI)']]],
              ['Instructor zingri_master hints', 'hints', [[true, 'On'], [false, 'Off (Strict Exam)']]],
              ['Nairobi traffic density', 'traffic', [[10, 'Light'], [18, 'Normal'], [30, 'Heavy']]],
              ['Vehicle & switch audio', 'sound', [[true, 'On'], [false, 'Muted']]],
            ] as [string, keyof Settings, [Settings[keyof Settings], string][]][]).map(([label, key, opts]) => (
              <div key={key} className="mb-3.5">
                <div className="text-[11px] text-slate-400 uppercase tracking-widest mb-1">{label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {opts.map(([v, l]) => (
                    <button
                      key={String(v)}
                      onClick={() => setSettings(s => ({ ...s, [key]: v }))}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs ${
                        settings[key] === v ? 'bg-yellow-400 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={() => setScreen('menu')} className="w-full mt-2 py-3 rounded-xl bg-yellow-400 text-slate-950 font-black hover:bg-yellow-300">
              Save & Return
            </button>
            <FooterBar />
          </div>
        </div>
      )}

      {/* ==================== ABOUT / CONTROLS ==================== */}
      {screen === 'about' && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md overflow-auto">
          <div className="max-w-5xl mx-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <Logo />
              <button onClick={() => setScreen('menu')} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700">← Back</button>
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
                <h3 className="font-bold text-yellow-300 mb-2">1. The Three Priority Rules of the MTB</h3>
                <ol className="list-decimal ml-5 space-y-1 text-slate-300 text-xs">
                  <li>Use the <b>shortest and most correct route</b> without passing through a parking zone.</li>
                  <li>Use the <b>longest and most correct route</b> without passing through a parking zone if the short route is blocked.</li>
                  <li>Use a <b>parking zone route only as the last and final option</b>.</li>
                </ol>
              </div>
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
                <h3 className="font-bold text-yellow-300 mb-2">2. Manual Clutch (Q & Q + Left Shift) & Auto (P–R–N–D–M)</h3>
                <ul className="list-disc ml-5 space-y-1 text-slate-300 text-xs">
                  <li><b>Full Clutch In (<kbd className="text-cyan-300">Q</kbd>)</b>: Hold <kbd className="text-cyan-300">Q</kbd> to disengage the clutch 100% and select a gear on the H-Shifter (<kbd>R, N, 1–6</kbd>).</li>
                  <li><b>Clutch Bite-Point Release (<kbd className="text-emerald-300">Q + Left Shift</kbd>)</b>: Hold <kbd className="text-emerald-300">Q + Left Shift</kbd> while balancing gas (<kbd>W</kbd>) around 1,500–2,200 RPM to smoothly engage the clutch at the bite point (essential for Hill Starts!), then release <kbd>Q</kbd>.</li>
                  <li><b>Automatic (<kbd className="text-yellow-300">P–R–N–D–M</kbd>)</b>: Use <kbd>M</kbd> with <kbd>[</kbd> and <kbd>]</kbd> for sequential manual shifting.</li>
                </ul>
              </div>
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
                <h3 className="font-bold text-yellow-300 mb-2">3. Complete Keyboard & Switch Controls</h3>
                <div className="grid grid-cols-2 gap-1 text-slate-300 text-xs">
                  {[
                    ['W / S', 'Gas / Footbrake'],
                    ['A / D', 'Steer Left / Right'],
                    [', (Comma)', 'Left Indicator'],
                    ['. (Period)', 'Right Indicator'],
                    ['/ or Z', 'Hazard Blinkers'],
                    ['Q', 'Full Clutch In'],
                    ['Q + L-Shift', 'Clutch Bite Point'],
                    ['1–6 / 0 / -', 'H-Shifter Gears'],
                    ['[ / ]', 'Sequential M− / M+'],
                    ['Space', 'Handbrake'],
                    ['H', 'Horn'],
                    ['L / Y', 'Headlights / Wipers'],
                    ['B / I / V', 'Belt / Engine / Mirror'],
                    ['C / M', 'Camera / Big Map'],
                  ].map(([k, d]) => (
                    <div key={k}><kbd className="text-cyan-300 font-mono">{k}</kbd> {d}</div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
                <h3 className="font-bold text-yellow-300 mb-2">4. Credits & Instructor</h3>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Chief Driving Instructor & NTSA Examiner: <b className="text-yellow-300">zingri_master</b>.<br />
                  Sole Developer: <b className="text-cyan-300">zingi_master</b>.<br />
                  Powered by <b className="text-yellow-400">ZingTrixx Lab™</b>.
                </p>
              </div>
            </div>
            <FooterBar />
          </div>
        </div>
      )}

      {screen === 'theory' && <Theory onBack={() => setScreen('menu')} />}

      {/* ==================== ROUTE BRIEFING ==================== */}
      {screen === 'briefing' && engine && !snap && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/85">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 text-center max-w-sm">
            <div className="font-bold mb-2">Preparing the test route…</div>
            <div className="flex gap-2 justify-center mt-4">
              <button onClick={() => { engine.paused = false; setScreen('playing'); }} className="px-5 py-2.5 rounded-xl bg-yellow-400 text-slate-950 font-bold">Begin Test</button>
              <button onClick={toMenu} className="px-5 py-2.5 rounded-xl bg-slate-800">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {screen === 'briefing' && engine && snap && (
        <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-md overflow-y-auto p-3 md:p-6">
          <div className="mx-auto my-2 bg-slate-900 border border-slate-700 rounded-3xl p-4 md:p-6 max-w-5xl w-full grid lg:grid-cols-[1fr_320px] gap-5">
            <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <div className="text-[10px] tracking-[0.25em] text-cyan-300 uppercase">
                  NTSA Practical Test · Chief Instructor: <b className="text-yellow-300">zingri_master</b>
                </div>
                <h2 className="text-xl md:text-2xl font-black">{snap.challenge || 'Nairobi CBD Model Town Route Test'}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { engine.quitToMenu(); setScreen('vehicle'); }} className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold">🚗 Change Vehicle</button>
                <button onClick={() => start()} className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold">🔀 New Route</button>
                <button onClick={(e) => { e.currentTarget.blur(); engine.paused = false; setScreen('playing'); }} className="px-6 py-2.5 rounded-xl bg-yellow-400 text-slate-950 font-black hover:bg-yellow-300 shadow-[0_0_20px_rgba(250,204,21,0.35)]">▶ Begin Test</button>
              </div>
            </div>
            <div className="min-w-0">
              <MapCanvas width={mapW} height={Math.round(mapW * 0.6)} showLabels showLandmarks blocked={snap.blocked} dest={snap.dest} start={startPose} route={showRoute ? snap.route : null} />
              <label className="flex items-center gap-2 mt-3 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={showRoute} onChange={e => setShowRoute(e.target.checked)} className="accent-yellow-400" /> Reveal the correct MTB route (practice aid)
              </label>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <div className="bg-slate-800/60 rounded-xl p-4"><div className="text-xs text-slate-400">Your vehicle</div><div className="font-bold">{snap.vehicle}</div></div>
              <div className="bg-slate-800/60 rounded-xl p-4">
                <div className="text-xs text-yellow-300 font-semibold">🧑‍✈️ Chief Instructor zingri_master:</div>
                <div className="font-semibold mt-1">
                  "You are on <b className="text-orange-300">{engine.route ? EDGES[engine.route.states[0].e].name : ''}</b> heading to {engine.route ? NODES[dTo(engine.route.states[0])].label : ''}. Drive to <b className="text-emerald-300">{snap.destName}</b>."
                </div>
              </div>
              {snap.blocked.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-200">
                  <div className="text-xs uppercase tracking-widest mb-1">Road closures</div>
                  {snap.blocked.map(b => <div key={b}>🚧 {EDGES[b].name} ({EDGES[b].a}–{EDGES[b].b})</div>)}
                </div>
              )}
              {showRoute && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 text-cyan-100 text-xs">
                  {snap.ruleText}
                  <div className="mt-1 text-slate-300">Route: {snap.route?.join(' → ')}</div>
                </div>
              )}
              <div className="bg-slate-800/60 rounded-xl p-4 text-xs text-slate-300">
                Before moving: <b>B</b> seatbelt · <b>V</b> mirrors · <b>I</b> engine · <b>Space</b> release handbrake. Indicators: <b>,</b> Left · <b>.</b> Right · <b>/</b> Hazard.
              </div>
              <button onClick={(e) => { e.currentTarget.blur(); engine.paused = false; setScreen('playing'); }} className="mt-auto py-3.5 rounded-xl bg-yellow-400 text-slate-950 font-black text-lg hover:bg-yellow-300">▶ Begin Test</button>
              <button onClick={toMenu} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700">Cancel</button>
            </div>
            <div className="lg:col-span-2"><FooterBar /></div>
          </div>
        </div>
      )}

      {screen === 'results' && result && (
        <Results
          r={result}
          meritsEarned={lastReward.merits}
          newlyLicensed={lastReward.newlyLicensed}
          onRetry={() => start()}
          onMenu={toMenu}
        />
      )}
    </div>
  );
}
