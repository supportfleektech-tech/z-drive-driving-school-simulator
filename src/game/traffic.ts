import * as THREE from 'three';
import {
  NODES, EDGES, ROAD, RB_OUTER, RB_ISLAND, RB_LANE, type DEdge, dTo, dVec, transitionAllowed, classifyTurn, requiredLane,
  laneOffset, edgePoint, approachControl, halfWidth,
} from './map';
import { VEHICLES, buildVehicleRig, type VehicleRig, type VehicleSpec } from './vehicles';
import type { World, Crossing } from './world';

export type Light = 'green' | 'yellow' | 'red' ;
export class Signals {
  t = 0; offsets: Record<string, number> = { G: 0, C: 11, M: 23 };
  static CYCLE = 39;
  update(dt: number, world: World) {
    this.t += dt;
    for (const id of Object.keys(world.lights)) {
      for (const ax of ['h', 'v'] as const) {
        const st = this.state(id, ax); const set = world.lights[id][ax];
        set.red.emissiveIntensity = st === 'red' ? 3 : 0; set.yellow.emissiveIntensity = st === 'yellow' ? 3 : 0; set.green.emissiveIntensity = st === 'green' ? 3 : 0;
        set.red.color.set(st === 'red' ? 0xff3030 : 0x220000); set.yellow.color.set(st === 'yellow' ? 0xffc000 : 0x221800); set.green.color.set(st === 'green' ? 0x30ff70 : 0x002208);
      }
    }
  }
  state(nodeId: string, axis: 'h' | 'v'): Light {
    const c = (this.t + (this.offsets[nodeId] ?? 0)) % Signals.CYCLE;
    if (axis === 'h') return c < 15 ? 'green' : c < 18 ? 'yellow' : 'red';
    return c >= 19.5 && c < 34.5 ? 'green' : c >= 34.5 && c < 37.5 ? 'yellow' : 'red';
  }
  timeToChange(nodeId: string, axis: 'h' | 'v') {
    const c = (this.t + (this.offsets[nodeId] ?? 0)) % Signals.CYCLE;
    const marks = axis === 'h' ? [15, 18, 39] : [19.5, 34.5, 37.5, 39 + 19.5];
    for (const m of marks) if (m > c) return m - c; return 0;
  }
}

interface Pt { x: number; z: number }
interface Leg { pts: Pt[]; cum: number[]; len: number; kind: 'edge' | 'node'; d: DEdge; next?: DEdge; lane: number; node?: string }

function mkLeg(pts: Pt[], kind: Leg['kind'], d: DEdge, lane: number, next?: DEdge, node?: string): Leg {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { pts, cum, len: cum[cum.length - 1], kind, d, next, lane, node };
}
function legAt(l: Leg, s: number) {
  s = Math.max(0, Math.min(l.len, s)); let i = 1; while (i < l.cum.length - 1 && l.cum[i] < s) i++;
  const a = l.pts[i - 1], b = l.pts[i]; const seg = l.cum[i] - l.cum[i - 1] || 1; const t = (s - l.cum[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, h: Math.atan2(b.x - a.x, b.z - a.z) };
}

export function laneStart(d: DEdge, lane: number): Pt { const e = EDGES[d.e]; const off = laneOffset(e.type, lane); return d.dir === 1 ? edgePoint(e, e.trimA, -off) : edgePoint(e, e.len - e.trimB, off); }
export function laneEnd(d: DEdge, lane: number): Pt { const e = EDGES[d.e]; const off = laneOffset(e.type, lane); return d.dir === 1 ? edgePoint(e, e.len - e.trimB, -off) : edgePoint(e, e.trimA, off); }

export interface Agent { x: number; z: number; heading: number; speed: number; length: number; width: number; isPlayer?: boolean }

export class AICar implements Agent {
  rig: VehicleRig; leg!: Leg; s = 0; speed = 0; x = 0; z = 0; heading = 0; length: number; width: number;
  factor = 0.75 + Math.random() * 0.25; stopTimer = 0; stopped = false; waitT = 0; ghostT = 0; indicator = 0; blink = 0;
  constructor(public spec: VehicleSpec, scene: THREE.Scene, seed: number) {
    const colors = [0xf8fafc, 0x111827, 0x9ca3af, 0xb91c1c, 0x1d4ed8, 0x065f46, 0xca8a04, 0x6b21a8, 0x78350f];
    this.rig = buildVehicleRig(spec, { color: spec.kind === 'van' ? 0xffffff : colors[seed % colors.length], seed, plate: `K${'ABCDEFGH'[seed % 8]}${'ABCDEFGHJK'[seed % 10]} ${100 + seed * 7 % 900}${'ABCDEFGHJKLMNP'[seed % 14]}` });
    scene.add(this.rig.root); this.length = spec.length; this.width = spec.width;
  }
  pickNext(d: DEdge, blocked: Set<string>): DEdge {
    const node = NODES[dTo(d)]; const opts: DEdge[] = [];
    for (const eid of node.edges) {
      const e = EDGES[eid]; const nd: DEdge = { e: eid, dir: e.a === node.id ? 1 : -1 };
      if (!transitionAllowed(d, nd) || blocked.has(eid)) continue;
      if (nd.e === d.e && node.kind !== 'round') continue;
      if (e.type === 'parking' && Math.random() < 0.85) continue;
      opts.push(nd);
    }
    const noU = opts.filter(o => o.e !== d.e);
    const list = noU.length ? noU : opts;
    if (!list.length) return { e: d.e, dir: (d.dir * -1) as 1 | -1 };
    return list[Math.floor(Math.random() * list.length)];
  }
  laneFor(d: DEdge, next: DEdge) {
    const e = EDGES[d.e]; const r = ROAD[e.type]; if (!r.dual) return 1;
    const node = NODES[dTo(d)]; const t = classifyTurn(d, next);
    if (node.kind === 'round') return requiredLane(e.type, t.roundCat!)[0];
    if (t.kind === 'left') return 1; if (t.kind === 'right' || t.kind === 'uturn') return r.lanes;
    return 1 + Math.floor(Math.random() * 2);
  }
  startOn(d: DEdge, frac: number, blocked: Set<string>) {
    const next = this.pickNext(d, blocked); const lane = this.laneFor(d, next);
    this.leg = mkLeg([laneStart(d, lane), laneEnd(d, lane)], 'edge', d, lane, next);
    this.s = this.leg.len * frac; this.speed = 6; this.syncPose(1);
  }
  buildNodeLeg(blocked: Set<string>) {
    const inD = this.leg.d, out = this.leg.next!; const node = NODES[dTo(inD)];
    const oe = EDGES[out.e]; const t = classifyTurn(inD, out);
    let outLane = 1;
    if (ROAD[oe.type].dual) outLane = Math.min(ROAD[oe.type].lanes, t.roundCat === 'straight' || t.kind === 'straight' ? Math.min(this.leg.lane, 2) : 1);
    const p1 = laneEnd(inD, this.leg.lane), p2 = laneStart(out, outLane);
    const pts: Pt[] = [p1];
    if (node.kind === 'round') {
      const ie = EDGES[inD.e]; const lanes = ROAD[ie.type].lanes;
      const lane = Math.min(this.leg.lane, 4); const scale = lanes === 4 ? 1 : 4 / Math.max(lanes, 1);
      const r = RB_OUTER - (Math.min(4, (lane - 0.5) * scale + 0.0)) * RB_LANE; const rr = Math.max(RB_ISLAND + 1.6, Math.min(RB_OUTER - 1.6, r));
      const aIn = Math.atan2(p1.z - node.z, p1.x - node.x) + 0.22; let aOut = Math.atan2(p2.z - node.z, p2.x - node.x) - 0.22;
      while (aOut <= aIn + 0.2) aOut += Math.PI * 2;
      for (let a = aIn; a < aOut; a += 0.1) pts.push({ x: node.x + Math.cos(a) * rr, z: node.z + Math.sin(a) * rr });
      pts.push({ x: node.x + Math.cos(aOut) * rr, z: node.z + Math.sin(aOut) * rr });
    } else {
      const t1 = dVec(inD), t2 = dVec(out); const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      const k = inD.e === out.e ? Math.max(7, dist * 0.9) : dist * 0.5;
      const c1 = { x: p1.x + t1.x * k, z: p1.z + t1.z * k }, c2 = { x: p2.x - t2.x * k, z: p2.z - t2.z * k };
      for (let i = 1; i < 14; i++) { const u = i / 14, w = 1 - u; pts.push({ x: w * w * w * p1.x + 3 * w * w * u * c1.x + 3 * w * u * u * c2.x + u * u * u * p2.x, z: w * w * w * p1.z + 3 * w * w * u * c1.z + 3 * w * u * u * c2.z + u * u * u * p2.z }); }
    }
    pts.push(p2);
    const nl = mkLeg(pts, 'node', out, outLane, undefined, node.id); nl.next = out;
    void blocked; this.leg = nl; this.s = 0;
  }
  advanceLeg(blocked: Set<string>) {
    if (this.leg.kind === 'edge') { this.buildNodeLeg(blocked); }
    else {
      const d = this.leg.d; const next = this.pickNext(d, blocked);
      // keep lane from node leg unless needs change for next junction
      const lane = this.laneFor(d, next);
      this.leg = mkLeg([laneStart(d, lane), laneEnd(d, lane)], 'edge', d, lane, next); this.s = 0;
      this.stopped = false; this.stopTimer = 0;
    }
  }
  syncPose(k: number) {
    const p = legAt(this.leg, this.s); const ahead = legAt(this.leg, this.s + 2);
    const h = Math.atan2(ahead.x - p.x, ahead.z - p.z) || p.h;
    this.x = p.x; this.z = p.z;
    let dh = h - this.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += dh * Math.min(1, k);
  }

  update(dt: number, ctx: TrafficCtx) {
    const e = EDGES[this.leg.d.e];
    let target = this.leg.kind === 'edge' ? ROAD[e.type].limit / 3.6 * this.factor : (NODES[this.leg.node!].kind === 'round' ? 8 : 6.5);
    const rem = this.leg.len - this.s;
    const stopAt = (dist: number) => { target = Math.min(target, dist < 0.4 ? 0 : Math.sqrt(2 * 3.5 * dist)); };
    this.indicator = 0;
    if (this.leg.kind === 'edge') {
      const node = NODES[dTo(this.leg.d)]; const ctl = approachControl(node.id, e.id);
      const t = classifyTurn(this.leg.d, this.leg.next!);
      if (rem < 45) this.indicator = node.kind === 'round' ? (t.roundCat === 'left' ? 1 : t.roundCat === 'straight' ? 0 : -1) : t.kind === 'left' ? 1 : t.kind === 'right' || t.kind === 'uturn' ? -1 : 0;
      if (ctl === 'signal') {
        const st = ctx.signals.state(node.id, e.horizontal ? 'h' : 'v');
        if (st === 'red' || (st === 'yellow' && rem > 12)) stopAt(rem - 1.5);
      } else if (ctl === 'stop' && !this.stopped) {
        stopAt(rem - 1.2);
        if (rem < 4 && this.speed < 0.3) { this.stopTimer += dt; if (this.stopTimer > 1.2 && !ctx.nodeBusy(node.id, this)) this.stopped = true; }
      } else if (ctl === 'giveway' && rem < 16) {
        if (node.kind === 'round') { if (ctx.ringConflict(node.id, laneEnd(this.leg.d, this.leg.lane), this)) stopAt(rem - 1.2); }
        else if (ctx.nodeBusy(node.id, this)) stopAt(rem - 1.2);
      }
      // zebra crossings
      for (const c of ctx.world.crossings) {
        if (c.edge !== e.id) continue;
        const along = this.leg.d.dir === 1 ? c.along - (this.s + e.trimA) : (e.len - e.trimB - this.s) - c.along;
        if (along > 0 && along < 30 && ctx.crossingBusy(c.id)) stopAt(along - 4.5);
      }
    }
    // car following
    let follow = Infinity;
    if (this.ghostT <= 0) {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      for (const o of ctx.agents) {
        if (o === this) continue;
        const rx = o.x - this.x, rz = o.z - this.z; const f = rx * fx + rz * fz; if (f <= 0 || f > 32) continue;
        const lat = Math.abs(rx * fz - rz * fx); if (lat > (o.width + this.width) / 2 + 0.3) continue;
        const gap = f - (o.length + this.length) / 2; if (gap < follow) follow = gap;
      }
      for (const p of ctx.peds) {
        if (!p.onRoad) continue;
        const rx = p.x - this.x, rz = p.z - this.z; const f = rx * fx + rz * fz; if (f <= 0 || f > 20) continue;
        const lat = Math.abs(rx * fz - rz * fx); if (lat > 2.5) continue; follow = Math.min(follow, f - this.length / 2 - 1);
      }
    } else this.ghostT -= dt;
    if (follow < Infinity) target = Math.min(target, Math.max(0, (follow - 2.5) * 0.9));
    if (follow < 1.2) target = 0;
    if (this.speed < 0.2 && target < 0.2) { this.waitT += dt; if (this.waitT > 14 && follow < Infinity) { this.ghostT = 3; this.waitT = 0; } } else this.waitT = 0;
    const dv = target - this.speed; this.speed += Math.max(-7 * dt, Math.min(2.4 * dt, dv)); if (this.speed < 0) this.speed = 0;
    this.s += this.speed * dt;
    let guard = 0;
    while (this.s >= this.leg.len && guard++ < 4) { const over = this.s - this.leg.len; this.advanceLeg(ctx.blocked); this.s = Math.min(over, Math.max(0, this.leg.len - 0.01)); }
    this.syncPose(dt * 8);
    // visuals
    const r = this.rig; r.root.position.set(this.x, 0, this.z); r.root.rotation.y = this.heading;
    for (const w of r.wheels) { w.spin.rotation.x += this.speed * dt / w.r; }
    r.brakeMat.emissiveIntensity = dv < -0.5 || this.speed < 0.1 ? 2.5 : 0.35;
    this.blink += dt; const on = Math.floor(this.blink * 2.6) % 2 === 0;
    r.indL.emissiveIntensity = this.indicator === 1 && on ? 3 : 0; r.indR.emissiveIntensity = this.indicator === -1 && on ? 3 : 0;
    r.headMat.emissiveIntensity = ctx.night ? 3 : 0.2;
  }
}

export class Pedestrian {
  mesh = new THREE.Group(); legs: THREE.Mesh[] = []; arms: THREE.Mesh[] = [];
  state: 'wait' | 'walk' = 'wait'; t = Math.random() * 8; side: 1 | -1 = Math.random() < 0.5 ? 1 : -1; lat = 0; along = 0;
  x = 0; z = 0; onRoad = false; speed = 1.2 + Math.random() * 0.4; walkPhase = 0; eventId = 0;
  constructor(public c: Crossing, scene: THREE.Scene, seed: number) {
    const cloth = [0xdc2626, 0x2563eb, 0x16a34a, 0xf59e0b, 0x7c3aed, 0x0f766e][seed % 6];
    const skin = new THREE.MeshStandardMaterial({ color: [0x4a2c17, 0x6b4226, 0x3b2314][seed % 3], roughness: 0.7 });
    const cm = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.8 }); const pm = new THREE.MeshStandardMaterial({ color: 0x1f2937 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), cm); torso.position.y = 1.2; torso.castShadow = true; this.mesh.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin); head.position.y = 1.72; head.castShadow = true; this.mesh.add(head);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.6, 4, 6), pm); leg.geometry.translate(0, -0.38, 0); leg.position.set(s * 0.1, 0.85, 0); leg.castShadow = true; this.mesh.add(leg); this.legs.push(leg);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.45, 4, 6), cm); arm.geometry.translate(0, -0.28, 0); arm.position.set(s * 0.27, 1.45, 0); this.mesh.add(arm); this.arms.push(arm);
    }
    scene.add(this.mesh); this.reset();
  }
  reset() { this.lat = this.side * (this.c.hw + 1.4); this.along = this.c.along + (Math.random() - 0.5) * 2.4; this.place(); }
  place() {
    const e = EDGES[this.c.edge]; const p = edgePoint(e, this.along, this.lat); this.x = p.x; this.z = p.z;
    this.mesh.position.set(p.x, 0.18, p.z); this.onRoad = Math.abs(this.lat) < this.c.hw + 0.3 && this.state === 'walk';
  }
  update(dt: number) {
    const e = EDGES[this.c.edge];
    if (this.state === 'wait') {
      this.t -= dt; if (this.t <= 0) { this.state = 'walk'; this.eventId++; }
      this.legs.forEach(l => l.rotation.x *= 0.9); this.arms.forEach(a => a.rotation.x *= 0.9);
      const dir = -this.side; this.mesh.rotation.y = Math.atan2(e.px * dir, e.pz * dir);
    } else {
      const dir = -this.side; this.lat += dir * this.speed * dt; this.walkPhase += dt * 7;
      this.mesh.rotation.y = Math.atan2(e.px * dir, e.pz * dir);
      this.legs.forEach((l, i) => l.rotation.x = Math.sin(this.walkPhase + i * Math.PI) * 0.5);
      this.arms.forEach((a, i) => a.rotation.x = -Math.sin(this.walkPhase + i * Math.PI) * 0.4);
      if (dir * this.lat > this.c.hw + 1.4) { this.state = 'wait'; this.side = (-this.side) as 1 | -1; this.t = 6 + Math.random() * 12; }
    }
    this.place();
  }
}

export interface TrafficCtx {
  signals: Signals; world: World; agents: Agent[]; peds: Pedestrian[]; blocked: Set<string>; night: boolean;
  ringConflict: (node: string, entry: Pt, self: Agent) => boolean; nodeBusy: (node: string, self: Agent) => boolean; crossingBusy: (id: number) => boolean;
}

export class Traffic {
  cars: AICar[] = []; peds: Pedestrian[] = []; signals = new Signals(); blocked = new Set<string>();
  constructor(private world: World) { }
  spawn(count: number, avoid: Pt) {
    const specs = VEHICLES.filter(v => v.kind !== 'moto' && v.kind !== 'moped');
    const weights = ['B1', 'B2', 'B3', 'B1', 'D1', 'D1', 'D2', 'C1', 'D3', 'C', 'A3', 'A2'];
    const edges = Object.values(EDGES).filter(e => e.type !== 'parking');
    let tries = 0;
    while (this.cars.length < count && tries++ < 400) {
      const e = edges[Math.floor(Math.random() * edges.length)]; if (this.blocked.has(e.id)) continue;
      const d: DEdge = { e: e.id, dir: Math.random() < 0.5 ? 1 : -1 }; const frac = 0.1 + Math.random() * 0.8;
      const id = weights[Math.floor(Math.random() * weights.length)];
      const spec = VEHICLES.find(v => v.id === id) ?? specs[0];
      let car: AICar | null = null;
      try {
        car = new AICar(spec, this.world.scene, this.cars.length + 3);
        car.startOn(d, frac, this.blocked);
        const cc = car;
        if (!Number.isFinite(cc.x) || Math.hypot(cc.x - avoid.x, cc.z - avoid.z) < 45 || this.cars.some(c => Math.hypot(c.x - cc.x, c.z - cc.z) < 14)) { this.world.scene.remove(cc.rig.root); continue; }
        cc.rig.root.position.set(cc.x, 0, cc.z); cc.rig.root.rotation.y = cc.heading;
        this.cars.push(cc);
      } catch (err) {
        if (car?.rig) this.world.scene.remove(car.rig.root);
        this.world.reportFailure(`AI vehicle ${spec.id}`, err);
        if (this.world.failures.length > 20) break;
      }
    }
    if (!this.peds.length) this.world.crossings.forEach((c, i) => {
      this.world.safe('Pedestrian', () => this.peds.push(new Pedestrian(c, this.world.scene, i)));
      if (halfWidth(EDGES[c.edge].type) > 8) this.world.safe('Pedestrian', () => this.peds.push(new Pedestrian(c, this.world.scene, i + 7)));
    });
  }
  clear() { for (const c of this.cars) this.world.scene.remove(c.rig.root); this.cars = []; }
  update(dt: number, player: Agent | null, night: boolean) {
    this.signals.update(dt, this.world);
    for (const p of this.peds) p.update(dt);
    const agents: Agent[] = [...this.cars]; if (player) agents.push(player);
    const ctx: TrafficCtx = {
      signals: this.signals, world: this.world, agents, peds: this.peds, blocked: this.blocked, night,
      ringConflict: (nid, entry, self) => {
        const n = NODES[nid]; const aE = Math.atan2(entry.z - n.z, entry.x - n.x);
        return agents.some(a => {
          if (a === self) return false; const d = Math.hypot(a.x - n.x, a.z - n.z); if (d < RB_ISLAND - 1 || d > RB_OUTER + 0.5) return false;
          let da = aE - Math.atan2(a.z - n.z, a.x - n.x); while (da < 0) da += Math.PI * 2; while (da > Math.PI * 2) da -= Math.PI * 2;
          return da < 1.1 && a.speed > 0.5;
        });
      },
      nodeBusy: (nid, self) => { const n = NODES[nid]; return agents.some(a => a !== self && Math.abs(a.x - n.x) < n.hx + 1 && Math.abs(a.z - n.z) < n.hz + 1 && a.speed > 0.3); },
      crossingBusy: (id) => this.peds.some(p => p.c.id === id && p.onRoad),
    };
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      try { c.update(dt, ctx); }
      catch (err) { console.error('[Z-Drive] AI car removed after error', err); this.world.scene.remove(c.rig.root); this.cars.splice(i, 1); }
    }
  }
}
