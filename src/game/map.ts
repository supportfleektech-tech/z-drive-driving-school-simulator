// Z-DRIVE — Model Town Board (MTB) network definition + MTB rule based route planner
export type RoadType = 'major' | 'minor' | 'two' | 'parking';
export type NodeKind = 'junction' | 'round' | 'uturn' | 'side';
export type Control = 'none' | 'signal' | 'stop' | 'giveway';

export interface MapNode { id: string; x: number; z: number; kind: NodeKind; label: string; signal?: boolean; hx: number; hz: number; edges: string[] }
export interface MapEdge {
  id: string; a: string; b: string; type: RoadType; oneway?: boolean; name: string;
  crossing?: number; // zebra crossing position (0..1)
  len: number; dx: number; dz: number; px: number; pz: number; // direction a->b and lateral p (right of a->b)
  ax: number; az: number; bx: number; bz: number; trimA: number; trimB: number; horizontal: boolean;
}

export const ROAD: Record<RoadType, { lanes: number; laneW: number; reserve: number; dual: boolean; limit: number; label: string }> = {
  major: { lanes: 4, laneW: 3, reserve: 3, dual: true, limit: 60, label: 'Major Road · Dual Carriageway (4 lanes)' },
  minor: { lanes: 3, laneW: 3, reserve: 3, dual: true, limit: 50, label: 'Minor Road · Dual Carriageway (3 lanes)' },
  two: { lanes: 1, laneW: 3.5, reserve: 0, dual: false, limit: 50, label: 'Two-Way Traffic Road' },
  parking: { lanes: 1, laneW: 3.5, reserve: 0, dual: false, limit: 10, label: 'Parking Zone' },
};
export const halfWidth = (t: RoadType) => { const r = ROAD[t]; return r.dual ? r.reserve / 2 + r.lanes * r.laneW : r.lanes * r.laneW; };

export const RB_OUTER = 30;
export const RB_ISLAND = 17;
export const RB_LANE = (RB_OUTER - RB_ISLAND) / 4;
export const ROUND_LIMIT = 30;
export const JUNCTION_LIMIT = 40;

const rawNodes: [string, number, number, NodeKind, string, boolean?][] = [
  ['A', -400, -220, 'junction', 'A'], ['B', -200, -220, 'junction', 'B'], ['P1a', -100, -220, 'junction', 'P1 Entry'],
  ['C', 0, -220, 'junction', 'C', true], ['D', 200, -220, 'junction', 'D'], ['E', 400, -220, 'junction', 'E'],
  ['F', -400, 0, 'junction', 'F'], ['U1', -300, 0, 'uturn', 'U-Turn Gap'], ['G', -200, 0, 'junction', 'G', true],
  ['P1b', -100, 0, 'side', 'P1 Exit'], ['R1', 0, 0, 'round', 'Roundabout 1'], ['R2', 200, 0, 'round', 'Roundabout 2'],
  ['P2a', 300, 0, 'side', 'P2 Access'], ['I', 400, 0, 'junction', 'I'],
  ['N', -400, 220, 'junction', 'N'], ['L', -200, 220, 'junction', 'L'], ['M', 0, 220, 'junction', 'M', true],
  ['K', 200, 220, 'junction', 'K'], ['P2b', 300, 220, 'junction', 'P2 Access S'], ['J', 400, 220, 'junction', 'J'],
];

const rawEdges: [string, string, string, RoadType, string, number?, boolean?][] = [
  ['e1', 'A', 'B', 'two', 'Harambee Ave'], ['e2', 'B', 'P1a', 'two', 'Harambee Ave'], ['e3', 'P1a', 'C', 'two', 'Harambee Ave', 0.5],
  ['e4', 'C', 'D', 'two', 'Moi Ave'], ['e5', 'D', 'E', 'two', 'Moi Ave', 0.5],
  ['e6', 'E', 'I', 'two', 'Kimathi St'], ['e7', 'I', 'J', 'two', 'Kimathi St'],
  ['e8', 'J', 'P2b', 'two', 'Tom Mboya St'], ['e9', 'P2b', 'K', 'two', 'Tom Mboya St'], ['e10', 'K', 'M', 'two', 'Tom Mboya St'],
  ['e11', 'M', 'L', 'two', 'Biashara St', 0.5], ['e12', 'L', 'N', 'two', 'Biashara St'],
  ['e13', 'N', 'F', 'two', 'Koinange St'], ['e14', 'F', 'A', 'two', 'Koinange St'],
  ['e15', 'F', 'U1', 'major', 'Uhuru Highway'], ['e16', 'U1', 'G', 'major', 'Uhuru Highway'], ['e17', 'G', 'P1b', 'major', 'Uhuru Highway', 0.5],
  ['e18', 'P1b', 'R1', 'major', 'Uhuru Highway'], ['e19', 'R1', 'R2', 'major', 'Uhuru Highway'], ['e20', 'R2', 'P2a', 'major', 'Uhuru Highway'],
  ['e21', 'P2a', 'I', 'major', 'Uhuru Highway'],
  ['e22', 'C', 'R1', 'major', 'Kenyatta Ave', 0.45], ['e23', 'R1', 'M', 'major', 'Kenyatta Ave'],
  ['e24', 'B', 'G', 'minor', 'Mama Ngina St', 0.5], ['e25', 'G', 'L', 'minor', 'Mama Ngina St'],
  ['e26', 'D', 'R2', 'minor', 'Haile Selassie Ave'], ['e27', 'R2', 'K', 'minor', 'Haile Selassie Ave', 0.55],
  ['p1', 'P1a', 'P1b', 'parking', 'Angle Parking P1 (One-Way)', undefined, true],
  ['p2', 'P2a', 'P2b', 'parking', 'Flush Parking P2'],
];

export const NODES: Record<string, MapNode> = {};
export const EDGES: Record<string, MapEdge> = {};

for (const [id, x, z, kind, label, signal] of rawNodes) NODES[id] = { id, x, z, kind, label, signal, hx: 0, hz: 0, edges: [] };
for (const [id, a, b, type, name, crossing, oneway] of rawEdges) {
  const A = NODES[a], B = NODES[b];
  const dx0 = B.x - A.x, dz0 = B.z - A.z; const len = Math.hypot(dx0, dz0);
  const dx = dx0 / len, dz = dz0 / len;
  EDGES[id] = { id, a, b, type, name, crossing, oneway, len, dx, dz, px: -dz, pz: dx, ax: A.x, az: A.z, bx: B.x, bz: B.z, trimA: 0, trimB: 0, horizontal: Math.abs(dz) < 0.01 };
  A.edges.push(id); B.edges.push(id);
}
// junction half extents
for (const n of Object.values(NODES)) {
  let hx = 0, hz = 0;
  for (const eid of n.edges) { const e = EDGES[eid]; const hw = halfWidth(e.type); if (e.horizontal) hz = Math.max(hz, hw); else hx = Math.max(hx, hw); }
  if (hx === 0) hx = n.kind === 'uturn' ? 9 : 4; if (hz === 0) hz = 4;
  n.hx = hx; n.hz = hz;
}
for (const e of Object.values(EDGES)) {
  const trim = (n: MapNode) => n.kind === 'round' ? RB_OUTER + 2 : (e.horizontal ? n.hx : n.hz);
  e.trimA = trim(NODES[e.a]); e.trimB = trim(NODES[e.b]);
}

// Approach control
export function approachControl(nodeId: string, edgeId: string): Control {
  const n = NODES[nodeId], e = EDGES[edgeId];
  if (n.kind === 'round') return 'giveway';
  if (n.signal) return 'signal';
  if (['B', 'D', 'L', 'K'].includes(nodeId) && e.type === 'minor') return 'stop';
  if (['F', 'I'].includes(nodeId) && e.type === 'major') return 'giveway';
  if (e.type === 'parking' && nodeId !== 'P1a') return 'giveway';
  return 'none';
}

// Directed edge helpers
export interface DEdge { e: string; dir: 1 | -1 }
export const dFrom = (d: DEdge) => d.dir === 1 ? EDGES[d.e].a : EDGES[d.e].b;
export const dTo = (d: DEdge) => d.dir === 1 ? EDGES[d.e].b : EDGES[d.e].a;
export const dVec = (d: DEdge) => ({ x: EDGES[d.e].dx * d.dir, z: EDGES[d.e].dz * d.dir });
export const dKey = (d: DEdge) => `${d.e}:${d.dir}`;

/** positive => left turn, negative => right turn (left-hand traffic, x right, z down on map) */
export const turnSign = (d1: { x: number; z: number }, d2: { x: number; z: number }) => d1.z * d2.x - d1.x * d2.z;

export type TurnKind = 'straight' | 'left' | 'right' | 'uturn';
export interface TurnInfo { kind: TurnKind; exitNo?: number; angle: number; roundCat?: 'left' | 'straight' | 'right' | 'uturn' }

export function angleAt(nodeId: string, d: DEdge, incoming: boolean) {
  const n = NODES[nodeId]; const v = dVec(d);
  // angle (atan2 z,x) of the leg relative to node centre
  const lx = incoming ? -v.x : v.x, lz = incoming ? -v.z : v.z;
  void n; return Math.atan2(lz, lx);
}

export function classifyTurn(inD: DEdge, outD: DEdge): TurnInfo {
  const node = NODES[dTo(inD)];
  const v1 = dVec(inD), v2 = dVec(outD);
  if (node.kind === 'round') {
    const aIn = angleAt(node.id, inD, true); const aOut = angleAt(node.id, outD, false);
    let delta = aOut - aIn; while (delta <= 0.3) delta += Math.PI * 2; // clockwise travel angle
    const cat = delta < Math.PI * 0.75 ? 'left' : delta < Math.PI * 1.25 ? 'straight' : delta < Math.PI * 1.75 ? 'right' : 'uturn';
    // exit number: count legs clockwise from entry
    const legs = node.edges.map(eid => { const e = EDGES[eid]; const o: DEdge = { e: eid, dir: e.a === node.id ? 1 : -1 }; let dd = angleAt(node.id, o, false) - aIn; while (dd <= 0.3) dd += Math.PI * 2; return dd; }).sort((a, b) => a - b);
    const exitNo = legs.findIndex(x => Math.abs(x - delta) < 0.05) + 1;
    const kind: TurnKind = cat === 'left' ? 'left' : cat === 'straight' ? 'straight' : cat === 'right' ? 'right' : 'uturn';
    return { kind, exitNo, angle: delta, roundCat: cat };
  }
  if (inD.e === outD.e) return { kind: 'uturn', angle: Math.PI };
  const s = turnSign(v1, v2); const dot = v1.x * v2.x + v1.z * v2.z;
  if (dot > 0.7) return { kind: 'straight', angle: 0 };
  return { kind: s > 0 ? 'left' : 'right', angle: Math.acos(Math.max(-1, Math.min(1, dot))) };
}

/** Required approach lane (counted from the outermost/left lane = 1) at a roundabout */
export function requiredLane(type: RoadType, cat: string): number[] {
  const lanes = ROAD[type].lanes;
  if (lanes === 4) return cat === 'left' ? [1] : cat === 'straight' ? [2] : cat === 'right' ? [3] : [4];
  if (lanes === 3) return cat === 'left' ? [1] : cat === 'straight' ? [2] : [3];
  return [1];
}

export function transitionAllowed(inD: DEdge, outD: DEdge): boolean {
  const nodeId = dTo(inD); const node = NODES[nodeId];
  const oe = EDGES[outD.e];
  if (dFrom(outD) !== nodeId) return false;
  if (oe.oneway && outD.dir !== 1) return false;
  if (inD.e === outD.e) return node.kind === 'round' || node.kind === 'uturn';
  if (node.kind === 'side') {
    const ie = EDGES[inD.e];
    if (ie.type !== 'parking' && oe.type !== 'parking') return true; // straight along dual
    return turnSign(dVec(inD), dVec(outD)) > 0; // left-in / left-out only
  }
  if (node.kind === 'uturn') return true;
  return true;
}

export interface RouteResult { states: DEdge[]; nodes: string[]; length: number; usesParking: boolean }

export function findRoute(start: DEdge, dest: string, opts: { blocked?: Set<string>; allowParking: boolean }): RouteResult | null {
  const blocked = opts.blocked ?? new Set<string>();
  const dist = new Map<string, number>(); const prev = new Map<string, string>(); const stateOf = new Map<string, DEdge>();
  const sk = dKey(start); dist.set(sk, 0); stateOf.set(sk, start);
  const open: string[] = [sk]; const closed = new Set<string>();
  let goal: string | null = null;
  while (open.length) {
    open.sort((a, b) => dist.get(a)! - dist.get(b)!);
    const k = open.shift()!; if (closed.has(k)) continue; closed.add(k);
    const s = stateOf.get(k)!;
    if (dTo(s) === dest) { goal = k; break; }
    const node = NODES[dTo(s)];
    for (const eid of node.edges) {
      const e = EDGES[eid];
      const nd: DEdge = { e: eid, dir: e.a === node.id ? 1 : -1 };
      if (!transitionAllowed(s, nd)) continue;
      if (blocked.has(eid)) continue;
      if (e.type === 'parking' && !opts.allowParking) continue;
      const nk = dKey(nd);
      const cost = dist.get(k)! + e.len + (nd.e === s.e ? 120 : 0);
      if (!dist.has(nk) || cost < dist.get(nk)!) { dist.set(nk, cost); prev.set(nk, k); stateOf.set(nk, nd); open.push(nk); }
    }
  }
  if (!goal) return null;
  const states: DEdge[] = []; let c: string | undefined = goal;
  while (c) { states.unshift(stateOf.get(c)!); c = prev.get(c); }
  const nodes = [dFrom(states[0]), ...states.map(dTo)];
  return { states, nodes, length: dist.get(goal)!, usesParking: states.some(s => EDGES[s.e].type === 'parking') };
}

export interface PlannedRoute extends RouteResult { rule: 1 | 2 | 3; ruleText: string }

export function planMTB(start: DEdge, dest: string, blocked: Set<string>): PlannedRoute | null {
  const ideal = findRoute(start, dest, { allowParking: false });
  const r1 = findRoute(start, dest, { blocked, allowParking: false });
  if (r1) {
    if (ideal && Math.abs(ideal.length - r1.length) < 1) return { ...r1, rule: 1, ruleText: 'Rule 1 — Shortest & most correct route without passing through a parking zone' };
    return { ...r1, rule: 2, ruleText: 'Rule 2 — Short route blocked: longest & most correct route without a parking zone' };
  }
  const r3 = findRoute(start, dest, { blocked, allowParking: true });
  if (r3) return { ...r3, rule: 3, ruleText: 'Rule 3 — No other route: parking zone used as the LAST option' };
  return null;
}

// ---------- Landmarks (Nairobi CBD & MTB board places) ----------
export interface Landmark { id: string; name: string; node: string; x: number; z: number; w: number; d: number; h: number; color: string; icon: string }
export const LANDMARKS: Landmark[] = [
  { id: 'ntsa', name: 'NTSA HQ & Likoni Test Centre', node: 'B', x: -300, z: -150, w: 50, d: 30, h: 16, color: '#1e3a8a', icon: '🏛️' },
  { id: 'police', name: 'Central Police Station', node: 'G', x: -250, z: -60, w: 36, d: 26, h: 13, color: '#1d4ed8', icon: '🚓' },
  { id: 'hospital', name: 'Kenyatta Referral Hospital', node: 'K', x: 120, z: 150, w: 60, d: 40, h: 28, color: '#e5e7eb', icon: '🏥' },
  { id: 'post', name: 'GPO Posta Kenya (Kenyatta Ave)', node: 'C', x: 60, z: -170, w: 34, d: 24, h: 14, color: '#dc2626', icon: '✉️' },
  { id: 'market', name: 'Nairobi City Market', node: 'L', x: -290, z: 150, w: 60, d: 40, h: 10, color: '#b45309', icon: '🛒' },
  { id: 'school', name: 'Z-Drive Academy (zingri_master)', node: 'D', x: 140, z: -160, w: 40, d: 28, h: 14, color: '#f59e0b', icon: '🚗' },
  { id: 'church', name: 'Holy Family Basilica', node: 'M', x: -60, z: 160, w: 28, d: 40, h: 22, color: '#f5f5f4', icon: '⛪' },
  { id: 'bank', name: 'Times Tower & Central Bank', node: 'R1', x: 60, z: -60, w: 38, d: 30, h: 68, color: '#0f766e', icon: '🏦' },
  { id: 'fuel', name: 'TotalEnergies Koinange', node: 'I', x: 360, z: -50, w: 30, d: 22, h: 6, color: '#16a34a', icon: '⛽' },
  { id: 'stage', name: 'Tom Mboya Matatu Terminus', node: 'J', x: 355, z: 160, w: 50, d: 40, h: 7, color: '#7c3aed', icon: '🚐' },
  { id: 'hotel', name: 'Nairobi Serena Hotel', node: 'E', x: 330, z: -160, w: 40, d: 30, h: 36, color: '#0f766e', icon: '🏨' },
  { id: 'stadium', name: 'Nyayo National Stadium', node: 'N', x: -300, z: 70, w: 70, d: 50, h: 12, color: '#57534e', icon: '🏟️' },
  { id: 'kicc', name: 'KICC (Convention Centre)', node: 'R1', x: -55, z: -65, w: 34, d: 34, h: 62, color: '#b45309', icon: '🗼' },
  { id: 'nation', name: 'Nation Centre (Kimathi St)', node: 'I', x: 345, z: -110, w: 32, d: 24, h: 48, color: '#1e293b', icon: '📰' },
  { id: 'hilton', name: 'Hilton Nairobi Tower', node: 'D', x: 135, z: -65, w: 30, d: 30, h: 46, color: '#a8a29e', icon: '🏢' },
  { id: 'jamia', name: 'Jamia Mosque Nairobi', node: 'G', x: -155, z: -70, w: 34, d: 28, h: 18, color: '#15803d', icon: '🕌' },
  { id: 'parliament', name: 'Parliament & Clock Tower', node: 'A', x: -345, z: -165, w: 44, d: 26, h: 20, color: '#92400e', icon: '🕰️' },
  { id: 'afya', name: 'Afya Centre Tower', node: 'K', x: 245, z: 155, w: 30, d: 26, h: 44, color: '#047857', icon: '🏬' },
];

export type BiomeKind = 'cbd' | 'highway' | 'hills' | 'winding' | 'offroad' | 'desert' | 'snow' | 'mud';
export interface TerrainInfo {
  y: number;
  slopeX: number; // dy/dx
  slopeZ: number; // dy/dz
  biome: BiomeKind;
  biomeLabel: string;
  grip: number; // 1 = dry asphalt, lower = slippery
  drag: number; // 1 = normal rolling resistance, higher = boggy
  limit: number;
}

/**
 * All-in-One Kenya Multi-Biome Ring surrounding Nairobi CBD:
 * - North-West (z < -255, x < 0): Thika Superhighway Express (100 km/h)
 * - North-East (z < -255, x >= 0): Rift Escarpment Hills & Hill-Start Slope (real 3D incline up to +13m!)
 * - East-North (x > 430, z < 20): Aberdare Winding Hairpin Pass
 * - East-South (x > 430, z >= 20): Tsavo Off-Road Gravel Trail
 * - South-East (z > 255, x > 140): Chalbi Desert Sand Dunes
 * - South-Mid  (z > 255, -150 <= x <= 140): Mt. Kenya Alpine Snow & Ice Pass
 * - South-West (z > 255, x < -150): Mau Forest Muddy Bog Track
 */
export function getTerrainInfo(x: number, z: number): TerrainInfo {
  // 1. Rift Escarpment Hill Climb on North-East perimeter (z in -380..-265, x in -20..420)
  // Smooth bell-shaped hill rising from y=0 at x=0 to y=13.5m at x=190 and back to y=0 at x=380
  if (z < -255 && x >= -20 && x <= 420) {
    const inRoadBand = z >= -365 && z <= -285;
    if (inRoadBand && x >= 0 && x <= 380) {
      const u = (x - 0) / 380; // 0..1
      const s = Math.sin(Math.PI * u);
      const y = 13.5 * s * s;
      const dydx = 13.5 * 2 * s * Math.cos(Math.PI * u) * (Math.PI / 380);
      return {
        y,
        slopeX: dydx,
        slopeZ: 0,
        biome: 'hills',
        biomeLabel: '⛰️ Rift Valley Escarpment Hill (11% Grade)',
        grip: 0.96,
        drag: 1.05,
        limit: 60,
      };
    }
    return { y: 0, slopeX: 0, slopeZ: 0, biome: 'hills', biomeLabel: '⛰️ Rift Valley Foothills', grip: 0.9, drag: 1.2, limit: 60 };
  }

  // 2. Thika Superhighway Express on North-West perimeter (z < -255, x < -20)
  if (z < -255 && x < -20) {
    return {
      y: 0, slopeX: 0, slopeZ: 0,
      biome: 'highway',
      biomeLabel: '🛣️ Thika Superhighway Express (100 km/h)',
      grip: 1.0,
      drag: 0.95,
      limit: 100,
    };
  }

  // 3. Aberdare Winding Mountain Pass (East-North: x > 430, z < 20)
  if (x > 430 && z < 20) {
    const wave = Math.sin((z + 280) * 0.035) * 2.2;
    const dz = Math.cos((z + 280) * 0.035) * 2.2 * 0.035;
    const fade = Math.min(1, Math.max(0, (x - 440) / 30));
    return {
      y: Math.max(0, (2.2 + wave) * fade),
      slopeX: 0,
      slopeZ: dz * fade,
      biome: 'winding',
      biomeLabel: '〰️ Aberdare Winding Hairpin Pass',
      grip: 0.92,
      drag: 1.08,
      limit: 50,
    };
  }

  // 4. Tsavo Off-Road Gravel Trail (East-South: x > 430, z >= 20)
  if (x > 430 && z >= 20) {
    const bump = Math.sin(x * 0.35) * Math.cos(z * 0.35) * 0.18;
    return {
      y: Math.max(0, bump),
      slopeX: 0,
      slopeZ: 0,
      biome: 'offroad',
      biomeLabel: '🪨 Tsavo Off-Road Gravel Track',
      grip: 0.76,
      drag: 1.38,
      limit: 50,
    };
  }

  // 5. South Perimeter Biomes (z > 255)
  if (z > 255) {
    if (x > 140) {
      // Chalbi Desert Sand Dunes
      const dune = Math.sin((x - 140) * 0.03) * Math.sin((z - 255) * 0.04) * 1.8;
      return {
        y: Math.max(0, dune),
        slopeX: Math.cos((x - 140) * 0.03) * 0.03 * 1.8,
        slopeZ: 0,
        biome: 'desert',
        biomeLabel: '🏜️ Chalbi Desert Sand Dunes',
        grip: 0.62,
        drag: 1.65,
        limit: 60,
      };
    }
    if (x >= -150) {
      // Mt. Kenya Snow & Ice Pass
      return {
        y: 0,
        slopeX: 0,
        slopeZ: 0,
        biome: 'snow',
        biomeLabel: '❄️ Mt. Kenya Alpine Snow & Ice Zone (Low Grip!)',
        grip: 0.42,
        drag: 1.18,
        limit: 40,
      };
    }
    // Mau Forest Muddy Bog Track (x < -150)
    const rut = Math.sin(x * 0.25) * 0.12;
    return {
      y: Math.max(0, rut),
      slopeX: 0,
      slopeZ: 0,
      biome: 'mud',
      biomeLabel: '🌧️ Mau Forest Deep Muddy Track (High Drag!)',
      grip: 0.52,
      drag: 2.15,
      limit: 40,
    };
  }

  return {
    y: 0,
    slopeX: 0,
    slopeZ: 0,
    biome: 'cbd',
    biomeLabel: '🏙️ Nairobi CBD · Model Town Network',
    grip: 1.0,
    drag: 1.0,
    limit: 50,
  };
}

export interface ExpeditionCheckpoint {
  id: string;
  name: string;
  biome: BiomeKind;
  x: number;
  z: number;
  hint: string;
}

export const EXPEDITION_CHECKPOINTS: ExpeditionCheckpoint[] = [
  { id: 'hw1', name: '1. Thika Superhighway Express', biome: 'highway', x: -210, z: -325, hint: 'Accelerate along the 100 km/h express highway corridor.' },
  { id: 'hl1', name: '2. Rift Escarpment Hill Crest', biome: 'hills', x: 190, z: -325, hint: 'Climb the 11% Rift Escarpment grade to the summit crest (+13.5m)!' },
  { id: 'hl2', name: '3. Escarpment East Descent', biome: 'hills', x: 395, z: -315, hint: 'Control your speed down the eastern escarpment ramp.' },
  { id: 'wd1', name: '4. Aberdare Winding Hairpins', biome: 'winding', x: 495, z: -120, hint: 'Navigate the winding S-curves on the eastern mountain pass.' },
  { id: 'of1', name: '5. Tsavo Off-Road Gravel Trail', biome: 'offroad', x: 495, z: 150, hint: 'Hold the wheel steady over the corrugated gravel savannah.' },
  { id: 'ds1', name: '6. Chalbi Desert Sand Dunes', biome: 'desert', x: 290, z: 325, hint: 'Keep momentum across the soft desert sand dunes!' },
  { id: 'sn1', name: '7. Mt. Kenya Snow & Ice Pass', biome: 'snow', x: 0, z: 325, hint: 'Caution: icy surface (42% grip)! Steer and brake gently.' },
  { id: 'md1', name: '8. Mau Forest Muddy Track', biome: 'mud', x: -300, z: 325, hint: 'Power through the deep mud bog in a low gear to the finish!' },
  { id: 'fin', name: '9. Return to Nairobi CBD Gate (N)', biome: 'cbd', x: -400, z: 220, hint: 'Re-enter Nairobi CBD at Junction N to complete the Expedition!' },
];

export const MAP_BOUNDS = { minX: -440, maxX: 440, minZ: -260, maxZ: 260 };

export const PARKING = {
  p1: { x0: -115, x1: -85, z0: -216.5, z1: -13.5, kind: 'angle' as const },
  p2: { x0: 291, x1: 309, z0: 13.5, z1: 216.5, kind: 'flush' as const },
};

export function edgePoint(e: MapEdge, along: number, lat: number) {
  return { x: e.ax + e.dx * along + e.px * lat, z: e.az + e.dz * along + e.pz * lat };
}

/** lateral offset (from centre, positive = left/correct side) for lane L (1 = outermost) */
export function laneOffset(type: RoadType, lane: number) {
  const r = ROAD[type];
  if (type === 'parking') return 1.75;
  if (!r.dual) return r.laneW / 2;
  return r.reserve / 2 + (r.lanes - lane + 0.5) * r.laneW;
}

export interface Locate { kind: 'edge' | 'node' | 'lot' | 'off'; edge?: MapEdge; node?: MapNode; along?: number; lat?: number; lot?: 'p1' | 'p2' }

export function locate(x: number, z: number): Locate {
  for (const n of Object.values(NODES)) {
    if (n.kind === 'round') { if (Math.hypot(x - n.x, z - n.z) < RB_OUTER + 1) return { kind: 'node', node: n }; }
    else if (Math.abs(x - n.x) < n.hx + 0.3 && Math.abs(z - n.z) < n.hz + 0.3) return { kind: 'node', node: n };
  }
  let best: Locate = { kind: 'off' }; let bd = 1e9;
  for (const e of Object.values(EDGES)) {
    const rx = x - e.ax, rz = z - e.az;
    const along = rx * e.dx + rz * e.dz; const lat = rx * e.px + rz * e.pz;
    if (along < e.trimA - 1 || along > e.len - e.trimB + 1) continue;
    const hw = halfWidth(e.type);
    if (Math.abs(lat) < hw + 0.4 && Math.abs(lat) < bd) { bd = Math.abs(lat); best = { kind: 'edge', edge: e, along, lat }; }
  }
  if (best.kind === 'off') {
    for (const [k, p] of Object.entries(PARKING)) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return { kind: 'lot', lot: k as 'p1' | 'p2', edge: EDGES[k] };
  }
  return best;
}

export function describeTurn(inD: DEdge, outD: DEdge): string {
  const t = classifyTurn(inD, outD); const node = NODES[dTo(inD)]; const ie = EDGES[inD.e];
  if (node.kind === 'round') {
    const lane = requiredLane(ie.type, t.roundCat!)[0];
    const ord = ['1st', '2nd', '3rd', '4th', '5th'][Math.max(0, (t.exitNo ?? 1) - 1)];
    const what = t.roundCat === 'uturn' ? 'go full circle (360° U-turn)' : `take the ${ord} exit (${t.roundCat === 'left' ? 'left 90°' : t.roundCat === 'straight' ? 'straight 180°' : 'right 270°'})`;
    return `At ${node.label}, ${what} — approach in Lane ${lane}`;
  }
  if (t.kind === 'uturn') return `Make a U-turn at the ${node.label}`;
  if (t.kind === 'straight') return `Continue straight through junction ${node.label}`;
  return `Turn ${t.kind.toUpperCase()} at junction ${node.label} onto ${EDGES[outD.e].name}`;
}
