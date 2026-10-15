import * as THREE from 'three';
import * as TX from './textures';

export type VehicleKind = 'moped' | 'moto' | 'tuktuk' | 'car' | 'taxi' | 'pwd' | 'van' | 'mbus' | 'bus' | 'truck' | 'mtruck' | 'artic' | 'coach' | 'plant';
export type EngineTone = 'moped' | 'moto' | 'tuktuk' | 'saloon' | 'matatu' | 'truck' | 'heavy' | 'bus' | 'plant';
export type HornTone = 'beep' | 'car' | 'airhorn';

export interface VehicleSpec {
  id: string;
  cls: string;
  group: string;
  minAge: number;
  name: string;
  category: string;
  desc: string;
  kind: VehicleKind;
  length: number;
  width: number;
  height: number;
  wheelBase: number;
  mass: number;
  accel: number;
  maxSpeed: number;
  brake: number;
  maxSteer: number;
  drag: number;
  color: number;
  gears: number;
  defaultTrans: 'auto' | 'manual';
  idleRpm: number;
  redlineRpm: number;
  engineTone: EngineTone;
  hornTone: HornTone;
}

export const VEHICLES: VehicleSpec[] = [
  // Class A — Motorcycles and Two/Three-Wheelers
  {
    id: 'A1', cls: 'A1', group: 'Class A · Two/Three-Wheelers', minAge: 18,
    name: 'City Moped 50cc', category: 'Moped & Low-Capacity Bike',
    desc: 'Light 50cc step-through moped. Twist-and-go automatic CVT, featherweight & nimble.',
    kind: 'moped', length: 1.75, width: 0.72, height: 1.12, wheelBase: 1.18, mass: 95,
    accel: 2.6, maxSpeed: 65, brake: 7.4, maxSteer: 0.66, drag: 0.0011, color: 0x0ea5e9, gears: 4,
    defaultTrans: 'auto', idleRpm: 1100, redlineRpm: 7500, engineTone: 'moped', hornTone: 'beep',
  },
  {
    id: 'A2', cls: 'A2', group: 'Class A · Two/Three-Wheelers', minAge: 18,
    name: 'Boda Boda Boxer 250cc', category: 'Motorcycle ≤ 400cc',
    desc: 'Standard Kenyan commuter motorcycle up to 400cc. Crisp throttle response, 5-speed gearbox.',
    kind: 'moto', length: 2.05, width: 0.80, height: 1.22, wheelBase: 1.32, mass: 148,
    accel: 3.8, maxSpeed: 115, brake: 7.8, maxSteer: 0.62, drag: 0.00085, color: 0xdc2626, gears: 5,
    defaultTrans: 'manual', idleRpm: 1050, redlineRpm: 8200, engineTone: 'moto', hornTone: 'beep',
  },
  {
    id: 'A3', cls: 'A3', group: 'Class A · Two/Three-Wheelers', minAge: 18,
    name: 'Bajaj Tuk-Tuk Courier', category: 'Three-Wheeler & Courier',
    desc: 'Three-wheeler passenger & urban courier auto-rickshaw. Tight turning circle, lively 200cc single.',
    kind: 'tuktuk', length: 2.65, width: 1.32, height: 1.75, wheelBase: 1.95, mass: 360,
    accel: 2.5, maxSpeed: 72, brake: 6.8, maxSteer: 0.68, drag: 0.00095, color: 0xfacc15, gears: 4,
    defaultTrans: 'manual', idleRpm: 980, redlineRpm: 6800, engineTone: 'tuktuk', hornTone: 'beep',
  },

  // Class B — Light Vehicles
  {
    id: 'B1', cls: 'B1', group: 'Class B · Light Vehicles', minAge: 18,
    name: 'Z-Drive Saloon Auto', category: 'Light Automatic Passenger',
    desc: 'Light automatic passenger saloon (P–R–N–D–M). Smooth torque-converter launch — ideal starter car.',
    kind: 'car', length: 4.42, width: 1.78, height: 1.45, wheelBase: 2.60, mass: 1240,
    accel: 3.1, maxSpeed: 150, brake: 8.4, maxSteer: 0.60, drag: 0.00042, color: 0xf8fafc, gears: 5,
    defaultTrans: 'auto', idleRpm: 800, redlineRpm: 6400, engineTone: 'saloon', hornTone: 'car',
  },
  {
    id: 'B2', cls: 'B2', group: 'Class B · Light Vehicles', minAge: 18,
    name: 'Z-Drive Saloon Manual', category: 'Light Manual Passenger',
    desc: 'Light manual passenger saloon with clutch pedal (Q / Q+Shift bite point) & 5-speed H-pattern gearbox.',
    kind: 'car', length: 4.45, width: 1.78, height: 1.45, wheelBase: 2.62, mass: 1210,
    accel: 3.3, maxSpeed: 158, brake: 8.5, maxSteer: 0.60, drag: 0.00040, color: 0x38bdf8, gears: 5,
    defaultTrans: 'manual', idleRpm: 820, redlineRpm: 6600, engineTone: 'saloon', hornTone: 'car',
  },
  {
    id: 'B3', cls: 'B3', group: 'Class B · Light Vehicles', minAge: 20,
    name: 'Nairobi VIP Taxi Cab', category: 'Professional Taxi / Ride-Hail',
    desc: 'Professional endorsement for taxis & Uber/Bolt cabs. Tuned suspension for smooth passenger rides.',
    kind: 'taxi', length: 4.58, width: 1.80, height: 1.48, wheelBase: 2.68, mass: 1340,
    accel: 3.2, maxSpeed: 155, brake: 8.6, maxSteer: 0.59, drag: 0.00041, color: 0xf59e0b, gears: 6,
    defaultTrans: 'auto', idleRpm: 780, redlineRpm: 6300, engineTone: 'saloon', hornTone: 'car',
  },

  // Class C — Commercial Trucks and Lorries
  {
    id: 'C1', cls: 'C1', group: 'Class C · Commercial Trucks', minAge: 22,
    name: 'Canter 5.5t Box Truck', category: 'Light Truck (3,500–7,500 kg)',
    desc: 'Light commercial truck (5,500 kg GVW). High-torque 4-cylinder turbo-diesel, 5-speed manual.',
    kind: 'truck', length: 6.20, width: 2.12, height: 2.75, wheelBase: 3.40, mass: 5500,
    accel: 2.0, maxSpeed: 105, brake: 6.4, maxSteer: 0.55, drag: 0.00068, color: 0x2563eb, gears: 5,
    defaultTrans: 'manual', idleRpm: 680, redlineRpm: 4200, engineTone: 'truck', hornTone: 'airhorn',
  },
  {
    id: 'C', cls: 'C', group: 'Class C · Commercial Trucks', minAge: 24,
    name: 'Isuzu FVR 14t Heavy Lorry', category: 'Medium/Heavy Truck (>7,500 kg)',
    desc: 'Heavy rigid freight lorry (14,000 kg GVW). Deep turbo-diesel rumble, air brakes & wide swing.',
    kind: 'mtruck', length: 8.80, width: 2.48, height: 3.40, wheelBase: 5.00, mass: 14000,
    accel: 1.4, maxSpeed: 92, brake: 5.4, maxSteer: 0.51, drag: 0.00088, color: 0xea580c, gears: 6,
    defaultTrans: 'manual', idleRpm: 620, redlineRpm: 3600, engineTone: 'heavy', hornTone: 'airhorn',
  },
  {
    id: 'CE', cls: 'CE', group: 'Class C · Commercial Trucks', minAge: 28,
    name: 'Prime Mover + 40ft Trailer', category: 'Articulated Heavy Truck (28t)',
    desc: 'Heavy articulated prime-mover with container semi-trailer. Demands wide roundabout lane planning.',
    kind: 'artic', length: 13.40, width: 2.55, height: 3.75, wheelBase: 7.40, mass: 26000,
    accel: 1.05, maxSpeed: 85, brake: 4.8, maxSteer: 0.48, drag: 0.00105, color: 0x991b1b, gears: 6,
    defaultTrans: 'manual', idleRpm: 580, redlineRpm: 3200, engineTone: 'heavy', hornTone: 'airhorn',
  },

  // Class D — Passenger Service Vehicles (PSV)
  {
    id: 'D1', cls: 'D1', group: 'Class D · PSV Passenger', minAge: 22,
    name: 'Nganya 14-Seater Matatu', category: 'Small PSV (14-Seater)',
    desc: 'Iconic Kenyan 14-seater PSV van. Lively turbo-diesel — passengers judge every brake application.',
    kind: 'van', length: 5.30, width: 1.90, height: 2.22, wheelBase: 3.10, mass: 2650,
    accel: 2.5, maxSpeed: 115, brake: 7.2, maxSteer: 0.56, drag: 0.00058, color: 0xffffff, gears: 5,
    defaultTrans: 'manual', idleRpm: 760, redlineRpm: 5200, engineTone: 'matatu', hornTone: 'car',
  },
  {
    id: 'D2', cls: 'D2', group: 'Class D · PSV Passenger', minAge: 22,
    name: 'Coaster 26-Seater Shuttle', category: 'Medium PSV (26-Seater)',
    desc: 'Medium 26-seater SACCO minibus/coaster. Balanced wheelbase with smooth air-assisted brakes.',
    kind: 'mbus', length: 7.60, width: 2.22, height: 2.85, wheelBase: 4.20, mass: 6200,
    accel: 1.75, maxSpeed: 100, brake: 6.0, maxSteer: 0.54, drag: 0.00078, color: 0x0d9488, gears: 5,
    defaultTrans: 'manual', idleRpm: 680, redlineRpm: 4400, engineTone: 'bus', hornTone: 'airhorn',
  },
  {
    id: 'D3', cls: 'D3', group: 'Class D · PSV Passenger', minAge: 24,
    name: 'Metro 62-Seater City Bus', category: 'Large PSV Bus (45+ Seats)',
    desc: 'Full-size 62-seater commuter bus. Long overhang — use inner roundabout lanes with precision.',
    kind: 'bus', length: 11.50, width: 2.50, height: 3.32, wheelBase: 6.00, mass: 12500,
    accel: 1.2, maxSpeed: 88, brake: 5.1, maxSteer: 0.54, drag: 0.00095, color: 0x16a34a, gears: 6,
    defaultTrans: 'auto', idleRpm: 620, redlineRpm: 3600, engineTone: 'bus', hornTone: 'airhorn',
  },

  // Class E — Special Professional Driving License
  {
    id: 'E', cls: 'E', group: 'Class E · Special Professional', minAge: 21,
    name: 'Executive Intercounty Coach', category: 'Special Multi-Category Pro',
    desc: 'Combined professional endorsement heavy high-deck touring coach with twin rear axles.',
    kind: 'coach', length: 12.20, width: 2.52, height: 3.62, wheelBase: 6.40, mass: 14500,
    accel: 1.45, maxSpeed: 108, brake: 5.6, maxSteer: 0.53, drag: 0.00082, color: 0x7c3aed, gears: 6,
    defaultTrans: 'manual', idleRpm: 600, redlineRpm: 3800, engineTone: 'bus', hornTone: 'airhorn',
  },

  // Class F — Persons with Disability (PWD)
  {
    id: 'F', cls: 'F', group: 'Class F · PWD Adapted', minAge: 18,
    name: 'Z-Drive PWD Hand-Control', category: 'PWD Adapted Vehicle',
    desc: 'Specially adapted automatic vehicle with ergonomic hand-throttle/brake lever & steering spinner.',
    kind: 'pwd', length: 4.38, width: 1.78, height: 1.48, wheelBase: 2.58, mass: 1260,
    accel: 3.0, maxSpeed: 140, brake: 8.8, maxSteer: 0.62, drag: 0.00042, color: 0x06b6d4, gears: 5,
    defaultTrans: 'auto', idleRpm: 800, redlineRpm: 6200, engineTone: 'saloon', hornTone: 'car',
  },

  // Class G — Plant Operators
  {
    id: 'G', cls: 'G', group: 'Class G · Plant Machinery', minAge: 18,
    name: 'JCB 4CX Backhoe Loader', category: 'Industrial & Plant Machinery',
    desc: 'Heavy construction loader/tractor with front hydraulic bucket, massive rear tires & torque converter.',
    kind: 'plant', length: 5.60, width: 2.35, height: 2.95, wheelBase: 2.45, mass: 8400,
    accel: 2.2, maxSpeed: 52, brake: 7.5, maxSteer: 0.64, drag: 0.0015, color: 0xeab308, gears: 4,
    defaultTrans: 'auto', idleRpm: 720, redlineRpm: 2800, engineTone: 'plant', hornTone: 'airhorn',
  },
];

export interface VehicleRig {
  root: THREE.Group;
  body: THREE.Group;
  wheels: { pivot: THREE.Object3D; spin: THREE.Object3D; front: boolean; r: number }[];
  brakeMat: THREE.MeshStandardMaterial;
  headMat: THREE.MeshStandardMaterial;
  indL: THREE.MeshStandardMaterial;
  indR: THREE.MeshStandardMaterial;
  revMat: THREE.MeshStandardMaterial;
  cockpit: THREE.Vector3;
  hood: THREE.Vector3;
  steering?: THREE.Object3D;
  wipers: THREE.Object3D[];
  headlightCones: THREE.Object3D[];
  indHalosL: THREE.Object3D[];
  indHalosR: THREE.Object3D[];
}

const shared = {
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0b1220, metalness: 0.2, roughness: 0.05, transmission: 0, opacity: 0.82, transparent: true, clearcoat: 1 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xcfd4da, metalness: 0.9, roughness: 0.25 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 1, roughness: 0.15 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 0.6 }),
  interior: new THREE.MeshStandardMaterial({ color: 0x1f2226, roughness: 0.8 }),
  skin: new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.65 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.75 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.55 }),
  shirt: new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.8 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, metalness: 0.2 }),
};
let lplate: THREE.Texture | null = null;
let haloTex: THREE.Texture | null = null;

function getHaloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,200,80,0.85)');
  gr.addColorStop(1, 'rgba(255,140,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}

const profileCache = new Map<string, THREE.BufferGeometry>();
function profile(pts: [number, number][], width: number, mat: THREE.Material, bevel = 0.06) {
  const key = JSON.stringify(pts) + '|' + width + '|' + bevel;
  let g = profileCache.get(key);
  if (!g) {
    try {
      const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
      const eg = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, width - bevel * 2), bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
      eg.translate(0, 0, -(width - bevel * 2) / 2); eg.rotateY(-Math.PI / 2);
      const pos = eg.attributes.position as THREE.BufferAttribute | undefined;
      if (!pos || pos.count === 0 || Number.isNaN(pos.getX(0))) throw new Error('empty extrusion');
      g = eg;
    } catch {
      let z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [z, y] of pts) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      g = new THREE.BoxGeometry(width, Math.max(0.05, y1 - y0), Math.max(0.05, z1 - z0)); g.translate(0, (y0 + y1) / 2, (z0 + z1) / 2);
    }
    profileCache.set(key, g);
  }
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}

export function buildVehicleRig(spec: VehicleSpec, opts: { color?: number; learner?: boolean; seed?: number; interior?: boolean; plate?: string; simple?: boolean } = {}): VehicleRig {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const color = opts.color ?? spec.color;
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x660000, emissive: 0xff1111, emissiveIntensity: 0.3 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6d6, emissiveIntensity: 0.3 });
  const indL = new THREE.MeshStandardMaterial({ color: 0x663800, emissive: 0xff9500, emissiveIntensity: 0 });
  const indR = new THREE.MeshStandardMaterial({ color: 0x663800, emissive: 0xff9500, emissiveIntensity: 0 });
  const revMat = new THREE.MeshStandardMaterial({ color: 0x888888, emissive: 0xffffff, emissiveIntensity: 0 });

  const L = spec.length, W = spec.width, H = spec.height;
  const wheels: VehicleRig['wheels'] = [];
  const wipers: THREE.Object3D[] = [];
  const headlightCones: THREE.Object3D[] = [];
  const indHalosL: THREE.Object3D[] = [];
  const indHalosR: THREE.Object3D[] = [];

  const isTwoWheeler = spec.kind === 'moped' || spec.kind === 'moto';
  const isThreeWheeler = spec.kind === 'tuktuk';
  const wr = spec.kind === 'moped' ? 0.27 : spec.kind === 'moto' ? 0.33 : spec.kind === 'tuktuk' ? 0.26 : (spec.kind === 'car' || spec.kind === 'taxi' || spec.kind === 'pwd') ? 0.33 : spec.kind === 'van' ? 0.36 : 0.50;

  const addWheel = (x: number, z: number, front: boolean, r = wr, w = 0.26) => {
    const pivot = new THREE.Group(); pivot.position.set(x, r, z);
    const spin = new THREE.Group(); pivot.add(spin);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, opts.simple ? 12 : 22), shared.tire); tire.rotation.z = Math.PI / 2; tire.castShadow = !opts.simple; spin.add(tire);
    if (opts.simple) { root.add(pivot); wheels.push({ pivot, spin, front, r }); return; }
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 10), shared.rim); rim.rotation.z = Math.PI / 2; spin.add(rim);
    const hub = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, r * 0.18, r * 1.1), shared.black); spin.add(hub);
    root.add(pivot); wheels.push({ pivot, spin, front, r });
  };

  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = !opts.simple; m.receiveShadow = !opts.simple; parent.add(m); return m;
  };

  const addIndHalo = (x: number, y: number, z: number, isLeft: boolean) => {
    if (opts.simple) return;
    const mat = new THREE.SpriteMaterial({
      map: getHaloTexture(),
      color: 0xffa000,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(0.85, 0.85, 0.85);
    sp.position.set(x, y, z);
    sp.visible = false;
    body.add(sp);
    if (isLeft) indHalosL.push(sp); else indHalosR.push(sp);
  };

  const addHeadlightCone = (x: number, y: number, z: number) => {
    if (opts.simple) return;
    const coneGeo = new THREE.ConeGeometry(0.65, 3.2, 14, 1, true);
    coneGeo.translate(0, -1.6, 0);
    coneGeo.rotateX(-Math.PI / 2);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff5cc,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(x, y, z + 0.05);
    cone.visible = false;
    body.add(cone);
    headlightCones.push(cone);
  };

  const lamps = (frontZ: number, rearZ: number, y: number, hw: number) => {
    if (opts.simple) {
      box(hw * 1.6, 0.12, 0.05, headMat, 0, y, frontZ);
      box(hw * 1.6, 0.12, 0.05, brakeMat, 0, y, rearZ);
      return;
    }
    // Headlights (Left = +x, Right = -x)
    box(0.42, 0.16, 0.07, headMat, hw - 0.30, y, frontZ);
    box(0.42, 0.16, 0.07, headMat, -hw + 0.30, y, frontZ);
    addHeadlightCone(hw - 0.30, y, frontZ);
    addHeadlightCone(-hw + 0.30, y, frontZ);

    // Taillights / Brake lights
    box(0.40, 0.16, 0.07, brakeMat, hw - 0.28, y, rearZ);
    box(0.40, 0.16, 0.07, brakeMat, -hw + 0.28, y, rearZ);

    // Prominent Front + Rear + Side-Repeater Indicators
    // Front Left (+x) & Front Right (-x)
    box(0.22, 0.14, 0.09, indL, hw - 0.06, y - 0.14, frontZ + 0.01);
    box(0.22, 0.14, 0.09, indR, -hw + 0.06, y - 0.14, frontZ + 0.01);
    addIndHalo(hw + 0.04, y - 0.12, frontZ + 0.08, true);
    addIndHalo(-hw - 0.04, y - 0.12, frontZ + 0.08, false);

    // Rear Left (+x) & Rear Right (-x)
    box(0.22, 0.14, 0.09, indL, hw - 0.06, y + 0.15, rearZ - 0.01);
    box(0.22, 0.14, 0.09, indR, -hw + 0.06, y + 0.15, rearZ - 0.01);
    addIndHalo(hw + 0.04, y + 0.15, rearZ - 0.08, true);
    addIndHalo(-hw - 0.04, y + 0.15, rearZ - 0.08, false);

    // Side fender/mirror repeaters so indicators are visible from the side & hood view
    box(0.06, 0.08, 0.18, indL, hw + 0.02, y + 0.18, frontZ * 0.45);
    box(0.06, 0.08, 0.18, indR, -hw - 0.02, y + 0.18, frontZ * 0.45);
    addIndHalo(hw + 0.08, y + 0.18, frontZ * 0.45, true);
    addIndHalo(-hw - 0.08, y + 0.18, frontZ * 0.45, false);

    // Reverse lamps
    box(0.22, 0.09, 0.07, revMat, 0, y - 0.02, rearZ);

    const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.13), new THREE.MeshStandardMaterial({ map: TX.numberPlate(opts.plate ?? `KDG ${100 + (opts.seed ?? 4) % 899}Z`) }));
    pf.position.set(0, y - 0.22, frontZ + 0.045); body.add(pf);
    const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.13), new THREE.MeshStandardMaterial({ map: TX.numberPlate(opts.plate ?? `KDG ${100 + (opts.seed ?? 4) % 899}Z`, true) }));
    pr.position.set(0, y - 0.22, rearZ - 0.045); pr.rotation.y = Math.PI; body.add(pr);
  };

  const addWipers = (windshieldZ: number, windshieldY: number, spanW: number, tiltX: number) => {
    if (opts.simple) return;
    for (const ox of [-spanW * 0.26, spanW * 0.22]) {
      const pivot = new THREE.Group();
      pivot.position.set(ox, windshieldY, windshieldZ);
      pivot.rotation.x = tiltX;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.42, 0.02), shared.black);
      arm.position.set(0, 0.21, 0.01);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.36, 0.015), shared.black);
      blade.position.set(0.015, 0.26, 0.015);
      pivot.add(arm, blade);
      body.add(pivot);
      wipers.push(pivot);
    }
  };

  // NOTE: +x of the vehicle is its LEFT side (vehicle faces +z). Driver sits on RIGHT (-x) in Kenya.
  let cockpit: THREE.Vector3;
  let hood: THREE.Vector3;

  if (spec.kind === 'car' || spec.kind === 'taxi' || spec.kind === 'pwd') {
    const lower = profile([[-L / 2, 0.3], [L / 2, 0.3], [L / 2 + 0.02, 0.62], [L / 2 - 0.25, 0.8], [L * 0.2, 0.9], [-L * 0.3, 0.92], [-L / 2 + 0.1, 0.85], [-L / 2 - 0.02, 0.55]], W, paint, 0.08);
    body.add(lower);
    const cabin = profile([[L * 0.2, 0.88], [L * 0.02, 1.36], [-L * 0.2, 1.4], [-L * 0.38, 0.9]], W * 0.86, shared.glass, 0.05);
    body.add(cabin);
    box(W * 0.8, 0.05, L * 0.2, paint, 0, 1.44, -L * 0.09);
    box(W * 1.01, 0.1, 0.25, shared.black, 0, 0.36, L / 2 - 0.05);
    box(W * 1.01, 0.12, 0.25, shared.black, 0, 0.36, -L / 2 + 0.05);
    box(W * 0.5, 0.1, 0.06, shared.chrome, 0, 0.62, L / 2 + 0.03);
    // Side mirrors with integrated indicator repeaters
    box(0.22, 0.12, 0.1, paint, W / 2 + 0.1, 1.0, L * 0.16);
    box(0.22, 0.12, 0.1, paint, -W / 2 - 0.1, 1.0, L * 0.16);
    box(0.08, 0.05, 0.11, indL, W / 2 + 0.18, 1.0, L * 0.16);
    box(0.08, 0.05, 0.11, indR, -W / 2 - 0.18, 1.0, L * 0.16);

    if (spec.kind === 'taxi') {
      // Yellow taxi side stripe + glowing TAXI roof sign
      box(W + 0.03, 0.10, L * 0.82, shared.yellow, 0, 0.68, 0);
      const t = TX.textTexture('TAXI · B3', { bg: '#facc15', fg: '#0f172a', w: 256, h: 96 });
      const sm = new THREE.MeshStandardMaterial({ map: t, emissive: 0xfacc15, emissiveMap: t, emissiveIntensity: 0.6 });
      box(0.65, 0.20, 0.24, sm, 0, 1.56, -0.1);
    }
    if (spec.kind === 'pwd') {
      const t = TX.textTexture('♿ CLASS F · PWD', { bg: '#0284c7', fg: '#ffffff', w: 256, h: 96 });
      const sm = new THREE.MeshStandardMaterial({ map: t, emissive: 0x38bdf8, emissiveMap: t, emissiveIntensity: 0.4 });
      box(0.72, 0.18, 0.22, sm, 0, 1.55, -0.1);
    }

    lamps(L / 2 + 0.01, -L / 2 - 0.01, 0.68, W / 2);
    addWipers(L * 0.19, 0.92, W * 0.78, -0.68);
    const wb = spec.wheelBase / 2;
    addWheel(W / 2 - 0.12, wb, true); addWheel(-W / 2 + 0.12, wb, true);
    addWheel(W / 2 - 0.12, -wb, false); addWheel(-W / 2 + 0.12, -wb, false);
    cockpit = new THREE.Vector3(-W * 0.22, 1.18, -0.15);
    hood = new THREE.Vector3(0, 1.25, 0.6);
  } else if (spec.kind === 'van' || spec.kind === 'mbus') {
    const livery = new THREE.MeshPhysicalMaterial({ map: TX.matatuLivery(opts.seed ?? (spec.kind === 'mbus' ? 2 : 1)), clearcoat: 1, roughness: 0.3, metalness: 0.3 });
    const shell = profile([[-L / 2, 0.35], [L / 2, 0.35], [L / 2 + 0.02, 0.9], [L / 2 - 0.5, 1.35], [L / 2 - 0.9, H], [-L / 2, H], [-L / 2 - 0.02, 0.5]], W, paint, 0.08);
    body.add(shell);
    const band = box(W + 0.02, 0.55, L * 0.78, livery, 0, 0.82, -L * 0.08); band.castShadow = false;
    box(W + 0.03, 0.60, L * 0.68, shared.glass, 0, H - 0.48, -L * 0.10);
    const ws = profile([[L / 2 - 0.48, 1.32], [L / 2 - 0.88, H - 0.08], [L / 2 - 1.0, H - 0.08], [L / 2 - 0.62, 1.3]], W * 0.9, shared.glass, 0.03); body.add(ws);
    lamps(L / 2 + 0.01, -L / 2 - 0.01, 0.8, W / 2);
    addWipers(L / 2 - 0.52, 1.36, W * 0.8, -0.52);
    box(W * 0.9, 0.12, L * 0.6, shared.black, 0, H + 0.08, -L * 0.1);
    const wb = spec.wheelBase / 2;
    addWheel(W / 2 - 0.14, wb, true); addWheel(-W / 2 + 0.14, wb, true);
    addWheel(W / 2 - 0.14, -wb, false); addWheel(-W / 2 + 0.14, -wb, false);
    cockpit = new THREE.Vector3(-W * 0.24, H * 0.78, L / 2 - 1.35);
    hood = new THREE.Vector3(0, H * 0.82, L / 2 - 0.4);
  } else if (spec.kind === 'truck' || spec.kind === 'mtruck' || spec.kind === 'artic') {
    const cabL = spec.kind === 'truck' ? 1.85 : 2.25;
    const cab = profile([[L / 2 - cabL, 0.5], [L / 2, 0.5], [L / 2 + 0.02, 1.4], [L / 2 - 0.15, H * 0.90], [L / 2 - cabL, H * 0.90]], W, paint, 0.08);
    body.add(cab);
    const ws = profile([[L / 2 - 0.05, 1.45], [L / 2 - 0.18, H * 0.86], [L / 2 - 0.4, H * 0.86], [L / 2 - 0.3, 1.45]], W * 0.9, shared.glass, 0.02); body.add(ws);
    box(W + 0.02, 0.5, cabL * 0.55, shared.glass, 0, H * 0.70, L / 2 - cabL / 2 - 0.1);
    const cargoColor = spec.kind === 'artic' ? 0x1e3a8a : spec.kind === 'truck' ? 0xe5e7eb : 0x94a3b8;
    const cargoMat = new THREE.MeshStandardMaterial({ color: cargoColor, roughness: 0.55, metalness: 0.25 });
    const gap = spec.kind === 'artic' ? 0.65 : 0.22;
    const cL = L - cabL - gap;
    box(W + 0.06, H - 0.72, cL, cargoMat, 0, 0.72 + (H - 0.72) / 2, -L / 2 + cL / 2);
    if (spec.kind === 'artic') {
      const ct = TX.textTexture('ZINGTRIXX LOGISTICS · CE 28T', { bg: '#1e3a8a', fg: '#facc15', w: 512, h: 128 });
      const sideSign = new THREE.Mesh(new THREE.PlaneGeometry(cL * 0.75, 1.1), new THREE.MeshStandardMaterial({ map: ct }));
      sideSign.position.set(W / 2 + 0.04, 2.2, -L / 2 + cL / 2); sideSign.rotation.y = Math.PI / 2; body.add(sideSign);
      const sideSignR = sideSign.clone(); sideSignR.position.x = -W / 2 - 0.04; sideSignR.rotation.y = -Math.PI / 2; body.add(sideSignR);
    }
    box(W * 0.9, 0.25, L, shared.black, 0, 0.55, 0);
    lamps(L / 2 + 0.01, -L / 2 - 0.01, 0.9, W / 2);
    addWipers(L / 2 - 0.08, 1.50, W * 0.82, -0.2);
    const zF = L / 2 - cabL * 0.55;
    addWheel(W / 2 - 0.2, zF, true); addWheel(-W / 2 + 0.2, zF, true);
    addWheel(W / 2 - 0.2, zF - 3.4, false, wr, 0.45); addWheel(-W / 2 + 0.2, zF - 3.4, false, wr, 0.45);
    if (spec.kind !== 'truck') {
      addWheel(W / 2 - 0.2, -L / 2 + 1.8, false, wr, 0.45); addWheel(-W / 2 + 0.2, -L / 2 + 1.8, false, wr, 0.45);
    }
    if (spec.kind === 'artic') {
      addWheel(W / 2 - 0.2, -L / 2 + 3.1, false, wr, 0.45); addWheel(-W / 2 + 0.2, -L / 2 + 3.1, false, wr, 0.45);
    }
    cockpit = new THREE.Vector3(-W * 0.25, H * 0.72, L / 2 - cabL * 0.52);
    hood = new THREE.Vector3(0, H * 0.78, L / 2 - 0.15);
  } else if (spec.kind === 'bus' || spec.kind === 'coach') {
    const shell = profile([[-L / 2, 0.4], [L / 2, 0.4], [L / 2 + 0.03, H - 0.2], [L / 2 - 0.2, H], [-L / 2 + 0.2, H], [-L / 2, H - 0.25]], W, paint, 0.1);
    body.add(shell);
    box(W + 0.04, 1.05, L * 0.86, shared.glass, 0, H - 1.0, -L * 0.04);
    box(W * 0.94, 1.5, 0.05, shared.glass, 0, H - 1.05, L / 2 + 0.06);
    box(W + 0.03, 0.18, L * 0.98, new THREE.MeshStandardMaterial({ color: spec.kind === 'coach' ? 0xf59e0b : 0xfacc15 }), 0, 1.25, 0);
    const dest = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.7, 0.3),
      new THREE.MeshStandardMaterial({ map: TX.textTexture(spec.kind === 'coach' ? 'NAIROBI EXPRESS · CLASS E' : 'CBD · KENYATTA AVE', { bg: '#111', fg: '#fb923c', w: 512, h: 96 }), emissive: 0xffffff, emissiveIntensity: 0.4 }),
    );
    dest.position.set(0, H - 0.25, L / 2 + 0.08); body.add(dest);
    lamps(L / 2 + 0.02, -L / 2 - 0.02, 0.8, W / 2);
    addWipers(L / 2 + 0.05, H - 1.65, W * 0.84, -0.1);
    const zF = L / 2 - 2.0;
    addWheel(W / 2 - 0.2, zF, true); addWheel(-W / 2 + 0.2, zF, true);
    addWheel(W / 2 - 0.2, zF - spec.wheelBase, false, wr, 0.45); addWheel(-W / 2 + 0.2, zF - spec.wheelBase, false, wr, 0.45);
    if (spec.kind === 'coach') {
      addWheel(W / 2 - 0.2, zF - spec.wheelBase - 1.3, false, wr, 0.45);
      addWheel(-W / 2 + 0.2, zF - spec.wheelBase - 1.3, false, wr, 0.45);
    }
    cockpit = new THREE.Vector3(-W * 0.25, 2.28, L / 2 - 0.88);
    hood = new THREE.Vector3(0, 2.55, L / 2 + 0.3);
  } else if (spec.kind === 'plant') {
    // Class G — Industrial Backhoe Loader / Tractor
    box(W * 0.72, 0.95, L * 0.52, paint, 0, 1.05, 0.35); // engine hood
    box(W * 0.68, 1.45, L * 0.36, shared.glass, 0, 1.95, -0.55); // glass ROPS cab
    box(W * 0.74, 0.12, L * 0.40, paint, 0, 2.72, -0.55); // cab roof
    // Front loader arms + steel bucket
    const armMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.5, roughness: 0.4 });
    box(0.14, 0.22, 1.8, armMat, W * 0.38, 1.1, L * 0.28);
    box(0.14, 0.22, 1.8, armMat, -W * 0.38, 1.1, L * 0.28);
    box(W * 0.96, 0.55, 0.65, shared.black, 0, 0.55, L / 2 - 0.15); // front bucket
    // Amber rotating roof beacon
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xff8800, emissiveIntensity: 2.2 }));
    beacon.position.set(0, 2.88, -0.55); body.add(beacon);
    lamps(L / 2 - 0.55, -L / 2 + 0.35, 1.15, W * 0.44);
    addWipers(0.05, 1.55, W * 0.55, -0.15);
    addWheel(W / 2 - 0.18, 1.05, true, 0.44, 0.34);
    addWheel(-W / 2 + 0.18, 1.05, true, 0.44, 0.34);
    addWheel(W / 2 - 0.22, -1.15, false, 0.72, 0.52);
    addWheel(-W / 2 + 0.22, -1.15, false, 0.72, 0.52);
    cockpit = new THREE.Vector3(0, 2.15, -0.50);
    hood = new THREE.Vector3(0, 1.75, 0.85);
  } else if (isThreeWheeler) {
    // Class A3 — Tuk-Tuk 3-Wheeler
    box(W * 0.92, 0.65, L * 0.75, paint, 0, 0.65, -0.15);
    box(W * 0.94, 0.08, L * 0.80, shared.black, 0, H, -0.10); // canopy roof
    box(W * 0.86, 0.58, 0.06, shared.glass, 0, 1.25, L * 0.28); // front windshield
    box(0.65, 0.05, 0.05, shared.chrome, 0, 1.02, L * 0.22); // handlebar
    lamps(L / 2 - 0.05, -L / 2 + 0.05, 0.72, W * 0.44);
    addWipers(L * 0.29, 1.05, W * 0.5, -0.1);
    addWheel(0, L * 0.36, true, 0.26, 0.16); // single front wheel!
    addWheel(W / 2 - 0.12, -L * 0.32, false, 0.27, 0.18);
    addWheel(-W / 2 + 0.12, -L * 0.32, false, 0.27, 0.18);
    cockpit = new THREE.Vector3(0, 1.38, 0.02);
    hood = new THREE.Vector3(0, 1.32, 0.48);
  } else {
    // Class A1 Moped & Class A2 Motorcycle
    box(0.26, 0.34, 1.15, paint, 0, 0.60, 0.05);
    box(0.32, 0.18, 0.68, shared.black, 0, 0.86, -0.24);
    box(0.34, 0.26, 0.48, paint, 0, 0.88, 0.32);
    // Handlebar + grips + mirrors
    const hb = new THREE.Group(); hb.position.set(0, 1.10, 0.58);
    box(0.72, 0.045, 0.045, shared.chrome, 0, 0, 0, hb);
    // Rider hands on handlebar grips!
    box(0.11, 0.09, 0.12, shared.glove, 0.31, 0.01, -0.02, hb);
    box(0.11, 0.09, 0.12, shared.glove, -0.31, 0.01, -0.02, hb);
    box(0.09, 0.09, 0.38, shared.sleeve, 0.28, -0.06, -0.22, hb);
    box(0.09, 0.09, 0.38, shared.sleeve, -0.28, -0.06, -0.22, hb);
    body.add(hb);

    const fork = box(0.08, 0.68, 0.08, shared.chrome, 0, 0.60, 0.68); fork.rotation.x = -0.35;
    box(0.22, 0.18, 0.12, headMat, 0, 0.98, 0.76);
    addHeadlightCone(0, 0.98, 0.78);
    box(0.18, 0.12, 0.06, brakeMat, 0, 0.80, -0.92);
    // Bright bike indicators + halos
    box(0.12, 0.08, 0.08, indL, 0.26, 0.98, 0.72);
    box(0.12, 0.08, 0.08, indR, -0.26, 0.98, 0.72);
    box(0.12, 0.08, 0.08, indL, 0.20, 0.82, -0.92);
    box(0.12, 0.08, 0.08, indR, -0.20, 0.82, -0.92);
    addIndHalo(0.28, 0.98, 0.74, true);
    addIndHalo(-0.28, 0.98, 0.74, false);
    addIndHalo(0.22, 0.82, -0.94, true);
    addIndHalo(-0.22, 0.82, -0.94, false);
    box(0.06, 0.06, 0.06, revMat, 0, 0.70, -0.94);

    if (!opts.interior) {
      const vest = new THREE.MeshStandardMaterial({ color: 0xd9f99d, emissive: 0x84cc16, emissiveIntensity: 0.15 });
      box(0.40, 0.52, 0.26, vest, 0, 1.28, -0.15);
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.3, roughness: 0.2 }));
      helmet.position.set(0, 1.70, -0.08); helmet.castShadow = true; body.add(helmet);
    }
    addWheel(0, 0.64, true, wr, 0.12);
    addWheel(0, -0.60, false, wr, 0.14);
    cockpit = new THREE.Vector3(0, 1.62, -0.02);
    hood = new THREE.Vector3(0, 1.48, 0.45);
  }

  // External driver figure when in 3rd-person view
  if (!isTwoWheeler && !opts.interior && !opts.simple) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), shared.skin);
    head.position.set(cockpit.x, cockpit.y - 0.05, cockpit.z); body.add(head);
    box(0.4, 0.4, 0.25, shared.shirt, cockpit.x, cockpit.y - 0.42, cockpit.z - 0.05);
  }

  // Learner L-plates & Z-Drive roof sign
  if (opts.learner) {
    if (!lplate) lplate = TX.learnerPlate();
    const lm = new THREE.MeshStandardMaterial({ map: lplate });
    const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), lm);
    const frontZ = isTwoWheeler ? 0.82 : L / 2 + 0.05;
    const rearZ = isTwoWheeler ? -0.96 : -L / 2 - 0.05;
    pf.position.set(isTwoWheeler ? 0 : W * 0.3, isTwoWheeler ? 0.68 : 0.55, frontZ); body.add(pf);
    const pr = pf.clone(); pr.position.set(isTwoWheeler ? 0 : -W * 0.3, isTwoWheeler ? 1.02 : 0.95, rearZ); pr.rotation.y = Math.PI; body.add(pr);
    if (spec.kind === 'car') {
      const t = TX.textTexture('Z-DRIVE', { bg: '#facc15', fg: '#0f172a', w: 512, h: 128, sub: 'INSTRUCTOR: ZINGRI_MASTER' });
      const sm = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35 });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.25, 0.26), [shared.black, shared.black, sm, sm, sm, sm]);
      sign.position.set(0, 1.58, -L * 0.1); body.add(sign);
    }
  }

  // Cockpit interior with Steering Wheel + Driver Hands on the Wheel + Dashboard Indicator Lamps
  let steering: THREE.Object3D | undefined;
  if (opts.interior && !isTwoWheeler) {
    const dashZ = cockpit.z + 0.65;
    box(W * 0.92, 0.25, 0.42, shared.interior, 0, cockpit.y - 0.38, dashZ);
    // Dashboard indicator lamps right above the steering column so they flash in Cockpit POV!
    box(0.045, 0.035, 0.02, indL, cockpit.x + 0.11, cockpit.y - 0.23, dashZ - 0.16);
    box(0.045, 0.035, 0.02, indR, cockpit.x - 0.11, cockpit.y - 0.23, dashZ - 0.16);

    const sw = new THREE.Group();
    sw.position.set(cockpit.x, cockpit.y - 0.28, dashZ - 0.28);
    sw.rotation.x = -0.35;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.024, 10, 32), shared.black); sw.add(rim);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.032, 0.022), shared.black); sw.add(spoke);
    const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.18, 0.022), shared.black); spoke2.position.y = -0.09; sw.add(spoke2);
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.048, 16), new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.4 }));
    logo.position.z = 0.014; sw.add(logo);

    // Driver Hands & Forearms gripping the steering wheel at 9-and-3 positions!
    for (const side of [-1, 1] as const) {
      const handGroup = new THREE.Group();
      handGroup.position.set(side * 0.185, 0.03, 0);
      // Palm & fingers wrapped around the wheel rim
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), shared.skin);
      palm.scale.set(0.85, 1.15, 0.95);
      handGroup.add(palm);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.035, 4, 6), shared.skin);
      thumb.position.set(-side * 0.028, 0.02, 0.015);
      thumb.rotation.z = side * 0.6;
      handGroup.add(thumb);
      // Cuff + forearm extending back toward driver shoulders
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.046, 0.34, 10), shared.sleeve);
      forearm.position.set(side * 0.04, -0.11, -0.16);
      forearm.rotation.x = 1.05;
      forearm.rotation.z = -side * 0.18;
      handGroup.add(forearm);
      sw.add(handGroup);
    }

    if (spec.kind === 'pwd') {
      // Steering spinner knob + hand-control lever for Class F PWD vehicle
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0x38bdf8 }));
      knob.position.set(0.13, 0.13, 0.03);
      sw.add(knob);
    }

    body.add(sw);
    steering = sw;

    // A-pillars & roof frame + rear-view mirror
    const pil = shared.interior;
    for (const sx of [1, -1]) {
      const p = box(0.07, 0.75, 0.07, pil, sx * W * 0.42, cockpit.y + 0.05, dashZ + 0.05);
      p.rotation.x = -0.5;
    }
    box(W * 0.86, 0.06, 0.12, pil, 0, cockpit.y + 0.36, dashZ - 0.2);
    box(0.28, 0.08, 0.03, shared.black, 0, cockpit.y + 0.26, dashZ - 0.3);
  }

  return { root, body, wheels, brakeMat, headMat, indL, indR, revMat, cockpit, hood, steering, wipers, headlightCones, indHalosL, indHalosR };
}

export function buildVehicleMesh(spec: VehicleSpec, opts: { color?: number; learner?: boolean; seed?: number; simple?: boolean } = {}) {
  return buildVehicleRig(spec, opts).root;
}
