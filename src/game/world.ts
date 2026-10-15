import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  NODES, EDGES, ROAD, halfWidth, RB_OUTER, RB_ISLAND, RB_LANE, approachControl, LANDMARKS, PARKING,
  type DEdge, type MapEdge, dTo, dVec, edgePoint,
} from './map';
import * as TX from './textures';
import { buildVehicleMesh, VEHICLES } from './vehicles';

export interface Obstacle { shape: 'circle' | 'box'; x: number; z: number; r?: number; hw?: number; hd?: number; kind: 'solid' | 'kerb'; enabled?: boolean; tag?: string }
export interface Crossing { id: number; edge: string; along: number; x: number; z: number; dx: number; dz: number; hw: number }
export interface Bay { id: string; lot: 'p1' | 'p2'; x: number; z: number; heading: number; side: 'left' | 'right'; occupied: boolean; mesh?: THREE.Object3D; obs: Obstacle[] }
export type TimeOfDay = 'day' | 'dusk' | 'night' | 'cycle';
export type WeatherKind = 'clear' | 'rain' | 'storm' | 'fog' | 'snow';
export interface LightSet { red: THREE.MeshStandardMaterial; yellow: THREE.MeshStandardMaterial; green: THREE.MeshStandardMaterial }

class Batch {
  pos: number[] = []; uv: number[] = []; idx: number[] = [];
  constructor(public y: number, public uvScale = 4) { }
  quad(p: [number, number][], y = this.y) {
    const b = this.pos.length / 3;
    for (const [x, z] of p) { this.pos.push(x, y, z); this.uv.push(x / this.uvScale, z / this.uvScale); }
    const ny = (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]);
    if (ny > 0) this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3); else this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  seg(x1: number, z1: number, x2: number, z2: number, w: number) {
    const dx = x2 - x1, dz = z2 - z1; const l = Math.hypot(dx, dz) || 1; const nx = -dz / l * w / 2, nz = dx / l * w / 2;
    this.quad([[x1 + nx, z1 + nz], [x2 + nx, z2 + nz], [x2 - nx, z2 - nz], [x1 - nx, z1 - nz]]);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const n = new Float32Array(this.pos.length); for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); g.setIndex(this.idx); return g;
  }
}

const rand = (() => { let s = 12345; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();

export class World {
  scene = new THREE.Scene();
  solids: Obstacle[] = [];
  kerbs: Obstacle[] = [];
  dynSolids: Obstacle[] = [];
  blockRects: { x0: number; x1: number; z0: number; z1: number }[] = [];
  crossings: Crossing[] = [];
  bays: Bay[] = [];
  lights: Record<string, Record<'h' | 'v', LightSet>> = {};
  sun!: THREE.DirectionalLight; hemi!: THREE.HemisphereLight; sky!: Sky;
  boardLabels = new THREE.Group();
  nightObjects: THREE.Object3D[] = [];
  windowMats: THREE.MeshStandardMaterial[] = [];
  lampMat!: THREE.MeshStandardMaterial;
  blockGroup = new THREE.Group();
  stars!: THREE.Points;
  precip!: THREE.Points;
  precipGeo!: THREE.BufferGeometry;
  time: TimeOfDay = 'day';
  weather: WeatherKind = 'clear';
  cycleHour = 10.5; // 0..24 solar clock when time === 'cycle'

  constructor(private renderer: THREE.WebGLRenderer, private shadows: boolean) { }

  async build(progress: (p: number, label: string) => void) {
    const steps: [string, () => void][] = [
      ['Lighting & sky', () => {
        try { const pm = new THREE.PMREMGenerator(this.renderer); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); } catch (e) { console.warn('env map failed', e); }
        this.scene.environmentIntensity = 0.45; this.buildLighting(); this.buildGround();
      }],
      ['Road network & markings', () => this.buildRoads()],
      ['Roundabouts & traffic islands', () => this.buildRoundabouts()],
      ['Central reserves', () => this.buildReserves()],
      ['City blocks & pavements', () => this.buildBlocks()],
      ['Parking zones', () => this.buildParking()],
      ['Traffic signals & signs', () => this.buildSignalsAndSigns()],
      ['Street lighting', () => this.buildLamps()],
      ['Buildings & landmarks', () => this.buildLandmarksAndBuildings()],
      ['Scenery', () => { this.buildScenery(); this.buildBoardLabels(); this.scene.add(this.blockGroup); }],
    ];
    for (let i = 0; i < steps.length; i++) {
      progress(i / steps.length, steps[i][0]);
      await new Promise(r => setTimeout(r, 20));
      try { steps[i][1](); }
      catch (e) { this.reportFailure(steps[i][0], e); }
    }
    // guarantee the essentials exist even if a step failed
    if (!this.sun) { this.sun = new THREE.DirectionalLight(0xffffff, 2.5); this.scene.add(this.sun, this.sun.target); }
    if (!this.hemi) { this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a6b3a, 0.9); this.scene.add(this.hemi); }
    if (!this.lampMat) this.lampMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffd9a0, emissiveIntensity: 0 });
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(0xcfdde8, 250, 1500);
    progress(1, 'Ready');
  }

  failures: string[] = [] ;
  reportFailure(where: string, e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const frame = e instanceof Error && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : '';
    console.error(`[Z-Drive] ${where} failed:`, e);
    this.failures.push(`${where}: ${msg}${frame ? ' — ' + frame.slice(0, 220) : ''}`);
  }
  /** Run a sub-task; on error, record it and continue. */
  safe<T>(where: string, fn: () => T): T | undefined {
    try { return fn(); } catch (e) { this.reportFailure(where, e); return undefined; }
  }

  // ---------------------------------------------------------------- lighting & sky
  buildLighting() {
    this.safe('Sky', () => { const sky = new Sky(); sky.scale.setScalar(4500); this.scene.add(sky); this.sky = sky; });
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a6b3a, 0.9); this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.castShadow = this.shadows;
    sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 500;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    this.scene.add(sun); this.scene.add(sun.target); this.sun = sun;
    this.scene.fog = new THREE.Fog(0xcfdde8, 250, 1500);
    const sg = new THREE.BufferGeometry(); const sp: number[] = [];
    for (let i = 0; i < 1500; i++) { const t = rand() * Math.PI * 2, p = Math.acos(rand() * 0.9); sp.push(Math.sin(p) * Math.cos(t) * 3000, Math.cos(p) * 3000, Math.sin(p) * Math.sin(t) * 3000); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 4, sizeAttenuation: false, fog: false }));
    this.stars.visible = false; this.scene.add(this.stars);

    // 3D Precipitation (Rain / Snow) particle field following the camera
    const pCount = 1400;
    const pp = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pp[i * 3] = (rand() - 0.5) * 90;
      pp[i * 3 + 1] = rand() * 40;
      pp[i * 3 + 2] = (rand() - 0.5) * 90;
    }
    this.precipGeo = new THREE.BufferGeometry();
    this.precipGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.precip = new THREE.Points(
      this.precipGeo,
      new THREE.PointsMaterial({ color: 0xcbe7ff, size: 0.28, transparent: true, opacity: 0.75 }),
    );
    this.precip.visible = false;
    this.scene.add(this.precip);
  }

  setWeather(w: WeatherKind) {
    this.weather = w;
    if (this.precip) {
      this.precip.visible = w === 'rain' || w === 'storm' || w === 'snow';
      const pm = this.precip.material as THREE.PointsMaterial;
      pm.color.set(w === 'snow' ? 0xffffff : 0xbbe0ff);
      pm.size = w === 'snow' ? 0.45 : w === 'storm' ? 0.34 : 0.24;
      pm.opacity = w === 'storm' ? 0.88 : 0.72;
    }
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = w === 'fog' ? 40 : w === 'storm' ? 95 : w === 'rain' ? 150 : 250;
      fog.far = w === 'fog' ? 280 : w === 'storm' ? 520 : w === 'rain' ? 850 : 1500;
    }
  }

  setTimeOfDay(t: TimeOfDay) {
    this.time = t;
    const eff: 'day' | 'dusk' | 'night' =
      t !== 'cycle' ? t : (this.cycleHour >= 7 && this.cycleHour < 17.5) ? 'day' : (this.cycleHour >= 17.5 && this.cycleHour < 19.5) || (this.cycleHour >= 5.5 && this.cycleHour < 7) ? 'dusk' : 'night';
    const elevFromCycle = Math.sin(((this.cycleHour - 6) / 12) * Math.PI) * 58;
    const cfg = {
      day: { elev: t === 'cycle' ? elevFromCycle : 52, az: 140, sun: 2.8, hemi: 0.95, fog: 0xcfdde8, turb: 4, ray: 1.2, exp: 0.55, win: 0.0, lamp: 0.0, sc: 0xfff1dc },
      dusk: { elev: t === 'cycle' ? elevFromCycle : 4, az: 250, sun: 1.5, hemi: 0.45, fog: 0xd8a47a, turb: 8, ray: 2.5, exp: 0.5, win: 0.8, lamp: 1.5, sc: 0xffa860 },
      night: { elev: -8, az: 250, sun: 0.18, hemi: 0.14, fog: 0x0b1020, turb: 1, ray: 0.2, exp: 0.6, win: 1.4, lamp: 3.0, sc: 0x9fb4ff },
    }[eff];
    const phi = THREE.MathUtils.degToRad(90 - cfg.elev), theta = THREE.MathUtils.degToRad(cfg.az);
    const sunPos = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    const u = this.sky ? (this.sky.material as THREE.ShaderMaterial).uniforms : null;
    if (u) {
      if (u.turbidity) u.turbidity.value = cfg.turb; if (u.rayleigh) u.rayleigh.value = cfg.ray;
      if (u.mieCoefficient) u.mieCoefficient.value = 0.005; if (u.mieDirectionalG) u.mieDirectionalG.value = 0.8;
      if (u.sunPosition) u.sunPosition.value.copy(sunPos);
    }
    this.sunDir.copy(eff === 'night' ? new THREE.Vector3(0.3, 0.8, 0.4).normalize() : sunPos.clone().setY(Math.max(0.25, sunPos.y)).normalize());
    this.sun.intensity = cfg.sun; this.sun.color.set(cfg.sc); this.hemi.intensity = cfg.hemi;
    (this.scene.fog as THREE.Fog).color.set(cfg.fog);
    this.renderer.toneMappingExposure = cfg.exp;
    this.windowMats.forEach(m => m.emissiveIntensity = cfg.win);
    if (this.lampMat) this.lampMat.emissiveIntensity = cfg.lamp;
    this.nightObjects.forEach(o => o.visible = eff !== 'day');
    if (this.stars) this.stars.visible = eff === 'night';
    if (this.sky) this.sky.visible = eff !== 'night';
    this.scene.background = eff === 'night' ? new THREE.Color(0x050814) : this.sky ? null : new THREE.Color(cfg.fog);
    this.scene.environmentIntensity = eff === 'night' ? 0.12 : 0.45;
  }
  sunDir = new THREE.Vector3(0.5, 0.8, 0.3);

  get isNightOrDusk(): boolean {
    if (this.time === 'cycle') return this.cycleHour < 6.8 || this.cycleHour >= 18.0;
    return this.time !== 'day';
  }

  update(focus: THREE.Vector3, dt = 0.016) {
    if (this.time === 'cycle') {
      // 1 full 24h solar cycle every 6 minutes of real time
      this.cycleHour = (this.cycleHour + dt * (24 / 360)) % 24;
      this.setTimeOfDay('cycle');
    }
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 200);
    this.sun.target.position.copy(focus);

    if (this.precip && this.precip.visible && this.precipGeo) {
      this.precip.position.set(focus.x, 0, focus.z);
      const pos = this.precipGeo.attributes.position as THREE.BufferAttribute;
      const fallSpeed = this.weather === 'snow' ? 5.5 : this.weather === 'storm' ? 32 : 22;
      const windX = this.weather === 'storm' ? 6.0 : 1.2;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - fallSpeed * dt;
        let x = pos.getX(i) + windX * dt;
        if (y < 0) { y = 38; x = (Math.random() - 0.5) * 90; }
        if (x > 45) x -= 90;
        pos.setXY(i, x, y);
      }
      pos.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- ground
  buildGround() {
    const gt = TX.grassTexture(); gt.repeat.set(400, 400);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ map: gt, roughness: 1, color: 0x9bb07a }));
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true; this.scene.add(g);
  }

  asphaltMat() {
    const m = TX.asphaltTexture(); m.repeat.set(1, 1);
    return new THREE.MeshStandardMaterial({ map: m, roughnessMap: TX.asphaltRoughness(), roughness: 0.92, metalness: 0.0, color: 0xb8b8b8 });
  }

  // ---------------------------------------------------------------- roads & markings
  buildRoads() {
    const asphalt = new Batch(0.03, 10);
    const white = new Batch(0.06, 1); const yellow = new Batch(0.06, 1);
    const arrows: Record<string, THREE.Matrix4[]> = { left: [], straight: [], right: [], uturn: [], leftstraight: [] };
    const zebra = new Batch(0.062, 1);

    for (const n of Object.values(NODES)) {
      if (n.kind === 'round') continue;
      asphalt.quad([[n.x - n.hx, n.z - n.hz], [n.x + n.hx, n.z - n.hz], [n.x + n.hx, n.z + n.hz], [n.x - n.hx, n.z + n.hz]]);
    }

    const segE = (b: Batch, e: MapEdge, s0: number, s1: number, lat: number, w: number) => {
      if (s1 - s0 < 0.05) return; const p = edgePoint(e, s0, lat), q = edgePoint(e, s1, lat); b.seg(p.x, p.z, q.x, q.z, w);
    };
    const dashed = (b: Batch, e: MapEdge, s0: number, s1: number, lat: number, w: number, dash: number, gap: number) => {
      for (let s = s0; s < s1; s += dash + gap) segE(b, e, s, Math.min(s + dash, s1), lat, w);
    };

    for (const e of Object.values(EDGES)) {
      const hw = halfWidth(e.type); const r = ROAD[e.type];
      const s0 = e.trimA, s1 = e.len - e.trimB;
      const p1 = edgePoint(e, s0, -hw), p2 = edgePoint(e, s1, -hw), p3 = edgePoint(e, s1, hw), p4 = edgePoint(e, s0, hw);
      asphalt.quad([[p1.x, p1.z], [p2.x, p2.z], [p3.x, p3.z], [p4.x, p4.z]]);
      const cross = e.crossing !== undefined ? e.crossing * e.len : -999;
      const cz = 30;

      if (r.dual) {
        for (const sgn of [-1, 1]) {
          // sgn -1: a->b carriageway (approaching b), sgn 1: b->a (approaching a)
          segE(yellow, e, s0, s1, sgn * (hw - 0.35), 0.15);
          segE(white, e, s0, s1, sgn * (r.reserve / 2 + 0.3), 0.12);
          for (let k = 1; k < r.lanes; k++) {
            const lat = sgn * (r.reserve / 2 + k * r.laneW);
            if (sgn === -1) { dashed(white, e, s0, s1 - cz, lat, 0.12, 3, 6); segE(white, e, s1 - cz, s1, lat, 0.14); }
            else { segE(white, e, s0, s0 + cz, lat, 0.14); dashed(white, e, s0 + cz, s1, lat, 0.12, 3, 6); }
          }
          // stop / give-way lines
          const nodeId = sgn === -1 ? e.b : e.a; const ctl = approachControl(nodeId, e.id);
          const sLine = sgn === -1 ? s1 - 0.4 : s0 + 0.4;
          const la = sgn * (r.reserve / 2 + 0.2), lb = sgn * (hw - 0.2);
          const pa = edgePoint(e, sLine, la), pb = edgePoint(e, sLine, lb);
          if (ctl === 'stop' || ctl === 'signal') white.seg(pa.x, pa.z, pb.x, pb.z, 0.5);
          else if (ctl === 'giveway') { const L = Math.abs(lb - la); for (let t = 0; t < L; t += 1.2) { const qa = edgePoint(e, sLine, la + sgn * t), qb = edgePoint(e, sLine, la + sgn * Math.min(t + 0.6, L)); white.seg(qa.x, qa.z, qb.x, qb.z, 0.35); } }
          // lane arrows
          const node = NODES[nodeId]; const d: DEdge = { e: e.id, dir: sgn === -1 ? 1 : -1 };
          const tv = dVec(d);
          for (const back of [10, 34]) {
            for (let lane = 1; lane <= r.lanes; lane++) {
              let kind: string;
              if (node.kind === 'round') kind = r.lanes === 4 ? ['left', 'straight', 'right', 'uturn'][lane - 1] : ['left', 'straight', 'right'][lane - 1];
              else if (node.kind === 'side' || node.kind === 'uturn') kind = node.kind === 'uturn' && lane === r.lanes ? 'uturn' : 'straight';
              else kind = lane === 1 ? 'leftstraight' : lane === r.lanes ? (node.edges.length >= 3 ? 'right' : 'straight') : 'straight';
              const along = sgn === -1 ? s1 - back : s0 + back;
              const off = r.reserve / 2 + (r.lanes - lane + 0.5) * r.laneW;
              const pp = edgePoint(e, along, sgn * off);
              const m = new THREE.Matrix4().compose(new THREE.Vector3(pp.x, 0.065, pp.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-tv.x, -tv.z), 0)), new THREE.Vector3(1, 1, 1));
              arrows[kind].push(m);
            }
          }
        }
      } else {
        const ew = e.type === 'parking' ? white : yellow;
        segE(ew, e, s0, s1, -(hw - 0.25), 0.12); segE(ew, e, s0, s1, hw - 0.25, 0.12);
        if (e.type === 'two') {
          const L = s1 - s0;
          if (L > 2 * cz + 10) { segE(yellow, e, s0, s0 + cz, 0, 0.15); dashed(yellow, e, s0 + cz, s1 - cz, 0, 0.15, 4, 5); segE(yellow, e, s1 - cz, s1, 0, 0.15); }
          else segE(yellow, e, s0, s1, 0, 0.15);
        } else if (!e.oneway) dashed(white, e, s0, s1, 0, 0.12, 2, 3);
        for (const sgn of [-1, 1]) {
          const nodeId = sgn === -1 ? e.b : e.a; const ctl = approachControl(nodeId, e.id);
          const sLine = sgn === -1 ? s1 - 0.4 : s0 + 0.4; const pa = edgePoint(e, sLine, 0), pb = edgePoint(e, sLine, sgn * (hw - 0.2));
          if (ctl === 'stop' || ctl === 'signal') white.seg(pa.x, pa.z, pb.x, pb.z, 0.5);
          else if (ctl === 'giveway') { for (let t = 0; t < hw - 0.2; t += 1.2) { const qa = edgePoint(e, sLine, sgn * t), qb = edgePoint(e, sLine, sgn * Math.min(t + 0.6, hw - 0.2)); white.seg(qa.x, qa.z, qb.x, qb.z, 0.35); } }
        }
        if (e.oneway) {
          for (let s = s0 + 15; s < s1 - 10; s += 40) { const pp = edgePoint(e, s, 0); arrows.straight.push(new THREE.Matrix4().compose(new THREE.Vector3(pp.x, 0.065, pp.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-e.dx, -e.dz), 0)), new THREE.Vector3(1, 1, 1))); }
        }
      }
      // zebra crossing
      if (cross > 0) {
        const c: Crossing = { id: this.crossings.length, edge: e.id, along: cross, ...edgePoint(e, cross, 0), dx: e.dx, dz: e.dz, hw };
        this.crossings.push(c);
        for (let l = -hw + 0.5; l < hw - 0.5; l += 1.1) {
          if (r.dual && Math.abs(l + 0.25) < r.reserve / 2) continue;
          const a1 = edgePoint(e, cross - 2, l), a2 = edgePoint(e, cross + 2, l), a3 = edgePoint(e, cross + 2, l + 0.55), a4 = edgePoint(e, cross - 2, l + 0.55);
          zebra.quad([[a1.x, a1.z], [a2.x, a2.z], [a3.x, a3.z], [a4.x, a4.z]]);
        }
        // stop lines before crossing
        for (const sgn of [-1, 1]) { const s = cross + sgn * 3.2; const aa = edgePoint(e, s, sgn * (r.dual ? r.reserve / 2 : 0)), bb = edgePoint(e, s, sgn * (hw - 0.2)); for (let t = 0; t < 1; t += 0.14) { const q1 = { x: aa.x + (bb.x - aa.x) * t, z: aa.z + (bb.z - aa.z) * t }, q2 = { x: aa.x + (bb.x - aa.x) * (t + 0.07), z: aa.z + (bb.z - aa.z) * (t + 0.07) }; white.seg(q1.x, q1.z, q2.x, q2.z, 0.25); } }
        // Belisha beacons
        for (const s of [-1, 1]) {
          const bp = edgePoint(e, cross, s * (hw + 1.2));
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3), new THREE.MeshStandardMaterial({ color: 0x111111 }));
          pole.position.set(bp.x, 1.5, bp.z); this.scene.add(pole);
          const globe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xff8800, emissiveIntensity: 1.2 }));
          globe.position.set(bp.x, 3.1, bp.z); this.scene.add(globe);
        }
      }
    }

    const am = this.asphaltMat();
    const road = new THREE.Mesh(asphalt.build(), am); road.receiveShadow = true; this.scene.add(road);
    const wm = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const ym = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const wmesh = new THREE.Mesh(white.build(), wm); wmesh.receiveShadow = true; this.scene.add(wmesh);
    const ymesh = new THREE.Mesh(yellow.build(), ym); ymesh.receiveShadow = true; this.scene.add(ymesh);
    const zm = new THREE.Mesh(zebra.build(), wm); zm.receiveShadow = true; this.scene.add(zm);
    const ag = new THREE.PlaneGeometry(1.5, 4.2); ag.rotateX(-Math.PI / 2);
    for (const [k, list] of Object.entries(arrows)) {
      if (!list.length) continue;
      const mat = new THREE.MeshStandardMaterial({ map: TX.arrowTexture(k as 'left'), transparent: true, alphaTest: 0.3, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, roughness: 0.6 });
      const im = new THREE.InstancedMesh(ag, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.receiveShadow = true; this.scene.add(im);
    }
  }

  buildRoundabouts() {
    const am = this.asphaltMat(); am.polygonOffset = true; am.polygonOffsetFactor = 1; am.polygonOffsetUnits = 1;
    const kerbT = TX.kerbTexture(); kerbT.repeat.set(24, 1);
    const grass = TX.grassTexture(); grass.repeat.set(4, 4);
    for (const n of Object.values(NODES)) {
      if (n.kind !== 'round') continue;
      const disc = new THREE.CircleGeometry(RB_OUTER + 4.7, 64); disc.rotateX(-Math.PI / 2);
      const uv = disc.attributes.uv as THREE.BufferAttribute; const pos = disc.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + n.x) / 10, (pos.getZ(i) + n.z) / 10);
      const dm = new THREE.Mesh(disc, am); dm.position.set(n.x, 0.028, n.z); dm.receiveShadow = true; this.scene.add(dm);
      // ring markings
      const w = new Batch(0.07, 1); const y = new Batch(0.07, 1);
      const mouths = n.edges.map(eid => { const e = EDGES[eid]; const out = e.a === n.id ? { x: e.dx, z: e.dz } : { x: -e.dx, z: -e.dz }; return { a: Math.atan2(out.z, out.x), half: Math.asin(halfWidth(e.type) / RB_OUTER) + 0.04 }; });
      const inMouth = (a: number) => mouths.some(m => { let d = Math.abs(a - m.a) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d; return d < m.half; });
      const N = 120;
      for (let i = 0; i < N; i++) {
        const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
        for (let k = 1; k < 4; k++) { if (i % 2) continue; const rr = RB_ISLAND + k * RB_LANE; w.seg(n.x + Math.cos(a0) * rr, n.z + Math.sin(a0) * rr, n.x + Math.cos(a1) * rr, n.z + Math.sin(a1) * rr, 0.12); }
        const ri = RB_ISLAND + 0.35; y.seg(n.x + Math.cos(a0) * ri, n.z + Math.sin(a0) * ri, n.x + Math.cos(a1) * ri, n.z + Math.sin(a1) * ri, 0.15);
        if (!inMouth((a0 + a1) / 2)) { const ro = RB_OUTER - 0.3; y.seg(n.x + Math.cos(a0) * ro, n.z + Math.sin(a0) * ro, n.x + Math.cos(a1) * ro, n.z + Math.sin(a1) * ro, 0.15); }
      }
      const wm = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const ym = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      this.scene.add(new THREE.Mesh(w.build(), wm), new THREE.Mesh(y.build(), ym));
      // island
      const kerb = new THREE.Mesh(new THREE.CylinderGeometry(RB_ISLAND, RB_ISLAND, 0.35, 64, 1, true), new THREE.MeshStandardMaterial({ map: kerbT, roughness: 0.7 }));
      kerb.position.set(n.x, 0.175, n.z); this.scene.add(kerb);
      const top = new THREE.Mesh(new THREE.CircleGeometry(RB_ISLAND, 64), new THREE.MeshStandardMaterial({ map: grass, roughness: 1, color: 0xa8c888 }));
      top.rotation.x = -Math.PI / 2; top.position.set(n.x, 0.35, n.z); top.receiveShadow = true; this.scene.add(top);
      // flower ring
      const fl = new THREE.Mesh(new THREE.RingGeometry(RB_ISLAND - 3, RB_ISLAND - 1.2, 64), new THREE.MeshStandardMaterial({ color: n.id === 'R1' ? 0xd9468f : 0xf59e0b, roughness: 1 }));
      fl.rotation.x = -Math.PI / 2; fl.position.set(n.x, 0.37, n.z); this.scene.add(fl);
      this.kerbs.push({ shape: 'circle', x: n.x, z: n.z, r: RB_ISLAND, kind: 'kerb' });
      // monument
      if (n.id === 'R1') {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.6 }));
        base.position.set(n.x, 1.1, n.z); base.castShadow = true; this.scene.add(base);
        const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.8, 16, 4), new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.4, metalness: 0.1 }));
        ob.position.set(n.x, 9.8, n.z); ob.castShadow = true; this.scene.add(ob);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2, 4), new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.9, roughness: 0.25 }));
        tip.position.set(n.x, 18.8, n.z); this.scene.add(tip);
        const flagT = TX.kenyaFlag();
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; const fx = n.x + Math.cos(a) * 9, fz = n.z + Math.sin(a) * 9; this.flagPole(fx, fz, flagT, 9); }
        this.solids.push({ shape: 'circle', x: n.x, z: n.z, r: 5.5, kind: 'solid' });
      } else {
        const ft = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.5, 1, 32), new THREE.MeshStandardMaterial({ color: 0xcfcac2, roughness: 0.5 }));
        ft.position.set(n.x, 0.8, n.z); ft.castShadow = true; this.scene.add(ft);
        const water = new THREE.Mesh(new THREE.CircleGeometry(5.6, 32), new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.4, roughness: 0.05 }));
        water.rotation.x = -Math.PI / 2; water.position.set(n.x, 1.32, n.z); this.scene.add(water);
        const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.8, 5, 12), new THREE.MeshStandardMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.6, emissive: 0x93c5fd, emissiveIntensity: 0.3 }));
        jet.position.set(n.x, 3.8, n.z); this.scene.add(jet);
        this.solids.push({ shape: 'circle', x: n.x, z: n.z, r: 6.8, kind: 'solid' });
      }
    }
  }

  flagPole(x: number, z: number, t: THREE.Texture, h: number) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, h), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.3 }));
    pole.position.set(x, h / 2 + 0.3, z); pole.castShadow = true; this.scene.add(pole);
    const fg = new THREE.PlaneGeometry(3, 2, 10, 1); const p = fg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 2) * 0.15 * (p.getX(i) + 1.5) / 3);
    const f = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 }));
    f.position.set(x + 1.5, h - 0.8, z); this.scene.add(f);
  }

  buildReserves() {
    const grass = TX.grassTexture(); grass.repeat.set(1, 10);
    const top = new THREE.MeshStandardMaterial({ map: grass, color: 0xa8c888, roughness: 1 });
    const bushes: THREE.Matrix4[] = [];
    const addBox = (x0: number, x1: number, z0: number, z1: number) => {
      const w = x1 - x0, d = z1 - z0; if (w < 0.5 || d < 0.5) return;
      const kt = TX.yellowKerbTexture(); kt.repeat.set(Math.max(w, d) / 2, 1);
      const side = new THREE.MeshStandardMaterial({ map: kt, roughness: 0.7 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, d), [side, side, top, side, side, side]);
      m.position.set((x0 + x1) / 2, 0.14, (z0 + z1) / 2); m.receiveShadow = true; this.scene.add(m);
      this.kerbs.push({ shape: 'box', x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: w / 2, hd: d / 2, kind: 'kerb' });
      const L = Math.max(w, d); const horiz = w > d;
      for (let s = 4; s < L - 4; s += 7) {
        const bx = horiz ? x0 + s : (x0 + x1) / 2, bz = horiz ? (z0 + z1) / 2 : z0 + s;
        bushes.push(new THREE.Matrix4().compose(new THREE.Vector3(bx, 0.6, bz), new THREE.Quaternion(), new THREE.Vector3(1, 0.7 + rand() * 0.4, 1)));
      }
    };
    for (const e of Object.values(EDGES)) {
      const r = ROAD[e.type]; if (!r.dual) continue;
      const sA = NODES[e.a].kind === 'round' ? RB_OUTER + 0.5 : e.trimA + 1.5;
      const sB = e.len - (NODES[e.b].kind === 'round' ? RB_OUTER + 0.5 : e.trimB + 1.5);
      const cuts: [number, number][] = [];
      if (e.crossing !== undefined) { const c = e.crossing * e.len; cuts.push([sA, c - 2.5], [c + 2.5, sB]); } else cuts.push([sA, sB]);
      for (const [a, b] of cuts) {
        const p = edgePoint(e, a, 0), q = edgePoint(e, b, 0); const hr = r.reserve / 2 - 0.1;
        addBox(Math.min(p.x, q.x) - (e.horizontal ? 0 : hr), Math.max(p.x, q.x) + (e.horizontal ? 0 : hr), Math.min(p.z, q.z) - (e.horizontal ? hr : 0), Math.max(p.z, q.z) + (e.horizontal ? hr : 0));
      }
    }
    for (const n of Object.values(NODES)) if (n.kind === 'side') addBox(n.x - n.hx - 1.6, n.x + n.hx + 1.6, n.z - 1.4, n.z + 1.4);
    const bm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.9, 1), new THREE.MeshStandardMaterial({ color: 0x3f7a2a, roughness: 1, flatShading: true }), bushes.length);
    bushes.forEach((m, i) => bm.setMatrixAt(i, m)); bm.castShadow = true; this.scene.add(bm);
  }

  // ---------------------------------------------------------------- city blocks (pavements)
  buildBlocks() {
    const X = [-400, -200, 0, 200, 400], XH = [3.5, 10.5, 13.5, 10.5, 3.5];
    const Z = [-220, 0, 220], ZH = [3.5, 13.5, 3.5];
    const rects: { x0: number; x1: number; z0: number; z1: number; round: boolean }[] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      const r = { x0: X[i] + XH[i], x1: X[i + 1] - XH[i + 1], z0: Z[j] + ZH[j], z1: Z[j + 1] - ZH[j + 1], round: true };
      if (i === 1 && j === 0) { rects.push({ ...r, x1: PARKING.p1.x0 }, { ...r, x0: PARKING.p1.x1 }); }
      else if (i === 3 && j === 1) { rects.push({ ...r, x1: PARKING.p2.x0 }, { ...r, x0: PARKING.p2.x1 }); }
      else rects.push(r);
    }
    rects.push({ x0: -470, x1: 470, z0: -300, z1: -223.5, round: false }, { x0: -470, x1: 470, z0: 223.5, z1: 300, round: false });
    rects.push({ x0: -470, x1: -403.5, z0: -223.5, z1: 223.5, round: false }, { x0: 403.5, x1: 470, z0: -223.5, z1: 223.5, round: false });
    const pt = TX.pavementTexture(); pt.repeat.set(0.3, 0.3);
    const cap = new THREE.MeshStandardMaterial({ map: pt, roughness: 0.9, color: 0xd8d4cc });
    const side = new THREE.MeshStandardMaterial({ color: 0x9c978f, roughness: 0.8 });
    const gt = TX.grassTexture(); gt.repeat.set(0.1, 0.1);
    const lawn = new THREE.MeshStandardMaterial({ map: gt, roughness: 1, color: 0xb5cc95 });
    const rounds = Object.values(NODES).filter(n => n.kind === 'round');
    for (const r of rects) {
      this.blockRects.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 });
      const corners: [number, number][] = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
      const pts: [number, number][] = [];
      for (let i = 0; i < 4; i++) {
        const c = corners[i], pv = corners[(i + 3) % 4], nx = corners[(i + 1) % 4];
        const inD = norm(c[0] - pv[0], c[1] - pv[1]), outD = norm(nx[0] - c[0], nx[1] - c[1]);
        const rb = rounds.find(n => Math.hypot(c[0] - n.x, c[1] - n.z) < RB_OUTER + 4.5);
        if (rb) {
          const Rc = RB_OUTER + 4.5; const w = [c[0] - rb.x, c[1] - rb.z]; const cc = w[0] * w[0] + w[1] * w[1] - Rc * Rc;
          const bi = w[0] * inD[0] + w[1] * inD[1]; const t1 = bi + Math.sqrt(bi * bi - cc);
          const bo = w[0] * outD[0] + w[1] * outD[1]; const t2 = -bo + Math.sqrt(bo * bo - cc);
          const p = [c[0] - inD[0] * t1, c[1] - inD[1] * t1], q = [c[0] + outD[0] * t2, c[1] + outD[1] * t2];
          const a1 = Math.atan2(p[1] - rb.z, p[0] - rb.x); let a2 = Math.atan2(q[1] - rb.z, q[0] - rb.x);
          let da = a2 - a1; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; a2 = a1 + da;
          for (let k = 0; k <= 12; k++) { const a = a1 + (a2 - a1) * k / 12; pts.push([rb.x + Math.cos(a) * Rc, rb.z + Math.sin(a) * Rc]); }
        } else if (r.round) {
          const rr = 5; const p = [c[0] - inD[0] * rr, c[1] - inD[1] * rr], q = [c[0] + outD[0] * rr, c[1] + outD[1] * rr];
          for (let k = 0; k <= 6; k++) { const t = k / 6; const x = (1 - t) * (1 - t) * p[0] + 2 * (1 - t) * t * c[0] + t * t * q[0]; const z = (1 - t) * (1 - t) * p[1] + 2 * (1 - t) * t * c[1] + t * t * q[1]; pts.push([x, z]); }
        } else pts.push(c);
      }
      // clean the outline: drop NaNs and near-duplicate consecutive points (these break triangulation)
      const clean: [number, number][] = [];
      for (const pt of pts) {
        if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
        const last = clean[clean.length - 1];
        if (last && Math.hypot(last[0] - pt[0], last[1] - pt[1]) < 0.05) continue;
        clean.push(pt);
      }
      if (clean.length > 2 && Math.hypot(clean[0][0] - clean[clean.length - 1][0], clean[0][1] - clean[clean.length - 1][1]) < 0.05) clean.pop();
      let m: THREE.Mesh | undefined;
      if (clean.length >= 3) m = this.safe('Block outline', () => {
        const shape = new THREE.Shape(clean.map(([x, z]) => new THREE.Vector2(x, -z)));
        const g = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
        return new THREE.Mesh(g, [cap, side]);
      });
      if (!m) { const g = new THREE.BoxGeometry(r.x1 - r.x0, 0.18, r.z1 - r.z0); g.translate((r.x0 + r.x1) / 2, 0.09, (r.z0 + r.z1) / 2); m = new THREE.Mesh(g, cap); }
      m.receiveShadow = true; this.blockGroup.add(m);
      if (r.round && r.x1 - r.x0 > 20 && r.z1 - r.z0 > 20) {
        const lg = new THREE.PlaneGeometry(r.x1 - r.x0 - 9, r.z1 - r.z0 - 9); lg.rotateX(-Math.PI / 2);
        const lm = new THREE.Mesh(lg, lawn); lm.position.set((r.x0 + r.x1) / 2, 0.19, (r.z0 + r.z1) / 2); lm.receiveShadow = true; this.blockGroup.add(lm);
      }
    }
  }

  // ---------------------------------------------------------------- parking zones
  buildParking() {
    const lotMat = this.asphaltMat(); lotMat.color.set(0x8f8f95); lotMat.polygonOffset = true; lotMat.polygonOffsetFactor = 1; lotMat.polygonOffsetUnits = 1;
    const lines = new Batch(0.065, 1);
    for (const [key, p] of Object.entries(PARKING)) {
      const g = new THREE.PlaneGeometry(p.x1 - p.x0, p.z1 - p.z0); g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (p.x1 - p.x0) / 10, uv.getY(i) * (p.z1 - p.z0) / 10);
      const m = new THREE.Mesh(g, lotMat); m.position.set((p.x0 + p.x1) / 2, 0.025, (p.z0 + p.z1) / 2); m.receiveShadow = true; this.scene.add(m);
      const sgn = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshStandardMaterial({ map: TX.roundSign('parking') }));
      this.signAt(p.x1 - 1.2, p.z0 + 2, 0, sgn, 2.6);
      this.solids.push({ shape: 'circle', x: p.x1 - 1.2, z: p.z0 + 2, r: 0.2, kind: 'solid' });
      if (key === 'p1') {
        for (let z = -200; z <= -32; z += 4.2) {
          for (const side of [1, -1] as const) {
            const x = -100 + side * 7; const heading = side === 1 ? Math.PI / 4 : -Math.PI / 4;
            const hx = Math.sin(heading);
            // bay separator lines (45°)
            const lx = -100 + side * 3.5, lz = z - 2.1; lines.seg(lx, lz, lx + side * 7.5 * 0.707, lz + 7.5 * 0.707, 0.12);
            this.bays.push({ id: `p1-${side}-${z}`, lot: 'p1', x: x - hx * 0.3, z: z + 0.2, heading, side: side === 1 ? 'left' : 'right', occupied: false, obs: [] });
          }
        }
      } else {
        for (let z = 30; z <= 200; z += 7) {
          for (const side of [1, -1] as const) {
            const x = 300 + side * 5.5; const heading = side === 1 ? 0 : Math.PI;
            lines.seg(x - 1.4, z - 3.5, x + 1.4, z - 3.5, 0.12);
            this.bays.push({ id: `p2-${side}-${z}`, lot: 'p2', x, z, heading, side: side === 1 ? 'left' : 'right', occupied: false, obs: [] });
          }
        }
        lines.seg(304, 26, 304, 204, 0.12); lines.seg(296, 26, 296, 204, 0.12);
      }
    }
    const lm = new THREE.Mesh(lines.build(), new THREE.MeshStandardMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.scene.add(lm);
    // parked cars
    const models = ['B1', 'B2', 'B3', 'D1'];
    for (const b of this.bays) {
      if (rand() < 0.38) {
        const spec = VEHICLES.find(v => v.id === models[Math.floor(rand() * models.length)]) ?? VEHICLES[1];
        const mesh = this.safe('Parked car', () => buildVehicleMesh(spec, { color: new THREE.Color().setHSL(rand(), 0.4 + rand() * 0.4, 0.3 + rand() * 0.4).getHex(), learner: false, seed: Math.floor(rand() * 100), simple: true }));
        if (!mesh) continue;
        mesh.position.set(b.x, 0, b.z); mesh.rotation.y = b.heading; this.scene.add(mesh);
        b.mesh = mesh; b.occupied = true;
        const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
        b.obs = [-1, 0, 1].map(k => ({ shape: 'circle' as const, x: b.x + fx * k * 1.5, z: b.z + fz * k * 1.5, r: 1.0, kind: 'solid' as const, enabled: true, tag: b.id }));
        this.solids.push(...b.obs);
      }
    }
  }

  freeBay(b: Bay) { if (b.mesh) b.mesh.visible = false; b.obs.forEach(o => o.enabled = false); b.occupied = false; }

  // ---------------------------------------------------------------- signals & signs
  signAt(x: number, z: number, rotY: number, face: THREE.Mesh, h = 2.4) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h), new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.7, roughness: 0.4 }));
    pole.position.y = h / 2; pole.castShadow = true; g.add(pole);
    face.position.y = h; face.position.z = 0.06; g.add(face);
    const back = new THREE.Mesh((face.geometry as THREE.BufferGeometry).clone(), new THREE.MeshStandardMaterial({ color: 0x777777 })); back.rotation.y = Math.PI; back.position.y = h; back.position.z = 0.05; g.add(back);
    g.position.set(x, 0.18, z); g.rotation.y = rotY; this.scene.add(g); return g;
  }

  buildSignalsAndSigns() {
    const texCache: Record<string, THREE.Texture> = {};
    const sm = (k: string, f: () => THREE.Texture) => new THREE.MeshStandardMaterial({ map: texCache[k] ?? (texCache[k] = f()), transparent: true, alphaTest: 0.5 });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.6, roughness: 0.4 });
    for (const n of Object.values(NODES)) {
      if (n.signal) {
        const mk = (c: number) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0 });
        this.lights[n.id] = { h: { red: mk(0xff2020), yellow: mk(0xffb000), green: mk(0x20ff60) }, v: { red: mk(0xff2020), yellow: mk(0xffb000), green: mk(0x20ff60) } };
      }
      for (const eid of n.edges) {
        const e = EDGES[eid]; const d: DEdge = { e: eid, dir: e.b === n.id ? 1 : -1 };
        if (e.oneway && d.dir !== 1) continue;
        const t = dVec(d); const hw = halfWidth(e.type);
        const along = d.dir === 1 ? e.len - e.trimB - 1 : e.trimA + 1; const lat = (d.dir === 1 ? -1 : 1) * (hw + 1.6);
        const p = edgePoint(e, along, lat); const rot = Math.atan2(-t.x, -t.z);
        const ctl = approachControl(n.id, eid);
        if (ctl === 'signal') {
          const set = this.lights[n.id][e.horizontal ? 'h' : 'v'];
          const g = new THREE.Group();
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5), poleMat); pole.position.y = 2.5; pole.castShadow = true; g.add(pole);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(hw * 0.7, 0.14, 0.14), poleMat); arm.position.set(hw * 0.35, 4.9, 0); g.add(arm);
          for (const [ox, oy] of [[0, 3.2], [hw * 0.65, 4.4]]) {
            const hsg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.35), housingMat); hsg.position.set(ox, oy, 0.2); hsg.castShadow = true; g.add(hsg);
            ([['red', 0.42], ['yellow', 0], ['green', -0.42]] as const).forEach(([k, dy]) => {
              const l = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), set[k]); l.position.set(ox, oy + dy, 0.38); g.add(l);
              const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 12, 1, true, 0, Math.PI), housingMat); visor.rotation.x = Math.PI / 2; visor.rotation.y = 0; visor.position.set(ox, oy + dy + 0.02, 0.48); g.add(visor);
            });
          }
          // side flip: arm should reach over the carriageway (towards the right of traffic)
          g.position.set(p.x, 0.18, p.z); g.rotation.y = rot; this.scene.add(g);
          this.solids.push({ shape: 'circle', x: p.x, z: p.z, r: 0.3, kind: 'solid' });
        } else if (ctl === 'stop') {
          this.signAt(p.x, p.z, rot, new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), sm('stop', () => TX.roundSign('stop'))));
        } else if (ctl === 'giveway') {
          this.signAt(p.x, p.z, rot, new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sm('gw', () => TX.roundSign('giveway'))));
          if (n.kind === 'round') { const q = edgePoint(e, d.dir === 1 ? along - 30 : along + 30, lat); this.signAt(q.x, q.z, rot, new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), sm('rb', () => TX.roundSign('roundabout')))); }
        }
        // speed limit sign at departure of this edge from node n (other carriageway)
        const dep: DEdge = { e: eid, dir: e.a === n.id ? 1 : -1 };
        if (!(e.oneway && dep.dir !== 1)) {
          const tv = dVec(dep); const s2 = dep.dir === 1 ? e.trimA + 12 : e.len - e.trimB - 12; const l2 = (dep.dir === 1 ? -1 : 1) * (hw + 1.6);
          const q = edgePoint(e, s2, l2); const lim = ROAD[e.type].limit;
          this.signAt(q.x, q.z, Math.atan2(-tv.x, -tv.z), new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), sm('lim' + lim, () => TX.roundSign('limit', lim))));
        }
      }
    }
    // no entry at P1 exit
    const e = EDGES.p1; const p = edgePoint(e, e.len - e.trimB - 1, 5.2);
    this.signAt(p.x, p.z, Math.atan2(e.dx, e.dz), new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), sm('ne', () => TX.roundSign('noentry'))));
  }

  // ---------------------------------------------------------------- street lamps
  buildLamps() {
    const poles: THREE.Matrix4[] = [], heads: THREE.Matrix4[] = [], pools: THREE.Matrix4[] = [];
    for (const e of Object.values(EDGES)) {
      if (e.type === 'parking') continue;
      const hw = halfWidth(e.type); const r = ROAD[e.type];
      const sides = r.dual ? [0] : [-1, 1];
      for (let s = e.trimA + 15; s < e.len - e.trimB - 10; s += 36) {
        for (const sd of sides) {
          const lat = sd === 0 ? 0 : sd * (hw + 1.3);
          const p = edgePoint(e, s, lat);
          if (e.crossing !== undefined && Math.abs(s - e.crossing * e.len) < 6) continue;
          poles.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, 4.5, p.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
          const armDirs = sd === 0 ? [-1, 1] : [-sd];
          for (const ad of armDirs) {
            const hp = edgePoint(e, s, lat + ad * 2.2);
            heads.push(new THREE.Matrix4().compose(new THREE.Vector3(hp.x, 8.8, hp.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
            const pp = edgePoint(e, s, lat + ad * 3.5);
            pools.push(new THREE.Matrix4().compose(new THREE.Vector3(pp.x, 0.08, pp.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
          }
          if (sd !== 0) this.solids.push({ shape: 'circle', x: p.x, z: p.z, r: 0.25, kind: 'solid' });
        }
      }
    }
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.14, 9), new THREE.MeshStandardMaterial({ color: 0x52525b, metalness: 0.7, roughness: 0.35 }), poles.length);
    poles.forEach((m, i) => pm.setMatrixAt(i, m)); pm.castShadow = true; this.scene.add(pm);
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffd9a0, emissiveIntensity: 0 });
    const hg = new THREE.BoxGeometry(0.9, 0.18, 0.5);
    const hm = new THREE.InstancedMesh(hg, this.lampMat, heads.length); heads.forEach((m, i) => hm.setMatrixAt(i, m)); this.scene.add(hm);
    const [c, g] = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; return [cv, cv.getContext('2d')!] as const; })();
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,210,150,0.55)'); gr.addColorStop(1, 'rgba(255,200,140,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const pg = new THREE.PlaneGeometry(14, 14); pg.rotateX(-Math.PI / 2);
    const pool = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), pools.length);
    pools.forEach((m, i) => pool.setMatrixAt(i, m)); pool.visible = false; this.scene.add(pool); this.nightObjects.push(pool);
  }

  // ---------------------------------------------------------------- buildings
  wallMats(): THREE.MeshStandardMaterial[] {
    if (this.windowMats.length) return this.windowMats;
    for (let v = 0; v < 6; v++) {
      const m = new THREE.MeshStandardMaterial({ map: TX.windowTexture(v), emissiveMap: TX.windowEmissive(v), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.55, metalness: v === 5 ? 0.4 : 0.05 });
      this.windowMats.push(m);
    }
    return this.windowMats;
  }

  // Generic buildings are batched into one merged mesh per facade variant (few draw calls).
  bGeo: THREE.BufferGeometry[][] = [[], [], [], [], [], []]; roofGeo: THREE.BufferGeometry[] = []; tankGeo: THREE.BufferGeometry[] = [];
  building(x: number, z: number, w: number, d: number, h: number, variant: number) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const faceSize = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) uv.setXY(i, 0.02, 0.02);
      else uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(faceSize[f][0] / 14)), uv.getY(i) * Math.max(1, Math.round(faceSize[f][1] / 18)));
    }
    g.clearGroups(); g.translate(x, h / 2 + 0.18, z); this.bGeo[variant % 6].push(g);
    const roof = new THREE.BoxGeometry(w + 0.4, 0.8, d + 0.4); roof.clearGroups(); roof.translate(x, h + 0.58, z); this.roofGeo.push(roof);
    if (rand() < 0.7) { const t = new THREE.CylinderGeometry(0.9, 0.9, 1.8, 10); t.clearGroups(); t.translate(x + (rand() - 0.5) * w * 0.6, h + 1.1, z + (rand() - 0.5) * d * 0.6); this.tankGeo.push(t); }
    this.solids.push({ shape: 'box', x, z, hw: w / 2, hd: d / 2, kind: 'solid' });
  }
  flushBuildings() {
    const add = (list: THREE.BufferGeometry[], mat: THREE.Material, shadow: boolean) => {
      if (!list.length) return;
      let merged: THREE.BufferGeometry | null = null;
      try { merged = mergeGeometries(list, false); } catch (e) { this.reportFailure('Geometry merge', e); }
      if (merged) { list.forEach(g => g.dispose()); const m = new THREE.Mesh(merged, mat); m.castShadow = shadow; m.receiveShadow = true; this.scene.add(m); return; }
      // fallback: individual meshes
      for (const g of list) { const m = new THREE.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true; this.scene.add(m); }
    };
    const mats = this.wallMats();
    this.bGeo.forEach((list, i) => add(list, mats[i], true));
    add(this.roofGeo, new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 0.9 }), true);
    add(this.tankGeo, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }), false);
    this.bGeo = [[], [], [], [], [], []]; this.roofGeo = []; this.tankGeo = [];
  }

  labelSign(text: string, sub: string, x: number, y: number, z: number, rotY: number, color: string, w = 12) {
    const t = TX.textTexture(text, { bg: color, fg: '#fff', w: 1024, h: 256, sub, border: '#ffffff' });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25 }));
    m.position.set(x, y, z); m.rotation.y = rotY; this.scene.add(m); return m;
  }

  buildLandmarksAndBuildings() {
    const occupied: { x0: number; x1: number; z0: number; z1: number }[] = [];
    const faceRoad = (x: number, z: number) => {
      // face towards nearest road edge line
      let best = { d: 1e9, rot: 0 };
      for (const e of Object.values(EDGES)) {
        const rx = x - e.ax, rz = z - e.az; const al = rx * e.dx + rz * e.dz; if (al < 0 || al > e.len) continue;
        const lat = rx * e.px + rz * e.pz; if (Math.abs(lat) < best.d) best = { d: Math.abs(lat), rot: Math.atan2(-e.px * Math.sign(lat), -e.pz * Math.sign(lat)) };
      }
      return best.rot;
    };
    for (const L of LANDMARKS) {
      occupied.push({ x0: L.x - L.w / 2 - 3, x1: L.x + L.w / 2 + 3, z0: L.z - L.d / 2 - 3, z1: L.z + L.d / 2 + 3 });
      this.safe(`Landmark ${L.name}`, () => {
      const rot = faceRoad(L.x, L.z);
      const fx = Math.sin(rot), fz = Math.cos(rot);
      const frontDist = Math.abs(fx) > 0.5 ? L.w / 2 : L.d / 2;
      const mat = new THREE.MeshStandardMaterial({ color: L.color, roughness: 0.5, metalness: L.id === 'bank' ? 0.6 : 0.05 });
      if (L.id === 'stadium') {
        const pitch = new THREE.Mesh(new THREE.PlaneGeometry(L.w - 16, L.d - 16), new THREE.MeshStandardMaterial({ color: 0x2f8f3a })); pitch.rotation.x = -Math.PI / 2; pitch.position.set(L.x, 0.22, L.z); this.scene.add(pitch);
        const stand = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.8 });
        for (const [sx, sz, sw, sd] of [[0, -1, L.w, 7], [0, 1, L.w, 7], [-1, 0, 7, L.d], [1, 0, 7, L.d]]) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(sw, L.h, sd), stand); b.position.set(L.x + sx * (L.w / 2 - 3.5), L.h / 2, L.z + sz * (L.d / 2 - 3.5)); b.castShadow = true; this.scene.add(b);
          this.solids.push({ shape: 'box', x: b.position.x, z: b.position.z, hw: sw / 2, hd: sd / 2, kind: 'solid' });
        }
        for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 28), stand); mast.position.set(L.x + cx * L.w / 2, 14, L.z + cz * L.d / 2); this.scene.add(mast); const lp = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 0.5), this.lampMat); lp.position.set(L.x + cx * L.w / 2, 28, L.z + cz * L.d / 2); this.scene.add(lp); }
      } else if (L.id === 'fuel') {
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(L.w, 1, L.d), new THREE.MeshStandardMaterial({ color: 0xfafafa, emissive: 0xffffff, emissiveIntensity: 0.1 }));
        canopy.position.set(L.x, 6, L.z); canopy.castShadow = true; this.scene.add(canopy);
        const band = new THREE.Mesh(new THREE.BoxGeometry(L.w + 0.2, 0.5, L.d + 0.2), mat); band.position.set(L.x, 5.6, L.z); this.scene.add(band);
        for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 0.6), new THREE.MeshStandardMaterial({ color: 0xe5e7eb })); col.position.set(L.x + cx * L.w * 0.35, 3, L.z + cz * L.d * 0.3); this.scene.add(col); this.solids.push({ shape: 'circle', x: col.position.x, z: col.position.z, r: 0.5, kind: 'solid' }); }
        for (let i = -1; i <= 1; i += 2) { const pump = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.6), mat); pump.position.set(L.x + i * 5, 1.1, L.z); pump.castShadow = true; this.scene.add(pump); this.solids.push({ shape: 'box', x: pump.position.x, z: L.z, hw: 0.6, hd: 0.4, kind: 'solid' }); }
        this.building(L.x - fx * 18, L.z - fz * 18, 16, 10, 5, 1);
      } else if (L.id === 'stage') {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(L.w, 0.4, 10), mat); roof.position.set(L.x, 4.5, L.z - L.d / 2 + 6); roof.castShadow = true; this.scene.add(roof);
        for (let i = 0; i < 5; i++) {
          const spec = VEHICLES.find(v => v.id === 'D1')!;
          const mm = buildVehicleMesh(spec, { color: 0xffffff, learner: false, seed: i, simple: true });
          mm.position.set(L.x - 18 + i * 9, 0.18, L.z + 4); mm.rotation.y = Math.PI; this.scene.add(mm);
          this.solids.push({ shape: 'box', x: mm.position.x, z: mm.position.z, hw: 1.1, hd: 2.8, kind: 'solid' });
        }
      } else if (L.id === 'church') {
        const b = new THREE.Mesh(new THREE.BoxGeometry(L.w, L.h * 0.6, L.d), mat); b.position.set(L.x, L.h * 0.3 + 0.18, L.z); b.castShadow = true; this.scene.add(b);
        const rg = new THREE.CylinderGeometry(0.01, L.w * 0.72, L.h * 0.35, 4, 1); rg.rotateY(Math.PI / 4);
        const roof = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x7f1d1d })); roof.scale.set(1, 1, L.d / L.w); roof.position.set(L.x, L.h * 0.6 + L.h * 0.175, L.z); roof.castShadow = true; this.scene.add(roof);
        const tower = new THREE.Mesh(new THREE.BoxGeometry(6, L.h * 1.5, 6), mat); tower.position.set(L.x - fx * (L.d / 2 - 3), L.h * 0.75, L.z - fz * (L.d / 2 - 3)); tower.castShadow = true; this.scene.add(tower);
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 0.4), new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.9, roughness: 0.3 })); crossV.position.set(tower.position.x, L.h * 1.5 + 1.5, tower.position.z); this.scene.add(crossV);
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.4), crossV.material); crossH.position.set(tower.position.x, L.h * 1.5 + 2, tower.position.z); crossH.rotation.y = rot; this.scene.add(crossH);
        this.solids.push({ shape: 'box', x: L.x, z: L.z, hw: L.w / 2, hd: L.d / 2, kind: 'solid' });
      } else if (L.id === 'kicc') {
        // KICC Nairobi — Iconic terracotta cylindrical tower + conical saucer helipad + amphitheatre!
        const podium = new THREE.Mesh(new THREE.BoxGeometry(L.w, 6, L.d), new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.7 }));
        podium.position.set(L.x, 3.18, L.z); podium.castShadow = true; this.scene.add(podium);
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 10.5, L.h - 8, 28), new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.55, metalness: 0.15 }));
        cyl.position.set(L.x - 4, (L.h - 8) / 2 + 6, L.z); cyl.castShadow = true; this.scene.add(cyl);
        const saucer = new THREE.Mesh(new THREE.ConeGeometry(13.5, 6.5, 28), new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.45, metalness: 0.25 }));
        saucer.position.set(L.x - 4, L.h + 1, L.z); saucer.castShadow = true; this.scene.add(saucer);
        const hut = new THREE.Mesh(new THREE.ConeGeometry(8.5, 9, 16), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.6 }));
        hut.position.set(L.x + 9, 10.5, L.z + 5); hut.castShadow = true; this.scene.add(hut);
        this.solids.push({ shape: 'box', x: L.x, z: L.z, hw: L.w / 2, hd: L.d / 2, kind: 'solid' });
      } else if (L.id === 'hilton') {
        // Hilton Nairobi — Circular tower on rectangular arcade podium
        const pod = new THREE.Mesh(new THREE.BoxGeometry(L.w, 7, L.d), new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.7 }));
        pod.position.set(L.x, 3.68, L.z); pod.castShadow = true; this.scene.add(pod);
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, L.h - 7, 24), this.wallMats()[1]);
        cyl.position.set(L.x, (L.h - 7) / 2 + 7.18, L.z); cyl.castShadow = true; this.scene.add(cyl);
        this.solids.push({ shape: 'box', x: L.x, z: L.z, hw: L.w / 2, hd: L.d / 2, kind: 'solid' });
      } else if (L.id === 'nation') {
        // Nation Centre — Twin black-and-white cylindrical towers + central podium
        const pod = new THREE.Mesh(new THREE.BoxGeometry(L.w, L.h * 0.55, L.d), this.wallMats()[5]);
        pod.position.set(L.x, L.h * 0.275 + 0.18, L.z); pod.castShadow = true; this.scene.add(pod);
        for (const sx of [-8, 8]) {
          const tw = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, L.h, 20), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }));
          tw.position.set(L.x + sx, L.h / 2 + 0.18, L.z); tw.castShadow = true; this.scene.add(tw);
          const crown = new THREE.Mesh(new THREE.ConeGeometry(5.6, 5, 20), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
          crown.position.set(L.x + sx, L.h + 2.6, L.z); this.scene.add(crown);
        }
        this.solids.push({ shape: 'box', x: L.x, z: L.z, hw: L.w / 2, hd: L.d / 2, kind: 'solid' });
      } else if (L.id === 'jamia') {
        // Jamia Mosque — Green & white facade with 3 domes and twin minarets
        const hall = new THREE.Mesh(new THREE.BoxGeometry(L.w, L.h * 0.65, L.d), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 }));
        hall.position.set(L.x, L.h * 0.325 + 0.18, L.z); hall.castShadow = true; this.scene.add(hall);
        const domeMat = new THREE.MeshStandardMaterial({ color: 0x15803d, metalness: 0.4, roughness: 0.3 });
        for (const [dx, r] of [[-8, 4.2], [0, 6.0], [8, 4.2]] as [number, number][]) {
          const dm = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
          dm.position.set(L.x + dx, L.h * 0.65 + 0.18, L.z); this.scene.add(dm);
        }
        for (const sx of [-L.w / 2 + 2.5, L.w / 2 - 2.5]) {
          const min = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, L.h * 1.65, 12), hall.material);
          min.position.set(L.x + sx, L.h * 0.825, L.z + L.d / 2 - 2.5); min.castShadow = true; this.scene.add(min);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(1.9, 4, 12), domeMat);
          cap.position.set(L.x + sx, L.h * 1.65 + 2, L.z + L.d / 2 - 2.5); this.scene.add(cap);
        }
        this.solids.push({ shape: 'box', x: L.x, z: L.z, hw: L.w / 2, hd: L.d / 2, kind: 'solid' });
      } else if (L.id === 'parliament') {
        // Parliament Buildings & tall Clock Tower
        const main = new THREE.Mesh(new THREE.BoxGeometry(L.w, L.h * 0.55, L.d), mat);
        main.position.set(L.x, L.h * 0.275 + 0.18, L.z); main.castShadow = true; this.scene.add(main);
        const clockT = new THREE.Mesh(new THREE.BoxGeometry(6.5, L.h * 1.9, 6.5), new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.6 }));
        clockT.position.set(L.x + L.w * 0.3, L.h * 0.95, L.z); clockT.castShadow = true; this.scene.add(clockT);
        const face = new THREE.Mesh(new THREE.CircleGeometry(2.2, 16), new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfef08a, emissiveIntensity: 0.5 }));
        face.position.set(L.x + L.w * 0.3, L.h * 1.65, L.z - 3.3); face.rotation.y = Math.PI; this.scene.add(face);
        this.flagPole(L.x - 10, L.z - L.d / 2 - 3, TX.kenyaFlag(), 11);
        this.solids.push({ shape: 'box', x: L.x, z: L.z, hw: L.w / 2, hd: L.d / 2, kind: 'solid' });
      } else {
        const g = new THREE.BoxGeometry(L.w, L.h, L.d);
        const mats: THREE.Material[] = [mat, mat, mat, mat, mat, mat];
        if (L.id === 'bank' || L.id === 'hotel' || L.id === 'hospital') { const w = this.wallMats()[L.id === 'bank' ? 5 : L.id === 'hotel' ? 2 : 4]; mats.splice(0, 6, w, w, mat, mat, w, w); const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * Math.max(1, Math.round(L.h / 12))); }
        const b = new THREE.Mesh(g, mats); b.position.set(L.x, L.h / 2 + 0.18, L.z); b.castShadow = true; b.receiveShadow = true; this.scene.add(b);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(L.w + 1, 1, L.d + 1), new THREE.MeshStandardMaterial({ color: 0xe7e5e4 })); cap.position.set(L.x, L.h + 0.6, L.z); this.scene.add(cap);
        this.solids.push({ shape: 'box', x: L.x, z: L.z, hw: L.w / 2, hd: L.d / 2, kind: 'solid' });
        if (L.id === 'hospital') { const cr = TX.textTexture('+', { bg: '#ffffff', fg: '#dc2626', w: 256, h: 256, font: 'bold 240px Arial' }); const cm = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ map: cr, emissive: 0xffffff, emissiveMap: cr, emissiveIntensity: 0.4 })); cm.position.set(L.x + fx * (frontDist + 0.1), L.h - 4, L.z + fz * (frontDist + 0.1)); cm.rotation.y = rot; this.scene.add(cm); }
        if (L.id === 'ntsa' || L.id === 'police') { const fl = TX.kenyaFlag(); this.flagPole(L.x + fx * (frontDist + 6) + fz * 8, L.z + fz * (frontDist + 6) - fx * 8, fl, 10); }
        if (L.id === 'school') {
          // training cones yard
          for (let i = 0; i < 8; i++) { const cn = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 12), new THREE.MeshStandardMaterial({ color: 0xff6a00 })); cn.position.set(L.x + fx * (frontDist + 5) + (i - 4) * 2.5 * fz, 0.58, L.z + fz * (frontDist + 5) - (i - 4) * 2.5 * fx); this.scene.add(cn); }
        }
      }
      const signY = L.id === 'stadium' ? L.h + 3 : L.id === 'fuel' ? 7.6 : Math.min(L.h - 2, 9);
      const dist = L.id === 'fuel' ? L.d / 2 + 0.6 : frontDist + 0.15;
      this.labelSign(`${L.name}`, L.id === 'ntsa' ? 'National Transport & Safety Authority' : L.id === 'school' ? 'Chief Instructor: zingri_master · ZingTrixx Lab™' : 'Nairobi CBD · MTB Landmark', L.x + fx * dist, signY, L.z + fz * dist, rot, L.id === 'hospital' ? '#b91c1c' : L.color === '#e5e7eb' || L.color === '#f5f5f4' ? '#334155' : L.color, Math.min(L.w * 0.8, 16));
      });
    }
    // generic buildings in blocks
    for (const r of this.blockRects) {
      const outer = r.x1 - r.x0 > 400 || r.z1 - r.z0 > 400;
      const w = r.x1 - r.x0, d = r.z1 - r.z0; if (w < 16 || d < 16) continue;
      const step = outer ? 26 : 30;
      for (let x = r.x0 + 12; x < r.x1 - 10; x += step) for (let z = r.z0 + 12; z < r.z1 - 10; z += step) {
        const bw = 12 + rand() * 12, bd = 12 + rand() * 10;
        const cx = Math.min(Math.max(x + (rand() - 0.5) * 4, r.x0 + bw / 2 + 5), r.x1 - bw / 2 - 5), cz = Math.min(Math.max(z + (rand() - 0.5) * 4, r.z0 + bd / 2 + 5), r.z1 - bd / 2 - 5);
        const box = { x0: cx - bw / 2, x1: cx + bw / 2, z0: cz - bd / 2, z1: cz + bd / 2 };
        if (occupied.some(o => box.x0 < o.x1 && box.x1 > o.x0 && box.z0 < o.z1 && box.z1 > o.z0)) continue;
        if (Object.values(NODES).some(n => n.kind === 'round' && Math.hypot(cx - n.x, cz - n.z) < RB_OUTER + 22)) continue;
        if (outer && Math.abs(cx) < 460 && Math.abs(cz) < 240 && ((cz > -300 && cz < -224) || (cz > 224 && cz < 300) || Math.abs(cx) > 403)) { /* outer ring ok */ }
        if (rand() < 0.28) { this.treeAt(cx, cz); this.treeAt(cx + 6, cz + 4); continue; }
        const dist = Math.hypot(cx, cz * 1.5); const hmax = dist < 250 ? 48 : 22;
        this.building(cx, cz, bw, bd, 7 + rand() * hmax, Math.floor(rand() * 6));
        occupied.push({ x0: box.x0 - 3, x1: box.x1 + 3, z0: box.z0 - 3, z1: box.z1 + 3 });
      }
    }
    // pavement trees along block edges
    for (const r of this.blockRects) {
      if (r.x1 - r.x0 > 400 || r.z1 - r.z0 > 400) continue;
      for (let x = r.x0 + 10; x < r.x1 - 8; x += 22) { this.treeAt(x, r.z0 + 2.4, 0.7); this.treeAt(x, r.z1 - 2.4, 0.7); }
      for (let z = r.z0 + 10; z < r.z1 - 8; z += 22) { this.treeAt(r.x0 + 2.4, z, 0.7); this.treeAt(r.x1 - 2.4, z, 0.7); }
    }
    this.safe('Merged buildings', () => this.flushBuildings());
    this.safe('Trees', () => this.flushTrees());
  }

  treeList: { x: number; z: number; s: number; acacia: boolean }[] = [];
  treeAt(x: number, z: number, s = 1) {
    if (Object.values(NODES).some(n => n.kind === 'round' ? Math.hypot(x - n.x, z - n.z) < RB_OUTER + 5 : Math.abs(x - n.x) < n.hx + 4 && Math.abs(z - n.z) < n.hz + 4)) return;
    this.treeList.push({ x, z, s: s * (0.8 + rand() * 0.5), acacia: rand() < 0.35 });
  }
  flushTrees() {
    const n = this.treeList.length;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 1, 6), new THREE.MeshStandardMaterial({ color: 0x5b4030, roughness: 1 }), n);
    const leaf = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), n);
    const col = new THREE.Color();
    this.treeList.forEach((t, i) => {
      const h = (t.acacia ? 4.5 : 3.2) * t.s;
      trunk.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(t.x, h / 2 + 0.18, t.z), new THREE.Quaternion(), new THREE.Vector3(t.s, h, t.s)));
      const fs = t.acacia ? new THREE.Vector3(4 * t.s, 1.1 * t.s, 4 * t.s) : new THREE.Vector3(2.6 * t.s, 3 * t.s, 2.6 * t.s);
      leaf.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(t.x, h + fs.y * 0.6, t.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), fs));
      leaf.setColorAt(i, col.setHSL(0.24 + rand() * 0.08, 0.45 + rand() * 0.2, 0.22 + rand() * 0.12));
      this.solids.push({ shape: 'circle', x: t.x, z: t.z, r: 0.4 * t.s, kind: 'solid' });
    });
    trunk.castShadow = true; leaf.castShadow = true; leaf.receiveShadow = true;
    this.scene.add(trunk, leaf);
  }

  buildScenery() {
    // distant hills (Ngong hills backdrop)
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x5f7d4a, roughness: 1, flatShading: true });
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2 + rand() * 0.1; const R = 1100 + rand() * 350; const h = 80 + rand() * 180;
      const m = new THREE.Mesh(new THREE.ConeGeometry(180 + rand() * 180, h, 7), hillMat); m.position.set(Math.cos(a) * R, h / 2 - 5, Math.sin(a) * R); this.scene.add(m);
    }
    // billboards
    const bt = TX.textTexture('Z-DRIVE · NAIROBI', { bg: '#0f172a', fg: '#facc15', w: 1024, h: 384, sub: 'Instructor: zingri_master · Powered by ZingTrixx Lab™' });
    for (const [x, z, r] of [[-430, -120, Math.PI / 2], [430, 110, -Math.PI / 2], [100, -250, 0], [-120, 250, Math.PI]] as [number, number, number][]) {
      const g = new THREE.Group();
      const legs = new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.6 });
      for (const lx of [-4, 4]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8), legs); l.position.set(lx, 4, 0); g.add(l); }
      const board = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.2), new THREE.MeshStandardMaterial({ map: bt, emissive: 0xffffff, emissiveMap: bt, emissiveIntensity: 0.3 })); board.position.set(0, 9.5, 0.3); g.add(board);
      g.position.set(x, 0, z); g.rotation.y = r; this.scene.add(g);
    }
    this.safe('Multi-biome proving ground', () => this.buildBiomeRing());
  }

  /** Builds the All-in-One Kenya Multi-Biome Ring (Highway, 3D Hill Climb, Winding Pass, Off-Road, Desert, Snow & Mud) around the CBD perimeter */
  buildBiomeRing() {
    // 1. North-West: Thika Superhighway Express (x: -440..0, z: -325)
    const hwGeo = new THREE.PlaneGeometry(440, 24); hwGeo.rotateX(-Math.PI / 2);
    const hwMesh = new THREE.Mesh(hwGeo, this.asphaltMat());
    hwMesh.position.set(-220, 0.035, -325); hwMesh.receiveShadow = true; this.scene.add(hwMesh);
    this.labelSign('🛣️ THIKA SUPERHIGHWAY EXPRESS', '100 KM/H SPEED ZONE · KEEP LEFT', -210, 7.5, -340, 0, '#0369a1', 18);

    // Connect CBD Junction A (-400, -220) and C (0, -220) to the North Highway/Hill corridor
    for (const cx of [-400, 0, 400]) {
      const link = new THREE.PlaneGeometry(16, 110); link.rotateX(-Math.PI / 2);
      const lm = new THREE.Mesh(link, this.asphaltMat());
      lm.position.set(cx, 0.032, -275); this.scene.add(lm);
    }

    // 2. North-East: Rift Valley Escarpment 3D Sloped Hill Ramp (x: 0..380, z: -325)
    const segs = 48;
    const hillGeo = new THREE.PlaneGeometry(380, 22, segs, 2);
    hillGeo.rotateX(-Math.PI / 2);
    const pos = hillGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i) + 190; // 0..380
      const u = Math.max(0, Math.min(1, lx / 380));
      const s = Math.sin(Math.PI * u);
      pos.setY(i, 13.5 * s * s + 0.04);
    }
    hillGeo.computeVertexNormals();
    const hillMesh = new THREE.Mesh(hillGeo, this.asphaltMat());
    hillMesh.position.set(190, 0, -325); hillMesh.receiveShadow = true; this.scene.add(hillMesh);

    // Embankment wall under the hill ramp
    const wallGeo = new THREE.PlaneGeometry(380, 14, segs, 1);
    const wPos = wallGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < wPos.count; i++) {
      const lx = wPos.getX(i) + 190;
      const u = Math.max(0, Math.min(1, lx / 380));
      const s = Math.sin(Math.PI * u);
      const topY = 13.5 * s * s;
      wPos.setY(i, wPos.getY(i) > 0 ? topY : 0);
    }
    wallGeo.computeVertexNormals();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.9, side: THREE.DoubleSide });
    const wallF = new THREE.Mesh(wallGeo, wallMat); wallF.position.set(190, 0, -314); this.scene.add(wallF);
    const wallB = new THREE.Mesh(wallGeo, wallMat); wallB.position.set(190, 0, -336); this.scene.add(wallB);

    // Hill-Start Test Box halfway up the 11% incline (at x = 95, z = -325, y = 6.75m, slope ~ 11%)
    const hsBox = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 5),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }),
    );
    hsBox.rotation.x = -Math.PI / 2;
    hsBox.rotation.y = 0;
    hsBox.rotation.z = -0.11;
    hsBox.position.set(95, 6.85, -325);
    this.scene.add(hsBox);
    this.labelSign('⛰️ RIFT ESCARPMENT HILL-START ZONE', 'STOP IN YELLOW BOX · HOLD WITH CLUTCH BITE (Q+SHIFT) + GAS', 95, 13.5, -339, 0, '#b45309', 18);

    // 3. East-North: Aberdare Winding Mountain Pass (x: 495, z: -310..20)
    const windGeo = new THREE.PlaneGeometry(24, 340, 2, 40);
    windGeo.rotateX(-Math.PI / 2);
    const wp = windGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < wp.count; i++) {
      const lz = wp.getZ(i) - 145;
      const sx = Math.sin((lz + 280) * 0.045) * 14;
      const sy = Math.max(0, 2.2 + Math.sin((lz + 280) * 0.035) * 2.2);
      wp.setX(i, wp.getX(i) + sx);
      wp.setY(i, sy + 0.04);
    }
    windGeo.computeVertexNormals();
    const windMesh = new THREE.Mesh(windGeo, this.asphaltMat());
    windMesh.position.set(495, 0, -145); this.scene.add(windMesh);
    this.labelSign('〰️ ABERDARE WINDING PASS', 'HAIRPIN S-CURVES · REDUCE SPEED', 520, 9, -140, -Math.PI / 2, '#1d4ed8', 16);

    // 4. East-South: Tsavo Off-Road Gravel Track (x: 495, z: 20..325)
    const gravGeo = new THREE.PlaneGeometry(26, 310); gravGeo.rotateX(-Math.PI / 2);
    const gravMat = new THREE.MeshStandardMaterial({ color: 0x9a5b32, roughness: 0.98 });
    const gravMesh = new THREE.Mesh(gravGeo, gravMat);
    gravMesh.position.set(495, 0.04, 175); gravMesh.receiveShadow = true; this.scene.add(gravMesh);
    this.labelSign('🪨 TSAVO OFF-ROAD GRAVEL', 'ROUGH CORRUGATED TRAIL · 76% GRIP', 520, 7, 150, -Math.PI / 2, '#9a3412', 16);

    // 5. South-East: Chalbi Desert Sand Dunes (x: 150..505, z: 325)
    const desGeo = new THREE.PlaneGeometry(360, 75, 36, 8); desGeo.rotateX(-Math.PI / 2);
    const dp = desGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < dp.count; i++) {
      const gx = dp.getX(i) + 325, gz = dp.getZ(i) + 325;
      const dy = Math.max(0, Math.sin((gx - 140) * 0.03) * Math.sin((gz - 255) * 0.04) * 1.8);
      dp.setY(i, dy + 0.03);
    }
    desGeo.computeVertexNormals();
    const desMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.95 });
    const desMesh = new THREE.Mesh(desGeo, desMat);
    desMesh.position.set(325, 0, 325); desMesh.receiveShadow = true; this.scene.add(desMesh);
    this.labelSign('🏜️ CHALBI DESERT SAND DUNES', 'SOFT SAND · MAINTAIN MOMENTUM (62% GRIP)', 300, 8, 360, Math.PI, '#ca8a04', 18);

    // 6. South-Center: Mt. Kenya Alpine Snow & Ice Pass (x: -155..150, z: 325)
    const snowGeo = new THREE.PlaneGeometry(310, 75); snowGeo.rotateX(-Math.PI / 2);
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.25, metalness: 0.1 });
    const snowMesh = new THREE.Mesh(snowGeo, snowMat);
    snowMesh.position.set(0, 0.04, 325); snowMesh.receiveShadow = true; this.scene.add(snowMesh);
    this.labelSign('❄️ MT. KENYA SNOW & ICE PASS', 'ICY SURFACE (42% GRIP!) · GENTLE STEERING & BRAKING', 0, 8, 360, Math.PI, '#0284c7', 18);

    // 7. South-West: Mau Forest Deep Muddy Track (x: -460..-155, z: 325)
    const mudGeo = new THREE.PlaneGeometry(310, 75); mudGeo.rotateX(-Math.PI / 2);
    const mudMat = new THREE.MeshStandardMaterial({ color: 0x422006, roughness: 0.35, metalness: 0.15 });
    const mudMesh = new THREE.Mesh(mudGeo, mudMat);
    mudMesh.position.set(-305, 0.04, 325); mudMesh.receiveShadow = true; this.scene.add(mudMesh);
    this.labelSign('🌧️ MAU FOREST DEEP MUD BOG', 'HIGH ROLLING DRAG · USE LOW GEAR & STEADY THROTTLE', -300, 8, 360, Math.PI, '#713f12', 18);

    // Connect South perimeter back to CBD Junctions N (-400, 220), M (0, 220), J (400, 220)
    for (const cx of [-400, 0, 400]) {
      const link = new THREE.PlaneGeometry(18, 110); link.rotateX(-Math.PI / 2);
      const lm = new THREE.Mesh(link, this.asphaltMat());
      lm.position.set(cx, 0.035, 275); this.scene.add(lm);
    }
  }

  buildBoardLabels() {
    for (const n of Object.values(NODES)) {
      const t = TX.textTexture(n.id, { bg: n.kind === 'round' ? '#1d4ed8' : n.id.startsWith('P') ? '#0369a1' : '#111827', fg: '#fff', w: 256, h: 128, border: '#facc15' });
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.set(22, 11, 1); s.position.set(n.x, 25, n.z); this.boardLabels.add(s);
    }
    for (const L of LANDMARKS) {
      const t = TX.textTexture(`${L.icon} ${L.name}`, { bg: 'rgba(15,23,42,0.85)', fg: '#fff', w: 768, h: 128 });
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.set(60, 10, 1); s.position.set(L.x, L.h + 20, L.z); this.boardLabels.add(s);
    }
    this.boardLabels.visible = false; this.scene.add(this.boardLabels);
  }

  // ---------------------------------------------------------------- road closures
  closureGroup = new THREE.Group();
  setBlocked(ids: string[]) {
    this.scene.remove(this.closureGroup); this.closureGroup = new THREE.Group(); this.dynSolids = [];
    const cone = new THREE.ConeGeometry(0.3, 0.8, 12); const coneM = new THREE.MeshStandardMaterial({ color: 0xff5a00, emissive: 0xff3300, emissiveIntensity: 0.2 });
    const bT = TX.kerbTexture(); bT.repeat.set(3, 1);
    const barM = new THREE.MeshStandardMaterial({ map: bT, emissive: 0xffffff, emissiveMap: bT, emissiveIntensity: 0.15 });
    const cs = TX.roundSign('closed');
    for (const id of ids) {
      const e = EDGES[id]; const hw = halfWidth(e.type); const s = e.len / 2;
      for (let l = -hw + 0.8; l <= hw - 0.8; l += 1.6) {
        const p = edgePoint(e, s, l); const c = new THREE.Mesh(cone, coneM); c.position.set(p.x, 0.45, p.z); this.closureGroup.add(c);
        const q = edgePoint(e, s - 3, l); const c2 = c.clone(); c2.position.set(q.x, 0.45, q.z); this.closureGroup.add(c2);
        const q2 = edgePoint(e, s + 3, l); const c3 = c.clone(); c3.position.set(q2.x, 0.45, q2.z); this.closureGroup.add(c3);
      }
      const p = edgePoint(e, s, 0);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(e.horizontal ? 0.3 : hw * 2, 1, e.horizontal ? hw * 2 : 0.3), barM); bar.position.set(p.x, 1, p.z); bar.castShadow = true; this.closureGroup.add(bar);
      for (const sd of [-1, 1]) {
        const sp = edgePoint(e, s + sd * 5, 0); const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshStandardMaterial({ map: cs, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
        sign.position.set(sp.x, 2, sp.z); sign.rotation.y = Math.atan2(e.dx * sd, e.dz * sd); this.closureGroup.add(sign);
      }
      this.dynSolids.push({ shape: 'box', x: p.x, z: p.z, hw: e.horizontal ? 3.5 : hw, hd: e.horizontal ? hw : 3.5, kind: 'solid' });
    }
    this.scene.add(this.closureGroup);
  }
}

function norm(x: number, z: number): [number, number] { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; }
export { dTo };
