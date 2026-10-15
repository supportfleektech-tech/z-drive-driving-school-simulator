import type { EndResult } from '../game/engine';
import { OFFENSES } from '../game/rules';

export default function Results({
  r,
  meritsEarned,
  newlyLicensed,
  onRetry,
  onMenu,
}: {
  r: EndResult;
  meritsEarned?: number;
  newlyLicensed?: boolean;
  onRetry: () => void;
  onMenu: () => void;
}) {
  const mm = (t: number) => `${Math.floor(t / 60)}m ${Math.floor(t % 60)}s`;
  const grouped = Object.values(
    r.offenses.reduce((acc, o) => {
      (acc[o.id] ??= { ...o, count: 0 }).count++;
      return acc;
    }, {} as Record<string, (typeof r.offenses)[0] & { count: number }>),
  );
  const minors = r.offenses.filter(o => o.sev === 'minor').length;
  const majors = r.offenses.filter(o => o.sev === 'major').length;
  const fails = r.offenses.filter(o => o.sev === 'fail').length;

  return (
    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md overflow-auto text-white flex items-start justify-center p-6 z-40">
      <div className="w-full max-w-4xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
        <div className={`relative px-8 py-6 ${r.passed ? 'bg-gradient-to-r from-emerald-700/60 to-emerald-900/40' : 'bg-gradient-to-r from-red-700/60 to-red-950/40'}`}>
          <div className="text-xs uppercase tracking-[0.25em] text-white/80">
            NTSA Assessment · Chief Instructor: <b className="text-yellow-300">zingri_master</b> · Class {r.vehicleClass}
          </div>
          <div className="text-3xl font-black mt-1">{r.title}</div>
          <div
            className={`absolute right-8 top-5 rotate-[-8deg] border-4 rounded-xl px-5 py-2 text-3xl font-black tracking-widest ${
              r.passed ? 'border-emerald-300 text-emerald-200' : 'border-red-300 text-red-200'
            }`}
          >
            {r.passed ? 'PASSED' : 'FAILED'}
          </div>
        </div>

        <div className="grid md:grid-cols-[230px_1fr] gap-6 p-8">
          <div className="flex flex-col items-center">
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="44" stroke="#1e293b" strokeWidth="8" fill="none" />
                <circle cx="50" cy="50" r="44" stroke={r.score >= 70 ? '#34d399' : '#f87171'} strokeWidth="8" fill="none" strokeDasharray={`${r.score * 2.76} 276`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-4xl font-black">{r.score}</div>
                <div className="text-[10px] text-slate-400 tracking-widest">/ 100</div>
              </div>
            </div>

            {meritsEarned !== undefined && (
              <div className="mt-3 w-full bg-yellow-400/15 border border-yellow-400/40 rounded-xl py-2 px-3 text-center">
                <div className="text-[10px] uppercase tracking-widest text-yellow-300">Merit Points Earned</div>
                <div className="text-xl font-black text-yellow-400">+{meritsEarned} XP</div>
              </div>
            )}

            {newlyLicensed && (
              <div className="mt-2 w-full bg-emerald-500/20 border border-emerald-400 rounded-xl py-2 px-3 text-center animate-pulse">
                <div className="text-xs font-black text-emerald-300">🎓 CLASS {r.vehicleClass} LICENSE UNLOCKED!</div>
                <div className="text-[10px] text-emerald-100">Available for Free Roam!</div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 mt-4 w-full text-center text-xs">
              <div className="bg-amber-500/15 rounded-lg py-2"><div className="text-lg font-bold text-amber-300">{minors}</div>Minor</div>
              <div className="bg-orange-500/15 rounded-lg py-2"><div className="text-lg font-bold text-orange-300">{majors}</div>Major</div>
              <div className="bg-red-500/15 rounded-lg py-2"><div className="text-lg font-bold text-red-300">{fails}</div>Serious</div>
            </div>
            <div className="mt-4 text-xs text-slate-400 w-full space-y-1">
              <div className="flex justify-between"><span>Time</span><span className="text-white">{mm(r.time)}</span></div>
              <div className="flex justify-between"><span>Distance</span><span className="text-white">{(r.distance / 1000).toFixed(2)} km</span></div>
            </div>
            <div className="text-[10px] text-slate-500 mt-3 text-center">Pass requires ≥ 70 points, no serious faults and at most 2 major faults.</div>
          </div>

          <div>
            {r.stats.length > 0 && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-4 text-sm space-y-1">
                {r.stats.map((s, i) => <div key={i}>• {s}</div>)}
              </div>
            )}
            <h3 className="font-bold mb-2">Chief Instructor zingri_master's Fault Sheet</h3>
            {grouped.length === 0 ? (
              <div className="text-emerald-300 bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-4">
                Clean drive — no faults recorded. Excellent lane discipline and observation! 🇰🇪
              </div>
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-auto pr-1">
                {grouped.map(o => (
                  <div
                    key={o.id}
                    className={`rounded-xl border p-3 ${
                      o.sev === 'fail' ? 'border-red-500/50 bg-red-500/10' : o.sev === 'major' ? 'border-orange-500/40 bg-orange-500/10' : 'border-amber-500/30 bg-amber-500/5'
                    }`}
                  >
                    <div className="flex justify-between text-sm font-semibold">
                      <span>{o.label}{o.count > 1 ? ` ×${o.count}` : ''}</span>
                      <span className="text-xs uppercase opacity-70">{o.sev === 'fail' ? 'Serious' : o.sev} · -{o.points * o.count}</span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1">💡 {OFFENSES[o.id]?.tip}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={onRetry} className="flex-1 py-3 rounded-xl bg-yellow-400 text-slate-950 font-bold hover:bg-yellow-300">Try Again</button>
              <button onClick={onMenu} className="flex-1 py-3 rounded-xl bg-slate-800 font-semibold hover:bg-slate-700">Main Menu</button>
            </div>
            <div className="text-center text-[11px] text-slate-500 mt-4">
              Developed solely by <b className="text-slate-300">zingi_master</b> · Powered by <b className="text-yellow-400">ZingTrixx Lab™</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
