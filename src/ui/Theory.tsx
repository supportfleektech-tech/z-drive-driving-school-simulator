import { useMemo, useState } from 'react';
import MapCanvas from './MapCanvas';
import { NODES, EDGES, LANDMARKS, findRoute, planMTB, type DEdge, type PlannedRoute, dFrom, dTo, transitionAllowed } from '../game/map';

const QUIZ: { q: string; a: string[]; c: number; why: string }[] = [
  { q: 'What is the FIRST rule when moving the toy car on the Model Town Board?', a: ['Use the longest route', 'Use the shortest and most correct route without passing through a parking zone', 'Use the parking zone to save time', 'Always use the major road'], c: 1, why: 'Rule 1: shortest & most correct route without passing through a parking zone.' },
  { q: 'When may a parking zone be used as a route?', a: ['Whenever it is shorter', 'Never', 'Only as the last and final option', 'Only at night'], c: 2, why: 'Rule 3: parking is the LAST option when no other route exists.' },
  { q: 'How many lanes does a MAJOR road have on the MTB (counted from the left)?', a: ['2', '3', '4', '6'], c: 2, why: 'Major roads have four lanes; minor roads have three.' },
  { q: 'In which direction do you move around a roundabout in Kenya?', a: ['Anticlockwise', 'Clockwise', 'Either, if clear', 'Straight across the island'], c: 1, why: 'Keep left and circulate clockwise.' },
  { q: 'At a roundabout you must give way to traffic coming from your…', a: ['Left', 'Right', 'Behind', 'Opposite side'], c: 1, why: 'Traffic already on the roundabout comes from your right and has priority.' },
  { q: 'On a 4-lane road, which lane allows a full circle (360°) at the roundabout?', a: ['Lane 1', 'Lane 2', 'Lane 3', 'Lane 4 (innermost)'], c: 3, why: 'Only the innermost lane (Lane 4) may make a 360° turn.' },
  { q: 'On a 4-lane approach, which lane is used to turn RIGHT (270°)?', a: ['Lane 1', 'Lane 2', 'Lane 3', 'Lane 4'], c: 2, why: 'Lane 1: 90° left, Lane 2: 180° straight, Lane 3: 270° right, Lane 4: 360°.' },
  { q: 'A continuous YELLOW line along the centre of the road means…', a: ['Overtaking allowed', 'No overtaking', 'Bus lane', 'Parking allowed'], c: 1, why: 'Continuous yellow = no overtaking. Broken yellow permits overtaking from the right.' },
  { q: 'Which is NOT allowed inside a roundabout?', a: ['Keeping left', 'Stopping, parking, overtaking or hooting', 'Indicating left before exit', 'Moving clockwise'], c: 1, why: 'No stopping, hooting, changing lanes, overtaking or parking in the roundabout.' },
  { q: 'On the MTB a continuous white line ACROSS the road represents…', a: ['Give way', 'Stop', 'Zebra crossing', 'Bus stop'], c: 1, why: 'Continuous white line across the road = STOP. Broken white line = GIVE WAY.' },
  { q: 'Angle (controlled) parking: how do you park and exit?', a: ['Reverse in, drive out forward', 'Park forward from the furthest end, exit by reversing', 'Park anywhere', 'Only heavy vehicles may park'], c: 1, why: 'Angle parking: forward gear in from the furthest end, reverse out. Saloon cars only.' },
  { q: 'Flush (parallel) parking: how do you park and exit?', a: ['Park by reversing, exit forward', 'Park forward, exit reversing', 'Drive through', 'Stop in the middle lane'], c: 0, why: 'Flush parking: reverse in, exit forward.' },
  { q: 'The green centre part of the roundabout is called the…', a: ['Central reserve', 'Traffic island', 'Channelizing strip', 'Yellow kerb'], c: 1, why: 'The green centre is the traffic island.' },
  { q: 'A yellow kerb marks a place where…', a: ['Parking is allowed', 'Stopping/parking is prohibited', 'Pedestrians must cross', 'Speed limit is 80'], c: 1, why: 'Yellow kerb: no stopping or parking.' },
];

const SHUFFLED_QUIZ_ORDER = [...QUIZ.keys()].sort(() => Math.random() - 0.5);

function genPuzzle() {
  const edges = Object.values(EDGES).filter(e => e.type !== 'parking');
  const destNodes = [...new Set(LANDMARKS.map(l => l.node))].filter(n => NODES[n].kind !== 'round');
  for (let i = 0; i < 400; i++) {
    const e = edges[Math.floor(Math.random() * edges.length)]; const start: DEdge = { e: e.id, dir: Math.random() < 0.5 ? 1 : -1 };
    const dest = destNodes[Math.floor(Math.random() * destNodes.length)]; if (dest === e.a || dest === e.b) continue;
    const ideal = findRoute(start, dest, { allowParking: false }); if (!ideal || ideal.length < 250) continue;
    const want = Math.random() < 0.34 ? 1 : Math.random() < 0.6 ? 2 : 3; const blocked: string[] = []; let cur: ReturnType<typeof findRoute> = ideal;
    if (want > 1) for (let k = 0; k < 5 && cur; k++) { const cand = cur.states.slice(1).map(s => s.e).filter(x => EDGES[x].type !== 'parking'); if (!cand.length) break; blocked.push(cand[Math.floor(Math.random() * cand.length)]); cur = findRoute(start, dest, { allowParking: false, blocked: new Set(blocked) }); if (want === 2 && cur) break; }
    const r = planMTB(start, dest, new Set(blocked)); if (!r || (r.rule !== want && i < 300)) continue;
    return { start, dest, blocked, route: r };
  }
  const start: DEdge = { e: 'e22', dir: 1 }; return { start, dest: 'K', blocked: [], route: planMTB(start, 'K', new Set())! };
}

export default function Theory({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'board' | 'quiz' | 'rules'>('board');
  const [pz, setPz] = useState(genPuzzle);
  const [picked, setPicked] = useState<string[]>(() => [dTo(pz.start)]);
  const [result, setResult] = useState<null | { ok: boolean; text: string; route: PlannedRoute }>(null);
  const [tally, setTally] = useState({ ok: 0, n: 0 });
  const [qi, setQi] = useState(0); const [ans, setAns] = useState<number | null>(null); const [qScore, setQScore] = useState(0);
  const order = useMemo(() => SHUFFLED_QUIZ_ORDER, []);
  const se = EDGES[pz.start.e];
  const startPose = useMemo(() => { const s = pz.start; const e = EDGES[s.e]; const al = s.dir === 1 ? e.len * 0.35 : e.len * 0.65; return { x: e.ax + e.dx * al, z: e.az + e.dz * al, heading: Math.atan2(e.dx * s.dir, e.dz * s.dir) }; }, [pz]);
  const destName = (id: string) => { const l = LANDMARKS.find(x => x.node === id); return l ? `${l.icon} ${l.name}` : NODES[id].label; };

  const pick = (id: string) => {
    if (result) return; const last = picked[picked.length - 1];
    if (id === last && picked.length > 1) { setPicked(picked.slice(0, -1)); return; }
    const eid = NODES[last].edges.find(x => { const e = EDGES[x]; return (e.a === last && e.b === id) || (e.b === last && e.a === id); });
    if (!eid) return; setPicked([...picked, id]);
  };
  const submit = () => {
    const r = pz.route; const correct = r.nodes.slice(1).join('>') === picked.join('>');
    // check legality of user's path
    let legal = true; let prev: DEdge = pz.start; const why: string[] = [];
    for (let i = 1; i < picked.length; i++) {
      const a = picked[i - 1], b = picked[i]; const eid = NODES[a].edges.find(x => { const e = EDGES[x]; return (e.a === a && e.b === b) || (e.b === a && e.a === b); })!;
      const d: DEdge = { e: eid, dir: EDGES[eid].a === a ? 1 : -1 };
      if (!transitionAllowed(prev, d) || dFrom(d) !== dTo(prev)) { legal = false; why.push(`Illegal move ${a}→${b}`); }
      if (pz.blocked.includes(eid)) { legal = false; why.push(`${EDGES[eid].name} (${a}–${b}) is CLOSED`); }
      if (EDGES[eid].type === 'parking' && r.rule !== 3) why.push('You used a parking zone although another route existed (Rule 3 violation)');
      prev = d;
    }
    const reached = picked[picked.length - 1] === pz.dest;
    const ok = correct && legal && reached;
    setResult({ ok, route: r, text: ok ? `Correct! ${r.ruleText}.` : `${!reached ? 'You did not reach the destination. ' : ''}${why.join('. ')}${why.length ? '. ' : ''}Correct route: ${r.nodes.slice(1).join(' → ')} — ${r.ruleText}.` });
    setTally(t => ({ ok: t.ok + (ok ? 1 : 0), n: t.n + 1 }));
  };
  const next = () => { const p = genPuzzle(); setPz(p); setPicked([dTo(p.start)]); setResult(null); };

  return (
    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md overflow-auto text-white">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div><h2 className="text-3xl font-black italic"><span className="text-yellow-400">MTB</span> Theory Room</h2><p className="text-slate-400 text-sm">Chief Instructor: <b className="text-yellow-300">zingri_master</b> — Plan the correct route on the Nairobi CBD Model Town Board, then test your NTSA road-rule knowledge.</p></div>
          <button onClick={onBack} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700">← Back</button>
        </div>
        <div className="flex gap-2 mb-4">{(['board', 'quiz', 'rules'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === t ? 'bg-yellow-400 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>{t === 'board' ? '🗺️ Board Route Planner' : t === 'quiz' ? '📝 Rules Quiz' : '📘 MTB Handbook'}</button>)}</div>

        {tab === 'board' && (
          <div className="grid lg:grid-cols-[1fr_320px] gap-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-3">
              <MapCanvas width={760} height={452} showLabels showLandmarks blocked={pz.blocked} dest={pz.dest} start={startPose} picked={picked} onPick={pick} highlight={result ? result.route.nodes.slice(1) : undefined} />
              <div className="text-xs text-slate-400 mt-2">Click junction nodes in order to move the toy car. Click the last node again to undo. <span className="text-orange-400">▲ Orange</span> = your car · <span className="text-pink-400">pink</span> = your route · <span className="text-lime-400">green</span> = correct route · <span className="text-red-400">✕</span> = road closed.</div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4">
                <div className="text-[10px] tracking-[0.2em] text-cyan-300 uppercase">Chief Instructor zingri_master's question</div>
                <p className="mt-1 text-sm">Your car is on <b>{se.name}</b> heading towards <b>{NODES[dTo(pz.start)].label}</b>. Move it to <b className="text-emerald-300">{destName(pz.dest)}</b> (junction {pz.dest}).</p>
                {pz.blocked.length > 0 && <p className="mt-2 text-xs text-red-300">⚠ Closed: {pz.blocked.map(b => `${EDGES[b].name} (${EDGES[b].a}–${EDGES[b].b})`).join(', ')}</p>}
                <p className="mt-2 text-xs text-slate-400">Path: {picked.join(' → ')}</p>
                {!result ? <button onClick={submit} className="mt-3 w-full py-2.5 rounded-lg bg-yellow-400 text-slate-950 font-bold">Submit Route</button> : <button onClick={next} className="mt-3 w-full py-2.5 rounded-lg bg-cyan-500 text-slate-950 font-bold">Next Question →</button>}
                {result && <div className={`mt-3 text-sm rounded-lg p-3 border ${result.ok ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200' : 'bg-red-500/15 border-red-400/40 text-red-200'}`}>{result.ok ? '✔ ' : '✘ '}{result.text}</div>}
              </div>
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 text-sm">
                <div className="font-bold mb-1">Score: <span className="text-yellow-400">{tally.ok}/{tally.n}</span></div>
                <ol className="list-decimal ml-4 text-xs text-slate-300 space-y-1">
                  <li>Shortest & most correct route <b>without</b> a parking zone.</li>
                  <li>If blocked: longest & most correct route <b>without</b> parking.</li>
                  <li>Parking zone route only as the <b>last</b> option.</li>
                </ol>
                <p className="text-[11px] text-slate-500 mt-2">P1 angle parking is one-way (P1ᵃ → P1ᵇ). Side junctions on dual carriageways allow left-in / left-out only. U-turns only at roundabouts or the U-Turn gap.</p>
              </div>
            </div>
          </div>
        )}

        {tab === 'quiz' && (() => {
          const q = QUIZ[order[qi % order.length]];
          return (
            <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-700 rounded-2xl p-6">
              <div className="flex justify-between text-xs text-slate-400 mb-2"><span>Question {qi % QUIZ.length + 1} / {QUIZ.length}</span><span>Score {qScore}</span></div>
              <h3 className="text-lg font-bold mb-4">{q.q}</h3>
              <div className="flex flex-col gap-2">
                {q.a.map((a, i) => <button key={i} disabled={ans !== null} onClick={() => { setAns(i); if (i === q.c) setQScore(s => s + 1); }} className={`text-left px-4 py-3 rounded-lg border transition ${ans === null ? 'bg-slate-800 border-slate-700 hover:border-yellow-400' : i === q.c ? 'bg-emerald-600/30 border-emerald-400' : i === ans ? 'bg-red-600/30 border-red-400' : 'bg-slate-800/50 border-slate-800 text-slate-500'}`}>{String.fromCharCode(65 + i)}. {a}</button>)}
              </div>
              {ans !== null && <><p className="mt-4 text-sm text-cyan-200">💡 {q.why}</p><button onClick={() => { setAns(null); setQi(qi + 1); }} className="mt-4 px-5 py-2 rounded-lg bg-yellow-400 text-slate-950 font-bold">Next →</button></>}
            </div>
          );
        })()}

        {tab === 'rules' && (
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            {[
              ['🛣️ Major Roads', 'Dual carriageway with a green central reserve. FOUR lanes per direction, counted from the left (Lane 1 = outermost). Speed limit 60 km/h in Z-Drive town.'],
              ['🛤️ Minor Roads', 'Dual carriageway with THREE lanes per direction. Lane 3 (innermost) is used for 270° right turns at roundabouts. 50 km/h.'],
              ['↔️ Two-Way Roads', 'Single carriageway ring road. Yellow centre line: BROKEN = you may overtake from the right; CONTINUOUS (30 m from junctions) = no overtaking.'],
              ['🔄 Roundabouts', 'Approach in the correct lane, give way to traffic from the RIGHT, go CLOCKWISE. No stopping, parking, hooting, overtaking or changing lanes inside. Signal left before exiting.'],
              ['🧭 Roundabout Lanes (4-lane)', 'Lane 1: left 90° (1st exit) · Lane 2: straight 180° · Lane 3: right 270° · Lane 4: full circle 360° (U-turn).'],
              ['🌳 Island & Reserve', 'The traffic island (green centre) controls flow. The central reserve divides dual carriageways — never cross it. U-turns only at roundabouts or designated gaps.'],
              ['🅿️ Parking Zones', 'Angle (controlled) parking P1: one-way, forward in from the furthest end, reverse out, saloon cars only. Flush (uncontrolled) P2: reverse in, exit forward.'],
              ['⬜ Road Markings', 'White continuous line across road = STOP. Broken white line across = GIVE WAY. White lane lines guide lane choice; continuous white near junctions = no lane changes.'],
              ['🦓 Pedestrian Crossings', 'Zebra crossings (with orange beacons) are uncontrolled — pedestrians on the crossing have absolute priority.'],
              ['🚦 Traffic Lights', 'Junctions C, G and M are signal-controlled. Stop at the continuous white line on red, and on amber if it is safe to do so.'],
            ].map(([t, d]) => <div key={t} className="bg-slate-900 border border-slate-700 rounded-2xl p-4"><div className="font-bold text-yellow-300 mb-1">{t}</div><p className="text-slate-300">{d}</p></div>)}
          </div>
        )}
        <div className="text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3 mt-6">
          <span>🧑‍✈️ Chief Driving Instructor: <b className="text-yellow-300">zingri_master</b></span>
          <span>Sole Developer: <b className="text-cyan-300">zingi_master</b> · Powered by <b className="text-yellow-400">ZingTrixx Lab™</b></span>
        </div>
      </div>
    </div>
  );
}
