import { useEffect, useRef, useState } from 'react';
import type { Engine, Snapshot, CamMode } from '../game/engine';
import { CAM_LABELS } from '../game/engine';
import type { AutoPos, TransMode } from '../game/physics';
import type { WeatherKind, TimeOfDay } from '../game/world';
import type { Offense } from '../game/rules';
import MapCanvas from './MapCanvas';

interface Toast { id: number; text: string; kind: string; t: number }

function Speedo({ s }: { s: Snapshot }) {
  const max = 160;
  const a0 = -225, a1 = 45;
  const ang = a0 + (a1 - a0) * Math.min(1, s.kmh / max);
  const rpmMax = s.redlineRpm || 7000;
  const rpmA = a0 + (a1 - a0) * Math.min(1, s.rpm / rpmMax);
  const arc = (r: number, from: number, to: number) => {
    const p = (a: number) => [100 + r * Math.cos((a * Math.PI) / 180), 100 + r * Math.sin((a * Math.PI) / 180)];
    const [x1, y1] = p(from), [x2, y2] = p(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const over = s.kmh > s.limit + 4;
  const leftLit = (s.indicator === 1 || s.hazard) && s.blinkOn;
  const rightLit = (s.indicator === -1 || s.hazard) && s.blinkOn;

  return (
    <svg viewBox="0 0 200 200" className="w-44 h-44 drop-shadow-[0_0_20px_rgba(0,0,0,0.75)]">
      <circle cx="100" cy="100" r="96" fill="rgba(2,6,23,0.86)" stroke="rgba(148,163,184,0.3)" strokeWidth="2" />
      <path d={arc(84, a0, a1)} stroke="rgba(148,163,184,0.22)" strokeWidth="6" fill="none" />
      <path d={arc(84, a0, ang)} stroke={over ? '#ef4444' : '#22d3ee'} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d={arc(72, a0, a1)} stroke="rgba(148,163,184,0.15)" strokeWidth="3.5" fill="none" />
      <path d={arc(72, a0, rpmA)} stroke={s.rpm > rpmMax * 0.82 ? '#f97316' : '#facc15'} strokeWidth="3.5" fill="none" />
      {Array.from({ length: 9 }).map((_, i) => {
        const a = ((a0 + ((a1 - a0) * i) / 8) * Math.PI) / 180;
        return (
          <g key={i}>
            <line x1={100 + 90 * Math.cos(a)} y1={100 + 90 * Math.sin(a)} x2={100 + 80 * Math.cos(a)} y2={100 + 80 * Math.sin(a)} stroke="#cbd5e1" strokeWidth="2" />
            <text x={100 + 62 * Math.cos(a)} y={100 + 62 * Math.sin(a) + 3} fill="#94a3b8" fontSize="9" textAnchor="middle">{i * 20}</text>
          </g>
        );
      })}
      {/* Built-in cluster turn signal arrows */}
      <text x="58" y="54" fill={leftLit ? '#22c55e' : '#1e293b'} fontSize="20" fontWeight="900" textAnchor="middle">◀</text>
      <text x="142" y="54" fill={rightLit ? '#22c55e' : '#1e293b'} fontSize="20" fontWeight="900" textAnchor="middle">▶</text>
      <text x="100" y="104" fill={over ? '#f87171' : '#f8fafc'} fontSize="38" fontWeight="800" textAnchor="middle" fontFamily="ui-monospace,monospace">{Math.round(s.kmh)}</text>
      <text x="100" y="120" fill="#94a3b8" fontSize="9" textAnchor="middle" letterSpacing="2">KM/H</text>
      <rect x="74" y="130" width="52" height="24" rx="6" fill="rgba(34,211,238,0.14)" stroke="#22d3ee" strokeWidth="1.2" />
      <text x="100" y="147" fill="#22d3ee" fontSize="14" fontWeight="800" textAnchor="middle" fontFamily="ui-monospace,monospace">{s.gear}</text>
      <text x="100" y="174" fill="#94a3b8" fontSize="9" fontWeight="600" textAnchor="middle" fontFamily="ui-monospace,monospace">{Math.round(s.rpm)} RPM</text>
    </svg>
  );
}

export default function HUD({ engine, onQuit, onRestart }: { engine: Engine; onQuit: () => void; onRestart: () => void }) {
  const [s, setS] = useState<Snapshot>(engine.snapshot());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [msgs, setMsgs] = useState<Toast[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [bigMap, setBigMap] = useState(false);
  const idRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last > 55) {
        last = t;
        setS(engine.snapshot());
      }
    };
    raf = requestAnimationFrame(tick);
    const off = engine.on({
      offense: (o: Offense) => {
        const id = ++idRef.current;
        setToasts(ts => [...ts.slice(-4), { id, text: `${o.label}${o.where ? ' — ' + o.where : ''}`, kind: o.sev, t: Date.now() }]);
        setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 5000);
      },
      message: (m: string, kind: string) => {
        const id = ++idRef.current;
        setMsgs(ms => [...ms.slice(-2), { id, text: m, kind, t: Date.now() }]);
        setTimeout(() => setMsgs(ms => ms.filter(x => x.id !== id)), 4500);
      },
    });
    const k = (e: KeyboardEvent) => {
      if (e.key === 'F1' || e.key === '?') {
        e.preventDefault();
        setShowHelp(h => !h);
      }
      if (e.key.toLowerCase() === 'm') setBigMap(b => !b);
    };
    window.addEventListener('keydown', k);
    return () => {
      cancelAnimationFrame(raf);
      off();
      window.removeEventListener('keydown', k);
    };
  }, [engine]);

  const mm = (t: number) => `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
  const sevColor = (k: string) =>
    k === 'fail' ? 'from-red-600/95 to-red-800/95 border-red-300' : k === 'major' ? 'from-orange-500/95 to-orange-700/95 border-orange-200' : 'from-amber-400/95 to-amber-600/95 border-amber-100';
  const msgColor = (k: string) =>
    k === 'fail' ? 'border-red-400 text-red-100' : k === 'warn' ? 'border-amber-400 text-amber-100' : k === 'good' ? 'border-emerald-400 text-emerald-100' : 'border-cyan-400/60 text-slate-100';

  const leftLit = (s.indicator === 1 || s.hazard) && s.blinkOn;
  const rightLit = (s.indicator === -1 || s.hazard) && s.blinkOn;
  const showAutoBox = s.transMode === 'auto' || s.transMode === 'both';
  const showManualBox = s.transMode === 'manual' || s.transMode === 'both';

  const holdDrive = (key: 'throttle' | 'brake' | 'steer', v: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      engine.unlockAudio();
      engine.touch[key] = v;
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      engine.touch[key] = 0;
    },
    onPointerLeave: () => {
      engine.touch[key] = 0;
    },
  });

  return (
    <div className="absolute inset-0 pointer-events-none select-none text-white font-sans overflow-hidden">
      {/* Vignette */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 58%, rgba(0,0,0,0.38) 100%)' }} />

      {/* Windshield Rain Droplets Overlay in Cockpit / Bonnet view */}
      {(s.cam === 'cockpit' || s.cam === 'hood') && s.rainDrops > 0.05 && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{
            opacity: Math.min(0.85, s.rainDrops),
            backgroundImage:
              'radial-gradient(2px 3px at 18% 24%, rgba(200,230,255,0.85), transparent), radial-gradient(2.5px 4px at 42% 38%, rgba(200,230,255,0.8), transparent), radial-gradient(2px 3px at 68% 19%, rgba(200,230,255,0.85), transparent), radial-gradient(3px 4px at 81% 52%, rgba(200,230,255,0.75), transparent), radial-gradient(2px 3.5px at 29% 67%, rgba(200,230,255,0.8), transparent), radial-gradient(2.5px 4px at 56% 74%, rgba(200,230,255,0.8), transparent)',
            backgroundSize: '120px 110px',
            backdropFilter: s.rainDrops > 0.45 ? 'blur(1.5px)' : 'none',
          }}
        />
      )}

      {/* TOP-LEFT: Session & Pre-Check Panel */}
      <div className="absolute top-3 left-3 pointer-events-auto max-w-[310px]">
        <div className="bg-slate-950/80 backdrop-blur-md border border-slate-700/70 rounded-xl px-3.5 py-2.5 shadow-2xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-lg font-black italic tracking-tight"><span className="text-yellow-400">Z</span>-DRIVE</span>
              <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                {s.mode === 'test' ? 'NTSA Exam' : s.mode === 'challenge' ? 'Challenge' : 'Free Roam'}
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">🕒 {s.clockStr}</span>
          </div>
          <div className="text-[11px] text-yellow-300 font-semibold mt-0.5 truncate">{s.vehicle}</div>
          {s.challenge && <div className="text-xs font-bold text-amber-300 mt-0.5">{s.challenge}</div>}
          <div className="grid grid-cols-3 gap-2 mt-2 text-center bg-slate-900/70 rounded-lg py-1">
            <div><div className="text-[8px] text-slate-500 uppercase tracking-widest">Time</div><div className="font-mono text-sm">{mm(s.time)}</div></div>
            <div><div className="text-[8px] text-slate-500 uppercase tracking-widest">Score</div><div className={`font-mono text-sm font-bold ${s.score >= 70 ? 'text-emerald-300' : 'text-red-400'}`}>{s.score}</div></div>
            <div><div className="text-[8px] text-slate-500 uppercase tracking-widest">Faults</div><div className="font-mono text-sm text-amber-300">{s.faults}</div></div>
          </div>
          {s.taxiComfort !== null && (
            <div className="mt-2">
              <div className="flex justify-between text-[10px]"><span>🚕 VIP Passenger Comfort</span><span className={s.taxiComfort >= 75 ? 'text-emerald-300 font-bold' : 'text-red-400 font-bold'}>{s.taxiComfort}%</span></div>
              <div className="h-1.5 bg-slate-800 rounded mt-0.5 overflow-hidden"><div className={`h-full ${s.taxiComfort >= 75 ? 'bg-emerald-400' : 'bg-red-500'}`} style={{ width: `${s.taxiComfort}%` }} /></div>
            </div>
          )}
        </div>

        {s.objective && (
          <div className="mt-2 bg-amber-500/15 border border-amber-400/40 rounded-lg px-3 py-2 text-xs text-amber-100 backdrop-blur-md">
            <b className="text-amber-300">OBJECTIVE · </b>{s.objective}
          </div>
        )}

        {s.phase === 'precheck' && (
          <div className="mt-2 bg-slate-950/90 border border-cyan-400/50 rounded-xl px-3 py-2.5 text-xs backdrop-blur-md shadow-xl">
            <div className="text-cyan-300 font-bold mb-1.5 tracking-wide flex justify-between items-center">
              <span>PRE-DRIVE COCKPIT DRILL</span>
              <span className="text-[9px] text-slate-400">(Click or press key)</span>
            </div>
            {([
              ['Fasten seatbelt', 'B', s.seatbelt, () => engine.toggleSeatbelt()],
              ['Adjust mirrors', 'V', s.mirrors, () => engine.checkMirrors()],
              ['Start engine', 'I', s.engineOn, () => engine.toggleEngine()],
              ['Release handbrake', 'Space', !s.handbrake, () => engine.toggleHandbrake()],
            ] as [string, string, boolean, () => void][]).map(([l, k, ok, fn]) => (
              <button
                key={l}
                onClick={fn}
                className={`w-full flex justify-between items-center py-1 px-2 rounded mb-1 text-left transition ${ok ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40' : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700'}`}
              >
                <span>{ok ? '✔' : '○'} {l}</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-[10px]">{k}</kbd>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* TOP-CENTER: Chief Instructor zingri_master + Prominent Turn-Signal & Hazard Bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 w-[min(560px,46vw)] pointer-events-auto">
        {/* High-Visibility Turn Signal & Hazard Banner */}
        <div className="flex items-center gap-2 bg-slate-950/85 backdrop-blur-md border border-slate-700/80 rounded-full px-3 py-1 shadow-xl">
          <button
            onClick={() => engine.toggleLeftIndicator()}
            title="Left Indicator (Comma ,)"
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black transition-all ${
              leftLit
                ? 'bg-amber-400 text-slate-950 shadow-[0_0_20px_#f59e0b] scale-105'
                : s.indicator === 1
                ? 'bg-amber-950 text-amber-300 border border-amber-500/60'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-base leading-none">◀</span> LEFT <kbd className="text-[10px] px-1 bg-black/30 rounded">,</kbd>
          </button>

          <button
            onClick={() => engine.toggleHazard()}
            title="Hazard Warning Blinkers (/ or Z)"
            className={`px-3 py-1 rounded-full text-xs font-black border transition-all ${
              s.hazard && s.blinkOn
                ? 'bg-red-600 text-white border-red-300 shadow-[0_0_20px_#ef4444]'
                : s.hazard
                ? 'bg-red-950 text-red-300 border-red-500'
                : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-red-300'
            }`}
          >
            ⚠️ HAZARD <kbd className="text-[10px] px-1 bg-black/30 rounded">/</kbd>
          </button>

          <button
            onClick={() => engine.toggleRightIndicator()}
            title="Right Indicator (Period .)"
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black transition-all ${
              rightLit
                ? 'bg-amber-400 text-slate-950 shadow-[0_0_20px_#f59e0b] scale-105'
                : s.indicator === -1
                ? 'bg-amber-950 text-amber-300 border border-amber-500/60'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <kbd className="text-[10px] px-1 bg-black/30 rounded">.</kbd> RIGHT <span className="text-base leading-none">▶</span>
          </button>
        </div>

        {(s.instruction || s.destName) && (
          <div className="w-full bg-slate-950/85 backdrop-blur-md border border-cyan-400/40 rounded-xl px-4 py-2 shadow-[0_0_30px_rgba(34,211,238,0.15)]">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-cyan-300">
              <span>🧑‍✈️ Chief Instructor: <b className="text-yellow-300">zingri_master</b></span>
              {s.nextDist > 0 && <span className="font-mono">{Math.round(s.nextDist)} m</span>}
            </div>
            <div className="text-sm font-semibold mt-0.5">{s.instruction || `Destination: ${s.destName}`}</div>
            {s.ruleText && <div className="text-[10px] text-slate-400 mt-0.5">{s.ruleText}</div>}
          </div>
        )}

        {s.signal && (
          <div className="flex items-center gap-2 bg-slate-950/80 rounded-full px-3 py-1 border border-slate-700 text-xs">
            {s.signal.state === 'stop' ? (
              <span className="text-red-400 font-bold">⛔ STOP line ahead</span>
            ) : s.signal.state === 'giveway' ? (
              <span className="text-amber-300 font-bold">🔻 GIVE WAY ahead</span>
            ) : (
              <>
                <span className="flex gap-1">
                  {['red', 'yellow', 'green'].map(c => (
                    <span
                      key={c}
                      className="w-3 h-3 rounded-full"
                      style={{
                        background: s.signal!.state === c ? (c === 'red' ? '#ef4444' : c === 'yellow' ? '#f59e0b' : '#22c55e') : '#1e293b',
                        boxShadow: s.signal!.state === c ? `0 0 10px ${c === 'red' ? '#ef4444' : c === 'yellow' ? '#f59e0b' : '#22c55e'}` : 'none',
                      }}
                    />
                  ))}
                </span>
                <span>Traffic signal</span>
              </>
            )}
            <span className="font-mono text-slate-400">{Math.round(s.signal.dist)} m</span>
          </div>
        )}

        {msgs.map(m => (
          <div key={m.id} className={`bg-slate-950/90 border-l-4 ${msgColor(m.kind)} rounded-md px-3 py-1.5 text-xs backdrop-blur-md shadow-lg animate-[fadeIn_.25s]`}>
            {m.text}
          </div>
        ))}
      </div>

      {/* TOP-RIGHT: Minimap + Weather/Camera Quick Controls + Fault Toasts */}
      <div className="absolute top-3 right-3 pointer-events-auto flex flex-col items-end gap-2">
        <div className="bg-slate-950/85 border border-slate-700/70 rounded-xl p-1.5 shadow-2xl">
          <div className="cursor-pointer" onClick={() => setBigMap(b => !b)}>
            <MapCanvas
              width={bigMap ? 540 : 240}
              height={bigMap ? 320 : 144}
              route={s.route}
              routeIdx={s.routeIdx}
              blocked={s.blocked}
              dest={s.dest}
              player={{ x: s.x, z: s.z, heading: s.heading }}
              cars={s.aiCars}
              showLabels={bigMap}
              showLandmarks={bigMap}
              bay={s.bay}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400 px-1 pt-1">
            <button onClick={() => setBigMap(b => !b)} className="hover:text-white">🗺️ {bigMap ? 'Shrink (M)' : 'Expand (M)'}</button>
            <button onClick={() => engine.cycleCam()} className="text-cyan-300 hover:text-cyan-200 font-semibold">🎥 {CAM_LABELS[s.cam]} (C)</button>
          </div>
          {/* Quick Weather & Time-of-Day Strip */}
          <div className="flex items-center justify-between gap-1 mt-1 pt-1 border-t border-slate-800 text-[10px]">
            <div className="flex gap-1">
              {([
                ['clear', '☀️'],
                ['rain', '🌧️'],
                ['storm', '⛈️'],
                ['fog', '🌫️'],
                ['snow', '❄️'],
              ] as [WeatherKind, string][]).map(([w, ic]) => (
                <button
                  key={w}
                  title={`Weather: ${w}`}
                  onClick={() => engine.applySettings({ weather: w })}
                  className={`px-1.5 py-0.5 rounded ${s.weather === w ? 'bg-cyan-500/30 border border-cyan-400 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
                >
                  {ic}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {([
                ['day', 'Day'],
                ['dusk', 'Dusk'],
                ['night', 'Night'],
                ['cycle', '24h'],
              ] as [TimeOfDay, string][]).map(([tm, lb]) => (
                <button
                  key={tm}
                  onClick={() => engine.applySettings({ time: tm })}
                  className={`px-1.5 py-0.5 rounded ${engine.settings.time === tm ? 'bg-yellow-400 text-slate-950 font-bold' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
                >
                  {lb}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 items-end">
          {toasts.map(t => (
            <div key={t.id} className={`bg-gradient-to-r ${sevColor(t.kind)} border rounded-lg px-3 py-2 text-xs font-semibold shadow-xl max-w-[300px]`}>
              <span className="uppercase text-[9px] tracking-widest opacity-85 block">
                {t.kind === 'fail' ? 'Serious fault' : t.kind === 'major' ? 'Major fault' : 'Minor fault'}
              </span>
              {t.text}
            </div>
          ))}
        </div>
      </div>

      {/* BOTTOM-LEFT: Road/Biome Info + Interactive Electronic Dashboard Switches + Virtual Touch Pedals */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-2 pointer-events-auto max-w-[430px]">
        {/* Virtual Steering & Gas/Brake Touch Bar for Mouse/Touch users */}
        <div className="flex items-center gap-1.5 bg-slate-950/75 backdrop-blur-md border border-slate-800 rounded-xl p-1.5">
          <button {...holdDrive('steer', 1)} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-cyan-500 active:text-slate-950 font-bold text-xs">◀ Steer L (A)</button>
          <button {...holdDrive('steer', -1)} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-cyan-500 active:text-slate-950 font-bold text-xs">Steer R (D) ▶</button>
          <button {...holdDrive('brake', 1)} className="px-3 py-2 rounded-lg bg-red-900/70 hover:bg-red-800 active:bg-red-500 border border-red-500/50 font-bold text-xs">🛑 BRAKE (S)</button>
          <button {...holdDrive('throttle', 1)} className="px-3.5 py-2 rounded-lg bg-emerald-900/70 hover:bg-emerald-800 active:bg-emerald-400 active:text-slate-950 border border-emerald-500/50 font-bold text-xs">⚡ GAS (W)</button>
        </div>

        <div className="bg-slate-950/80 backdrop-blur-md border border-slate-700/70 rounded-xl px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold truncate">{s.roadName}</span>
            <span className="text-[10px] text-amber-300 font-mono">Grip {s.gripPct}% {s.slopePct !== 0 ? `· Slope ${s.slopePct > 0 ? '+' : ''}${s.slopePct}%` : ''}</span>
          </div>
          <div className={`text-xs ${s.laneInfo.startsWith('⚠') ? 'text-red-400 font-bold' : 'text-cyan-200'}`}>{s.laneInfo}</div>
        </div>

        {/* Clickable Electronic Switches Bar */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => engine.toggleSeatbelt()}
            className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition ${
              s.seatbelt ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200' : 'border-slate-700 bg-slate-900/80 text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-sm leading-none">🔒</span>BELT (B)
          </button>

          <button
            onClick={() => engine.toggleEngine()}
            className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition ${
              s.engineOn ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200' : 'border-red-500/60 bg-red-950/70 text-red-300 animate-pulse'
            }`}
          >
            <span className="text-sm leading-none">🔑</span>{s.engineOn ? 'ENG ON (I)' : 'START (I)'}
          </button>

          <button
            onClick={() => engine.toggleHandbrake()}
            className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition ${
              s.handbrake ? 'border-amber-400/70 bg-amber-500/25 text-amber-200' : 'border-slate-700 bg-slate-900/80 text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-sm leading-none">🅿️</span>P-BRAKE (Spc)
          </button>

          <button
            onClick={() => engine.toggleHeadlights()}
            className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition ${
              s.headlights ? 'border-yellow-300 bg-yellow-400/25 text-yellow-200 shadow-[0_0_12px_rgba(250,204,21,0.4)]' : 'border-slate-700 bg-slate-900/80 text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-sm leading-none">💡</span>LIGHTS (L)
          </button>

          <button
            onClick={() => engine.cycleWipers()}
            className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition ${
              s.wipers > 0 ? 'border-cyan-400 bg-cyan-500/25 text-cyan-200' : 'border-slate-700 bg-slate-900/80 text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-sm leading-none">🌧️</span>WIPER {s.wipers === 0 ? 'OFF' : s.wipers === 1 ? 'LOW' : 'FAST'} (Y)
          </button>

          <button
            onPointerDown={(e) => { e.preventDefault(); engine.setHorn(true); }}
            onPointerUp={(e) => { e.preventDefault(); engine.setHorn(false); }}
            onPointerLeave={() => engine.setHorn(false)}
            className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition ${
              s.horn ? 'border-orange-400 bg-orange-500 text-slate-950 shadow-[0_0_16px_#f97316] scale-105' : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-orange-400'
            }`}
          >
            <span className="text-sm leading-none">📯</span>HORN (H)
          </button>

          <button
            onClick={() => engine.checkMirrors()}
            className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition ${
              s.mirrors ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 bg-slate-900/80 text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-sm leading-none">🪞</span>MIRROR (V)
          </button>
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-400 bg-slate-950/75 rounded-lg px-2.5 py-1 border border-slate-800">
          <span><button onClick={() => setShowHelp(true)} className="text-cyan-300 hover:underline font-semibold">F1 Controls</button> · <kbd>,</kbd> Left · <kbd>.</kbd> Right · <kbd>Q</kbd> Clutch · <kbd>Esc</kbd> Pause</span>
          <span className="text-slate-500">Dev: <b className="text-yellow-400/90">zingi_master</b> · ZingTrixx Lab™</span>
        </div>
      </div>

      {/* BOTTOM-CENTER / RIGHT: Interactive Transmission (P-R-N-D-M + Sequential + Clutch & H-Shifter) + Speedometer */}
      <div className="absolute bottom-3 right-3 flex items-end gap-3 pointer-events-auto">
        {/* Transmission & Clutch Console */}
        <div className="bg-slate-950/85 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3 shadow-2xl flex flex-col gap-2 min-w-[250px]">
          {/* Mode Switcher: AUTO | MANUAL | BOTH */}
          <div className="flex items-center justify-between gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800">
            {(['auto', 'manual', 'both'] as TransMode[]).map(tm => (
              <button
                key={tm}
                onClick={() => engine.setTransMode(tm)}
                className={`flex-1 py-1 rounded text-[10px] font-black uppercase tracking-wider transition ${
                  s.transMode === tm ? 'bg-yellow-400 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tm === 'auto' ? 'Auto (PRNDM)' : tm === 'manual' ? 'Manual (H)' : 'Both'}
              </button>
            ))}
          </div>

          {/* Automatic P–R–N–D–M Strip + Sequential M- / M+ Paddles */}
          {showAutoBox && (
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex gap-1 bg-slate-900 px-1.5 py-1 rounded-lg border border-slate-800">
                {(['P', 'R', 'N', 'D', 'M'] as AutoPos[]).map(pos => {
                  const active = !engine.car?.isManualActive && s.autoPos === pos;
                  return (
                    <button
                      key={pos}
                      onClick={() => engine.selectAutoPos(pos)}
                      className={`w-7 h-7 rounded font-mono text-xs font-black transition ${
                        active
                          ? pos === 'R'
                            ? 'bg-red-500 text-white shadow-[0_0_10px_#ef4444]'
                            : pos === 'M'
                            ? 'bg-amber-400 text-slate-950 shadow-[0_0_10px_#f59e0b]'
                            : 'bg-cyan-400 text-slate-950 shadow-[0_0_10px_#22d3ee]'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {pos}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => engine.shiftDown()}
                  title="Sequential Shift Down ([)"
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-cyan-400 active:text-slate-950 border border-slate-600 text-[10px] font-black"
                >
                  M− <kbd className="opacity-70">[</kbd>
                </button>
                <button
                  onClick={() => engine.shiftUp()}
                  title="Sequential Shift Up (] or E)"
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-cyan-400 active:text-slate-950 border border-slate-600 text-[10px] font-black"
                >
                  M+ <kbd className="opacity-70">]</kbd>
                </button>
              </div>
            </div>
          )}

          {/* Manual Clutch (Q / Q + Left Shift Bite Point) + Interactive H-Shifter Gate */}
          {showManualBox && (
            <div className="flex items-stretch gap-2.5 pt-1 border-t border-slate-800">
              {/* Clutch Pedal Bar + Interactive Bite-Point Buttons */}
              <div className="flex flex-col justify-between w-28">
                <div className="flex justify-between text-[9px] uppercase tracking-wider">
                  <span className="text-slate-400 font-bold">Clutch</span>
                  <span className={s.clutch >= 0.22 && s.clutch <= 0.68 ? 'text-emerald-300 font-bold' : 'text-cyan-300 font-mono'}>
                    {s.clutch >= 0.22 && s.clutch <= 0.68 ? 'BITE ZONE' : `${Math.round(s.clutch * 100)}%`}
                  </span>
                </div>
                {/* Visual Clutch Bar with Green Bite Zone */}
                <div className="relative h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-700 my-1">
                  {/* Green bite zone band (25%..65%) */}
                  <div className="absolute inset-y-0 left-[25%] width-[40%] w-[40%] bg-emerald-500/25 border-x border-emerald-400/50" />
                  <div
                    className={`h-full transition-all duration-75 ${
                      s.clutch >= 0.22 && s.clutch <= 0.68 ? 'bg-emerald-400' : s.clutch > 0.68 ? 'bg-cyan-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${Math.round(s.clutch * 100)}%` }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onPointerDown={(e) => { e.preventDefault(); engine.keys.add('q'); engine.keys.delete('shift'); }}
                    onPointerUp={(e) => { e.preventDefault(); engine.keys.delete('q'); }}
                    onPointerLeave={() => engine.keys.delete('q')}
                    className={`py-1 px-1.5 rounded text-[9px] font-bold border transition ${
                      s.clutch > 0.8 ? 'bg-cyan-400 text-slate-950 border-cyan-300' : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-cyan-400'
                    }`}
                  >
                    Hold <kbd>Q</kbd> Clutch In
                  </button>
                  <button
                    onPointerDown={(e) => { e.preventDefault(); engine.keys.add('q'); engine.keys.add('shift'); }}
                    onPointerUp={(e) => { e.preventDefault(); engine.keys.delete('q'); engine.keys.delete('shift'); }}
                    onPointerLeave={() => { engine.keys.delete('q'); engine.keys.delete('shift'); }}
                    className={`py-1 px-1.5 rounded text-[9px] font-bold border transition ${
                      s.clutchBiteActive ? 'bg-emerald-400 text-slate-950 border-emerald-300' : 'bg-slate-900 text-emerald-300 border-emerald-700/60 hover:border-emerald-400'
                    }`}
                  >
                    Hold <kbd>Q+Shift</kbd> Bite
                  </button>
                </div>
              </div>

              {/* H-Pattern Gate Shifter */}
              <div className="flex-1 bg-slate-900/90 border border-slate-700 rounded-xl p-1.5">
                <div className="text-[8px] text-slate-400 uppercase tracking-widest text-center mb-1">H-Shifter (Hold Q)</div>
                <div className="grid grid-cols-4 gap-1">
                  {([-1, 1, 3, 5, 0, 2, 4, 6] as const).map(g => {
                    const disabled = g > s.maxGears;
                    const label = g === -1 ? 'R' : g === 0 ? 'N' : String(g);
                    const active = engine.car?.isManualActive && s.hGear === g;
                    return (
                      <button
                        key={g}
                        disabled={disabled}
                        onClick={() => engine.selectHGear(g)}
                        className={`h-6 rounded font-mono text-[11px] font-black border transition disabled:opacity-20 ${
                          active
                            ? g === -1
                              ? 'bg-red-500 text-white border-red-300 shadow-[0_0_8px_#ef4444]'
                              : g === 0
                              ? 'bg-amber-400 text-slate-950 border-amber-200'
                              : 'bg-emerald-400 text-slate-950 border-emerald-200 shadow-[0_0_8px_#34d399]'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-yellow-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Speed Limit Sign + Speedometer Cluster */}
        <div className="flex items-end gap-2">
          <div className="flex flex-col items-center gap-2 mb-3">
            <div className="w-14 h-14 rounded-full bg-white border-[6px] border-red-600 flex items-center justify-center text-slate-900 font-black text-xl shadow-xl">
              {s.limit}
            </div>
          </div>
          <Speedo s={s} />
        </div>
      </div>

      {/* Emergency Stop Flash */}
      {s.flash && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-[120px] md:text-[150px] font-black text-red-500 drop-shadow-[0_0_40px_rgba(239,68,68,0.95)] animate-pulse italic">
            {s.flash}
          </div>
        </div>
      )}

      {/* Controls Help Modal */}
      {showHelp && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 pointer-events-auto z-40" onClick={() => setShowHelp(false)}>
          <div className="bg-slate-950/95 border border-slate-700 rounded-2xl p-6 w-[620px] max-w-[94vw]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xl font-black">Z-Drive Controls & Transmission Guide</h3>
              <button onClick={() => setShowHelp(false)} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs">Close</button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
              {[
                ['W / ↑', 'Accelerate (Gas / RPM)'],
                ['S / ↓', 'Footbrake (hold in Auto D to reverse)'],
                ['A D / ← →', 'Steer Left / Right'],
                [', (Comma)', 'Left Indicator'],
                ['. (Period)', 'Right Indicator'],
                ['/ or Z', 'Hazard Warning Blinkers'],
                ['Q (hold)', 'Full Clutch In (100% disengaged)'],
                ['Q + Left Shift', 'Clutch Bite-Point Release (balance with W!)'],
                ['1 – 6 / 0 / -', 'H-Shifter Gears 1–6 / Neutral (0) / Reverse (-)'],
                ['[ / ] (or E)', 'Sequential Shift Down (M−) / Shift Up (M+)'],
                ['Space', 'Handbrake (Parking Brake)'],
                ['H', 'Horn (hold)'],
                ['L', 'Headlights ON / OFF'],
                ['Y', 'Windshield Wipers (Off / Low / Fast)'],
                ['B / I / V', 'Seatbelt (B) · Ignition (I) · Mirrors (V)'],
                ['C / X / M', 'Cycle Camera (C) · Look Back (X) · Big Map (M)'],
              ].map(([k, d]) => (
                <div key={k} className="flex justify-between border-b border-slate-800/80 py-1">
                  <kbd className="text-cyan-300 font-mono font-bold">{k}</kbd>
                  <span className="text-slate-300 text-right">{d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pause Overlay */}
      {s.paused && (
        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center pointer-events-auto z-40">
          <div className="bg-slate-900/95 border border-slate-700 rounded-2xl p-7 w-[400px] text-center shadow-2xl">
            <div className="text-3xl font-black italic"><span className="text-yellow-400">Z</span>-DRIVE</div>
            <div className="text-slate-400 text-xs mt-1 mb-4">Paused · Chief Instructor: <b className="text-yellow-300">zingri_master</b></div>
            <div className="grid grid-cols-5 gap-1 mb-4">
              {(['chase', 'cockpit', 'hood', 'board', 'cinematic'] as CamMode[]).map(c => (
                <button
                  key={c}
                  onClick={() => engine.setCam(c)}
                  className={`text-[10px] py-2 rounded ${s.cam === c ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'}`}
                >
                  {CAM_LABELS[c].split(' ')[0]}
                </button>
              ))}
            </div>
            <button onClick={() => { engine.paused = false; }} className="w-full py-3 rounded-xl bg-yellow-400 text-slate-950 font-bold mb-2 hover:bg-yellow-300">Resume Driving</button>
            <button onClick={onRestart} className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold mb-2">Restart Session</button>
            <button onClick={onQuit} className="w-full py-3 rounded-xl bg-slate-800 hover:bg-red-900 font-semibold">Quit to Main Menu</button>
            <div className="text-[10px] text-slate-500 mt-4">Developed solely by <b className="text-slate-300">zingi_master</b> · Powered by <b className="text-yellow-400">ZingTrixx Lab™</b></div>
          </div>
        </div>
      )}
    </div>
  );
}
