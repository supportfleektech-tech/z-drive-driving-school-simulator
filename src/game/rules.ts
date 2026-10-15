import {
  NODES, EDGES, ROAD, type DEdge, type Locate, dTo, dFrom, classifyTurn, requiredLane, approachControl, transitionAllowed,
  ROUND_LIMIT, JUNCTION_LIMIT, RB_ISLAND, RB_OUTER, type PlannedRoute, dKey,
} from './map';
import type { Signals, Pedestrian, Agent } from './traffic';
import type { Crossing } from './world';

export type Severity = 'minor' | 'major' | 'fail';
export const OFFENSES: Record<string, { label: string; sev: Severity; points: number; tip: string }> = {
  SPEEDING: { label: 'Exceeding the speed limit', sev: 'minor', points: 4, tip: 'Watch the circular speed-limit signs. Major roads 60, minor/two-way 50, roundabouts 30, parking 10 km/h.' },
  SPEEDING_MAJOR: { label: 'Excessive speeding (20+ km/h over)', sev: 'major', points: 15, tip: 'Grossly exceeding the limit is a serious fault in the NTSA test.' },
  RED_LIGHT: { label: 'Jumped a red traffic light', sev: 'fail', points: 40, tip: 'Stop behind the continuous white stop line whenever the light is red or amber (if safe).' },
  STOP_SIGN: { label: 'Failed to stop at STOP line', sev: 'major', points: 15, tip: 'A continuous white line across the road = STOP. Come to a complete halt before proceeding.' },
  GIVE_WAY_ROUND: { label: 'Failed to give way to traffic from the right at roundabout', sev: 'major', points: 15, tip: 'Traffic already on the roundabout (coming from your right) has priority.' },
  ROUND_ANTICLOCK: { label: 'Drove anticlockwise in roundabout', sev: 'fail', points: 40, tip: 'Always circulate the traffic island CLOCKWISE, keeping left.' },
  ROUND_STOP: { label: 'Stopped inside the roundabout', sev: 'major', points: 15, tip: 'No stopping, parking or waiting on a roundabout.' },
  ROUND_WRONG_LANE: { label: 'Approached roundabout in the wrong lane', sev: 'major', points: 15, tip: '4-lane road: Lane 1 left (90°), Lane 2 straight (180°), Lane 3 right (270°), Lane 4 full circle (360°). 3-lane road: Lane 3 for 270°.' },
  ROUND_HORN: { label: 'Hooted inside the roundabout', sev: 'minor', points: 4, tip: 'Hooting is prohibited on the roundabout.' },
  NO_SIGNAL: { label: 'Turned without indicating', sev: 'minor', points: 4, tip: 'Indicate early: , (comma) = Left, . (period) = Right. Signal left before leaving a roundabout.' },
  NO_SIGNAL_LANE: { label: 'Changed lanes without indicating', sev: 'minor', points: 4, tip: 'Mirror – Signal – Manoeuvre before every lane change.' },
  WRONG_SIGNAL: { label: 'Misleading signal', sev: 'minor', points: 4, tip: 'Cancel indicators after turning so other road users are not misled.' },
  CROSS_CONT_YELLOW: { label: 'Crossed continuous yellow line (no overtaking)', sev: 'major', points: 15, tip: 'Continuous yellow line = NO overtaking. Only overtake from the right where the yellow line is broken.' },
  CROSS_CONT_WHITE: { label: 'Changed lanes over continuous white line', sev: 'minor', points: 4, tip: 'Continuous white lane lines near junctions mean stay in your chosen lane.' },
  STRADDLE: { label: 'Straddling lanes', sev: 'minor', points: 4, tip: 'Keep within one lane — lanes are counted from the left (Lane 1 = outermost).' },
  WRONG_SIDE: { label: 'Driving on the wrong side of the road', sev: 'major', points: 15, tip: 'Kenya drives on the LEFT. Return to your side after overtaking.' },
  WRONG_WAY: { label: 'Driving against traffic on a dual carriageway', sev: 'fail', points: 40, tip: 'Each carriageway of a dual carriageway is one-way. Never cross the central reserve.' },
  NO_ENTRY: { label: 'Entered a one-way road the wrong way', sev: 'fail', points: 40, tip: 'Angle parking (P1) is one-way — entry only from the top access.' },
  ILLEGAL_TURN: { label: 'Illegal turn across central reserve', sev: 'major', points: 15, tip: 'At side junctions on dual carriageways only left-in / left-out turns are allowed.' },
  KERB: { label: 'Mounted / struck the kerb', sev: 'minor', points: 4, tip: 'Judge your vehicle width, especially on turns and at the yellow kerb.' },
  COLLISION: { label: 'Collision', sev: 'fail', points: 40, tip: 'Keep a safe following distance and observe all around.' },
  PEDESTRIAN: { label: 'Failed to give way to pedestrian at zebra crossing', sev: 'fail', points: 40, tip: 'Pedestrians on a zebra crossing have absolute priority.' },
  WRONG_ROUTE: { label: 'Deviated from the correct MTB route', sev: 'major', points: 15, tip: 'Rule 1: shortest & most correct route without parking. Rule 2: longest if short one is blocked. Rule 3: parking last.' },
  PARKING_ROUTE: { label: 'Used a parking zone as a route when another route existed', sev: 'major', points: 15, tip: 'MTB Rule 3: a parking zone may only be used as the LAST and final option.' },
  NO_SEATBELT: { label: 'Moved off without seatbelt', sev: 'major', points: 15, tip: 'Press B to fasten your seatbelt before moving off.' },
  HANDBRAKE: { label: 'Driving with handbrake applied', sev: 'minor', points: 4, tip: 'Release the handbrake (Space) before moving off.' },
  NO_LIGHTS: { label: 'Driving at night without headlights', sev: 'minor', points: 4, tip: 'Press L to switch on headlights at dusk and night.' },
  HARSH_BRAKE: { label: 'Harsh braking', sev: 'minor', points: 4, tip: 'Anticipate hazards and brake progressively.' },
  ENGINE_STALL: { label: 'Stalled the engine (clutch released without bite/gas)', sev: 'minor', points: 4, tip: 'Hold Q for full clutch in; hold Q + Left Shift for the bite point while balancing gas (W), then release.' },
  GEAR_GRIND: { label: 'Grinded gears (shifted without pressing clutch Q)', sev: 'minor', points: 4, tip: 'In manual transmission, hold Q (full clutch in) before moving the H-shifter.' },
  NO_WIPERS: { label: 'Driving in rain without windshield wipers', sev: 'minor', points: 4, tip: 'Press Y (or click WIPERS on the dashboard) to clear the windshield in wet weather.' },
  HILL_ROLLBACK: { label: 'Rolled backward on hill incline', sev: 'major', points: 15, tip: 'On a hill start, hold with the handbrake, find the clutch bite point (Q + Left Shift) + gas, then release the handbrake.' },
};

export interface Offense { id: string; label: string; sev: Severity; points: number; time: number; where: string }

export interface PlayerCtx {
  x: number; z: number; heading: number; speed: number; kmh: number; accel: number; length: number; width: number;
  indicator: number; horn: boolean; seatbelt: boolean; handbrake: boolean; headlights: boolean; night: boolean; onPavement: boolean; loc: Locate;
}

interface EdgeInfo { d: DEdge; lane: number; side: number; along: number; remaining: number }

export class RuleMonitor {
  time = 0; offenses: Offense[] = []; cool: Record<string, number> = {};
  lastEdge: EdgeInfo | null = null; zone = ''; entry: { d: DEdge; lane: number; node: string; rightBefore: boolean; leftAtEntry: boolean; indAtEntry: number } | null = null;
  indT: Record<number, number> = { 1: -99, [-1]: -99 };
  stopMin = 99; stopTrackEdge = ''; speedT = 0; straddleT = 0; wrongSideT = 0; wrongWayT = 0; roundAntiT = 0; roundStopT = 0; hbT = 0;
  laneHold = 0; pedDone = new Set<string>(); beltDone = false; parkingDone = false; wrongRouteCount = 0;
  route: PlannedRoute | null = null; routeIdx = 0; dest = ''; blocked = new Set<string>();
  suppressHarsh = false; enabled = true; limit = 50;
  onOffense: (o: Offense) => void = () => { };
  onArrive: () => void = () => { };
  onReroute: (from: DEdge) => void = () => { };
  onNode: (node: string, exit: DEdge | null) => void = () => { };

  flag(id: string, cooldown = 5, where = '') {
    if (!this.enabled) return; if ((this.cool[id] ?? -99) > this.time) return; this.cool[id] = this.time + cooldown;
    const d = OFFENSES[id]; const o: Offense = { id, label: d.label, sev: d.sev, points: d.points, time: this.time, where };
    this.offenses.push(o); this.onOffense(o);
  }
  collision(kind: 'solid' | 'kerb' | 'vehicle' | 'ped', impact: number) {
    if (kind === 'kerb') { this.flag('KERB', 4); return; }
    if (kind === 'ped') { this.flag('PEDESTRIAN', 10); return; }
    if (impact > 1.2 || kind === 'vehicle') this.flag('COLLISION', 6); else this.flag('KERB', 4);
  }

  update(dt: number, p: PlayerCtx, signals: Signals, peds: Pedestrian[], crossings: Crossing[], agents: Agent[]) {
    this.time += dt;
    if (p.indicator !== 0) this.indT[p.indicator] = this.time;
    const moving = Math.abs(p.speed) > 0.8; const fwd = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
    const loc = p.loc; const zoneKey = loc.kind === 'node' ? 'N:' + loc.node!.id : loc.kind === 'edge' ? 'E:' + loc.edge!.id : loc.kind === 'lot' ? 'L:' + loc.lot : 'off';
    // ---- global checks
    if (moving && !p.seatbelt && !this.beltDone) { this.beltDone = true; this.flag('NO_SEATBELT', 999); }
    if (Math.abs(p.speed) > 2 && p.handbrake) { this.hbT += dt; if (this.hbT > 1) this.flag('HANDBRAKE', 20); } else this.hbT = 0;
    if (p.night && Math.abs(p.speed) > 2 && !p.headlights) this.flag('NO_LIGHTS', 30);
    if (p.onPavement && moving) this.flag('KERB', 5, 'pavement');
    if (!this.suppressHarsh && p.accel < -7.5 && p.speed > 3) this.flag('HARSH_BRAKE', 10);
    // ---- speed limit
    let limit = 50;
    if (loc.kind === 'edge') limit = ROAD[loc.edge!.type].limit; else if (loc.kind === 'node') limit = loc.node!.kind === 'round' ? ROUND_LIMIT : JUNCTION_LIMIT; else if (loc.kind === 'lot') limit = 10;
    this.limit = limit;
    if (p.kmh > limit + 4) { this.speedT += dt; if (this.speedT > 1.5) this.flag(p.kmh > limit + 20 ? 'SPEEDING_MAJOR' : 'SPEEDING', 10); } else this.speedT = Math.max(0, this.speedT - dt);

    // ---- edge checks
    if (loc.kind === 'edge' && loc.edge!.type !== 'parking') {
      const e = loc.edge!; const r = ROAD[e.type];
      const dir: 1 | -1 = (fwd.x * e.dx + fwd.z * e.dz) >= 0 ? 1 : -1;
      const side = -dir * loc.lat!;
      const along = dir === 1 ? loc.along! - e.trimA : e.len - e.trimB - loc.along!;
      const remaining = dir === 1 ? e.len - e.trimB - loc.along! : loc.along! - e.trimA;
      let lane = 1;
      if (r.dual) lane = Math.max(1, Math.min(r.lanes, r.lanes - Math.floor((side - r.reserve / 2) / r.laneW)));
      if (p.speed > 0.5) {
        if (r.dual) {
          if (side < 0) { this.wrongWayT += dt; if (this.wrongWayT > 0.6) this.flag('WRONG_WAY', 8); } else this.wrongWayT = 0;
          // lane changes
          if (this.lastEdge && this.lastEdge.d.e === e.id && this.lastEdge.d.dir === dir && this.lastEdge.lane !== lane && side > 0) {
            const lanePos = (side - r.reserve / 2) / r.laneW; const frac = lanePos - Math.floor(lanePos);
            if (frac > 0.3 && frac < 0.7) {
              const toRight = lane > this.lastEdge.lane; const need = toRight ? -1 : 1;
              if (this.time - this.indT[need] > 4) this.flag('NO_SIGNAL_LANE', 5);
              if (remaining < 30) this.flag('CROSS_CONT_WHITE', 6);
              this.lastEdge.lane = lane;
            } else lane = this.lastEdge.lane;
          } else if (this.lastEdge && this.lastEdge.d.e === e.id && this.lastEdge.d.dir === dir) lane = this.lastEdge.lane;
          const lp = (side - r.reserve / 2) / r.laneW; const fr = lp - Math.floor(lp);
          if (side > r.reserve / 2 + 0.5 && side < r.reserve / 2 + r.lanes * r.laneW - 0.5 && (fr < 0.13 || fr > 0.87) && p.speed > 3) { this.straddleT += dt; if (this.straddleT > 3) { this.flag('STRADDLE', 10); this.straddleT = 0; } } else this.straddleT = Math.max(0, this.straddleT - dt);
        } else {
          if (side < -0.3) {
            const contZone = along < 30 || remaining < 30;
            if (contZone) this.flag('CROSS_CONT_YELLOW', 6);
            this.wrongSideT += dt; if (this.wrongSideT > 7) { this.flag('WRONG_SIDE', 10); this.wrongSideT = 0; }
          } else this.wrongSideT = 0;
        }
      }
      // stop sign tracking
      const toNode = dir === 1 ? e.b : e.a;
      if (approachControl(toNode, e.id) === 'stop' && remaining < 25) { if (this.stopTrackEdge !== e.id + dir) { this.stopTrackEdge = e.id + dir; this.stopMin = 99; } this.stopMin = Math.min(this.stopMin, Math.abs(p.speed)); }
      this.lastEdge = { d: { e: e.id, dir }, lane, side, along, remaining };
    }
    // pedestrians
    for (const pd of peds) {
      if (!pd.onRoad) continue; const e = EDGES[pd.c.edge];
      const rx = p.x - e.ax, rz = p.z - e.az; const al = rx * e.dx + rz * e.dz; const lat = rx * e.px + rz * e.pz;
      const key = `${pd.c.id}-${pd.eventId}-${pd.mesh.id}`;
      if (Math.abs(al - pd.c.along) < 2.6 && Math.abs(lat - pd.lat) < 7 && moving && !this.pedDone.has(key)) { this.pedDone.add(key); this.flag('PEDESTRIAN', 2); }
    }
    void crossings;

    // ---- node zone
    if (loc.kind === 'node') {
      const n = loc.node!;
      if (n.kind === 'round') {
        const rx = p.x - n.x, rz = p.z - n.z; const vx = fwd.x * p.speed, vz = fwd.z * p.speed;
        const dist = Math.hypot(rx, rz);
        const w = (rx * vz - rz * vx) / Math.max(1, dist);
        if (dist > RB_ISLAND && dist < RB_OUTER - 1 && w < -1.2) { this.roundAntiT += dt; if (this.roundAntiT > 0.6) this.flag('ROUND_ANTICLOCK', 10); } else this.roundAntiT = 0;
        if (Math.abs(p.speed) < 0.4 && dist < RB_OUTER - 2) {
          const blocked = agents.some(a => Math.hypot(a.x - p.x, a.z - p.z) < 10 && ((a.x - p.x) * fwd.x + (a.z - p.z) * fwd.z) > 0);
          if (!blocked) { this.roundStopT += dt; if (this.roundStopT > 3) this.flag('ROUND_STOP', 12); }
        } else this.roundStopT = 0;
        if (p.horn) this.flag('ROUND_HORN', 8);
      }
    }

    // ---- zone transitions
    if (zoneKey !== this.zone) {
      const prev = this.zone; this.zone = zoneKey;
      if (loc.kind === 'node' && prev.startsWith('E:') && this.lastEdge) this.enterNode(loc.node!.id, p, signals, agents);
      if ((loc.kind === 'edge' || loc.kind === 'lot') && prev.startsWith('N:')) {
        const e = loc.edge!; const dir: 1 | -1 = (fwd.x * e.dx + fwd.z * e.dz) >= 0 ? 1 : -1;
        this.exitNode(prev.slice(2), { e: e.id, dir });
      }
      if (loc.kind === 'lot' || (loc.kind === 'edge' && loc.edge!.type === 'parking')) {
        if (this.route && this.route.rule !== 3 && !this.parkingDone) { this.parkingDone = true; this.flag('PARKING_ROUTE', 999); }
      }
    }
  }

  enterNode(nodeId: string, p: PlayerCtx, signals: Signals, agents: Agent[]) {
    const le = this.lastEdge!; const n = NODES[nodeId]; const e = EDGES[le.d.e];
    if (dTo(le.d) !== nodeId) { this.entry = null; return; }
    this.entry = { d: le.d, lane: le.lane, node: nodeId, rightBefore: this.time - this.indT[-1] < 6, leftAtEntry: p.indicator === 1, indAtEntry: p.indicator };
    const ctl = approachControl(nodeId, e.id);
    if (ctl === 'signal' && signals.state(nodeId, e.horizontal ? 'h' : 'v') === 'red' && p.speed > 0.5) this.flag('RED_LIGHT', 10, n.label);
    if (ctl === 'stop' && this.stopTrackEdge === e.id + le.d.dir && this.stopMin > 1.4) this.flag('STOP_SIGN', 10, n.label);
    if (n.kind === 'round') {
      const aE = Math.atan2(p.z - n.z, p.x - n.x);
      const conflict = agents.some(a => {
        const d = Math.hypot(a.x - n.x, a.z - n.z); if (d < RB_ISLAND - 1 || d > RB_OUTER + 0.5 || a.speed < 1) return false;
        let da = aE - Math.atan2(a.z - n.z, a.x - n.x); while (da < 0) da += Math.PI * 2; while (da > Math.PI * 2) da -= Math.PI * 2;
        return da < 0.7 && Math.hypot(a.x - p.x, a.z - p.z) < 22;
      });
      if (conflict && p.speed > 1) this.flag('GIVE_WAY_ROUND', 10, n.label);
    }
    if (this.dest && nodeId === this.dest) this.onArrive();
  }

  exitNode(nodeId: string, out: DEdge) {
    const n = NODES[nodeId]; const en = this.entry; this.entry = null;
    if (dFrom(out) !== nodeId) return;
    if (!en || en.node !== nodeId) { this.onNode(nodeId, out); return; }
    const oe = EDGES[out.e];
    if (oe.oneway && out.dir !== 1) this.flag('NO_ENTRY', 20, n.label);
    else if (!transitionAllowed(en.d, out)) this.flag('ILLEGAL_TURN', 10, n.label);
    const t = classifyTurn(en.d, out);
    if (n.kind === 'round') {
      const req = requiredLane(EDGES[en.d.e].type, t.roundCat!);
      if (ROAD[EDGES[en.d.e].type].dual && !req.includes(en.lane)) this.flag('ROUND_WRONG_LANE', 10, `${n.label}: used Lane ${en.lane}, needed Lane ${req.join('/')}`);
      if ((t.roundCat === 'right' || t.roundCat === 'uturn') && !en.rightBefore) this.flag('NO_SIGNAL', 6, n.label);
      if (this.time - this.indT[1] > 5) this.flag('NO_SIGNAL', 6, 'exit ' + n.label);
    } else if (n.kind === 'junction') {
      if (t.kind === 'left' && this.time - this.indT[1] > 6) this.flag('NO_SIGNAL', 6, n.label);
      if ((t.kind === 'right' || t.kind === 'uturn') && this.time - this.indT[-1] > 6) this.flag('NO_SIGNAL', 6, n.label);
      if (t.kind === 'straight' && en.indAtEntry !== 0 && NODES[nodeId].edges.length > 2) this.flag('WRONG_SIGNAL', 8, n.label);
    }
    // route tracking
    if (this.route) {
      const expected = this.route.states[this.routeIdx + 1];
      if (expected && dKey(expected) === dKey(out)) this.routeIdx++;
      else if (!(en && dKey(en.d) === dKey(out))) {
        this.wrongRouteCount++; this.flag('WRONG_ROUTE', 3, n.label); this.onReroute(out);
      }
    }
    this.onNode(nodeId, out);
  }

  score() { return Math.max(0, 100 - this.offenses.reduce((s, o) => s + o.points, 0)); }
  failed() { return this.offenses.some(o => o.sev === 'fail'); }
}
