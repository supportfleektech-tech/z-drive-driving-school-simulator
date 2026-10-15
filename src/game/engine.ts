import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { World, type Bay, type TimeOfDay, type WeatherKind } from './world';
import { Traffic, AICar, type Agent } from './traffic';
import { CarPhysics, type Controls, type TransMode, type AutoPos } from './physics';
import { VEHICLES, buildVehicleRig, type VehicleRig, type VehicleSpec } from './vehicles';
import { RuleMonitor, type Offense } from './rules';
import { GameAudio } from './audio';
import {
  NODES, EDGES, ROAD, LANDMARKS, type DEdge, dTo, laneOffset, edgePoint, locate, planMTB, findRoute, describeTurn,
  type PlannedRoute, RB_OUTER, approachControl, halfWidth, getTerrainInfo, EXPEDITION_CHECKPOINTS,
} from './map';

export type CamMode = 'chase' | 'cockpit' | 'hood' | 'board' | 'cinematic';
export const CAM_LABELS: Record<CamMode, string> = {
  chase: 'Chase Cam',
  cockpit: 'Cockpit (Hands on Wheel)',
  hood: 'Bonnet Cam',
  board: 'MTB Board View',
  cinematic: 'Cinematic',
};
export type Mode = 'attract' | 'free' | 'test' | 'challenge';

export interface Settings {
  quality: 'high' | 'low';
  time: TimeOfDay;
  weather: WeatherKind;
  trans: TransMode;
  hints: boolean;
  traffic: number;
  sound: boolean;
}

export interface EndResult {
  mode: Mode;
  title: string;
  passed: boolean;
  score: number;
  offenses: Offense[];
  time: number;
  distance: number;
  stats: string[];
  ruleText?: string;
  vehicleClass: string;
  challengeId?: string;
}

export interface ChallengeDef {
  id: string;
  title: string;
  icon: string;
  desc: string;
  skill: string;
  recommendedClass?: string;
}

export const CHALLENGES: ChallengeDef[] = [
  {
    id: 'expedition',
    title: 'All-in-One Kenya Expedition',
    icon: '🌍',
    desc: 'Sidequest across all 7 terrains in one continuous loop: Thika Highway (100 km/h) → Rift Hill Climb → Aberdare Winding Pass → Off-Road Gravel → Chalbi Desert → Mt. Kenya Snow → Mau Mud Bog!',
    skill: 'Highway · Hills · Winding · Off-road · Desert · Snow · Mud',
    recommendedClass: 'C1',
  },
  {
    id: 'hillstart',
    title: 'Rift Escarpment Hill Start',
    icon: '⛰️',
    desc: 'Stop inside the yellow box on the 11% Rift Escarpment slope, hold with handbrake, balance clutch bite (Q + Left Shift) + gas (W), release handbrake and climb without rolling back!',
    skill: 'Clutch bite (Q + Shift) · Handbrake balance · Zero rollback',
    recommendedClass: 'B2',
  },
  {
    id: 'threepoint',
    title: '3-Point Turn (Narrow Street)',
    icon: '↔️',
    desc: 'Turn your vehicle completely around 180° on Harambee Ave using forward-right, reverse-left, and forward gears without mounting the kerb, then drive back to Junction A.',
    skill: 'Forward · Reverse · Full lock steering · Kerb awareness',
    recommendedClass: 'B2',
  },
  {
    id: 'taxi',
    title: 'VIP Taxi Ride-Hail Run (B3)',
    icon: '🚕',
    desc: 'Pick up a VIP passenger at Hilton Nairobi (Junction D) and drop them at Serena Hotel (Junction E) smoothly. Keep Passenger Comfort ≥ 75%!',
    skill: 'Class B3 · Smooth braking · Indicators · Comfort rating',
    recommendedClass: 'B3',
  },
  {
    id: 'overtake',
    title: 'Yellow Line Overtaking',
    icon: '⚠️',
    desc: 'Overtake the slow heavy lorry on Biashara St ONLY where the yellow centre line is BROKEN, signal right (.) & left (,), then reach Junction L.',
    skill: 'Broken yellow = overtake from right · Continuous = never',
    recommendedClass: 'B1',
  },
  {
    id: 'angle',
    title: 'Angle Parking (P1 Zone)',
    icon: '🅿️',
    desc: 'Enter the controlled one-way angle-parking zone (P1), drive to the FURTHEST free bay and park in FORWARD gear. Apply the handbrake.',
    skill: 'Park forward · furthest end · 10 km/h limit',
    recommendedClass: 'B1',
  },
  {
    id: 'flush',
    title: 'Flush / Parallel Parking (P2)',
    icon: '🚙',
    desc: 'Pull up ahead of the highlighted parallel (flush) bay in P2, then REVERSE neatly into the bay between parked cars. Apply the handbrake.',
    skill: 'Reverse in · Exit forward · Mirror observation',
    recommendedClass: 'B2',
  },
  {
    id: 'roundabout',
    title: 'Roundabout Master (270°)',
    icon: '🔄',
    desc: 'Approach Roundabout 1 from Uhuru Highway in Lane 3, give way to traffic from your right, circulate clockwise and take the 3rd exit (270° right).',
    skill: 'Lane 3 approach · Give way right · Clockwise · Signal (, / .)',
    recommendedClass: 'B1',
  },
  {
    id: 'uturn',
    title: 'Full Circle 360° U-Turn',
    icon: '↩️',
    desc: 'Use Roundabout 2 in the innermost Lane 4 to complete a full 360° circle and exit back onto Uhuru Highway eastbound.',
    skill: 'Innermost Lane 4 only · No lane changes inside ring',
    recommendedClass: 'D1',
  },
  {
    id: 'estop',
    title: 'Emergency Stop Drill',
    icon: '🛑',
    desc: 'Reach 40 km/h on Uhuru Highway. When Chief Instructor zingri_master shouts STOP — brake firmly and straight to a complete halt.',
    skill: 'Reaction time · Controlled emergency braking',
    recommendedClass: 'B1',
  },
  {
    id: 'signals',
    title: 'Traffic Signals & Zebra',
    icon: '🚦',
    desc: 'Drive down Mama Ngina St, yield to pedestrians on the zebra crossing, obey the traffic lights at Junction G, and proceed to Junction L.',
    skill: 'Stop lines · Red/Amber/Green · Pedestrian priority',
    recommendedClass: 'D2',
  },
  {
    id: 'night',
    title: 'Night & Rain Storm Exam',
    icon: '⛈️',
    desc: 'Complete a full NTSA route test from the Test Centre to Kenyatta Hospital at night in a rainstorm. Switch on Headlights (L) and Wipers (Y)!',
    skill: 'Headlights (L) · Wipers (Y) · Wet braking · Full MTB rules',
    recommendedClass: 'B1',
  },
];

export interface Snapshot {
  mode: Mode;
  phase: string;
  kmh: number;
  gear: string;
  rpm: number;
  redlineRpm: number;
  limit: number;
  indicator: number; // 1 = left, -1 = right, 0 = off
  hazard: boolean;
  blinkOn: boolean;
  headlights: boolean;
  wipers: number; // 0 = off, 1 = low, 2 = fast
  horn: boolean;
  seatbelt: boolean;
  engineOn: boolean;
  handbrake: boolean;
  mirrors: boolean;
  cam: CamMode;
  score: number;
  faults: number;
  time: number;
  instruction: string;
  nextDist: number;
  laneInfo: string;
  roadName: string;
  biomeLabel: string;
  slopePct: number;
  gripPct: number;
  x: number;
  z: number;
  heading: number;
  route: string[] | null;
  routeIdx: number;
  dest: string;
  destName: string;
  blocked: string[];
  flash: string;
  challenge: string;
  objective: string;
  signal: { state: string; dist: number } | null;
  paused: boolean;
  ruleText: string;
  vehicle: string;
  vehicleId: string;
  maxGears: number;
  transMode: TransMode;
  autoPos: AutoPos;
  seqGear: number;
  hGear: number;
  clutch: number;
  clutchBiteActive: boolean;
  weather: WeatherKind;
  clockStr: string;
  rainDrops: number; // 0..1 windshield wetness in cockpit
  taxiComfort: number | null;
  startText: string;
  bay: { x: number; z: number } | null;
  aiCars: { x: number; z: number }[];
}

type Listener = {
  offense?: (o: Offense) => void;
  message?: (m: string, kind: string) => void;
  end?: (r: EndResult) => void;
};

export class Engine {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  world: World;
  traffic: Traffic;
  audio = new GameAudio();
  rules = new RuleMonitor();
  clock = new THREE.Clock();
  raf = 0;
  listeners: Listener[] = [];
  mode: Mode = 'attract';
  phase = 'idle';
  paused = false;
  cam: CamMode = 'chase';
  spec: VehicleSpec = VEHICLES[3]; // B1 default
  car: CarPhysics | null = null;
  rig: VehicleRig | null = null;
  spot: THREE.Object3D | null = null;

  keys = new Set<string>();
  touch = { throttle: 0, brake: 0, steer: 0 };
  steerIn = 0;
  throttleIn = 0;
  brakeIn = 0;

  indicator = 0; // 1 = left (,), -1 = right (.), 0 = off
  hazard = false;
  indYaw = 0;
  blinkT = 0;
  lastBlink = false;
  headlights = false;
  wipers = 0; // 0 = off, 1 = normal, 2 = fast
  wiperPhase = 0;
  rainDrops = 0;
  noWiperTimer = 0;
  seatbelt = false;
  mirrors = false;
  handbrakeOn = false;
  horn = false;
  uiHorn = false;
  revBeepT = 0;

  settings: Settings = {
    quality: 'high',
    time: 'day',
    weather: 'clear',
    trans: 'auto',
    hints: true,
    traffic: 18,
    sound: true,
  };

  elapsed = 0;
  route: PlannedRoute | null = null;
  dest = '';
  blockedIds: string[] = [];
  startText = '';
  flash = '';
  flashT = 0;
  challenge: ChallengeDef | null = null;
  objective = '';
  chState: Record<string, number | boolean | string> = {};
  targetBay: Bay | null = null;
  marker = new THREE.Group();
  beacon: THREE.Mesh;
  boardArrow: THREE.Mesh;
  ended = false;
  camPos = new THREE.Vector3();
  camLook = new THREE.Vector3();
  cineT = 0;
  slowTruck: AICar | null = null;
  arrived = false;
  endTimer = -1;
  lookBack = false;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  ready = false;
  errorCount = 0;
  lastError = '';
  onError: (msg: string) => void = () => {};

  constructor(private container: HTMLElement, quality: 'high' | 'low' = 'high') {
    this.settings.quality = quality;
    const r = new THREE.WebGLRenderer({ antialias: quality === 'high', powerPreference: 'high-performance' });
    r.setPixelRatio(quality === 'high' ? Math.min(window.devicePixelRatio, 1.5) : 0.85);
    r.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    this.renderer = r;
    this.camera = new THREE.PerspectiveCamera(60, Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight), 0.1, 5000);
    this.world = new World(r, quality === 'high');
    this.traffic = new Traffic(this.world);
    this.beacon = new THREE.Mesh();
    this.boardArrow = new THREE.Mesh();
  }

  async init(progress: (p: number, label: string) => void) {
    const container = this.container;
    await this.world.build((p, l) => progress(p * 0.85, l));
    this.world.safe('Time of day', () => this.world.setTimeOfDay(this.settings.time));
    this.world.safe('Weather', () => this.world.setWeather(this.settings.weather));
    this.world.sun.castShadow = this.settings.quality === 'high';
    progress(0.88, 'Spawning Nairobi traffic & pedestrians');
    await new Promise(r => setTimeout(r, 20));
    this.world.safe('Traffic', () => this.traffic.spawn(this.settings.traffic, { x: 9999, z: 9999 }));
    progress(0.94, 'Compiling shaders');
    await new Promise(r => setTimeout(r, 20));
    try {
      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.world.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight)), 0.25, 0.5, 0.92);
      composer.addPass(this.bloom);
      composer.addPass(new OutputPass());
      this.composer = composer;
    } catch (e) {
      console.warn('Post-processing unavailable', e);
      this.composer = null;
    }

    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6, 60, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.beacon.visible = false;
    this.world.scene.add(this.beacon);

    this.boardArrow = new THREE.Mesh(new THREE.ConeGeometry(9, 22, 3), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    this.boardArrow.visible = false;
    this.world.scene.add(this.boardArrow);
    this.world.scene.add(this.marker);

    this.rules.onOffense = (o) => {
      this.audio.fault(o.sev);
      this.listeners.forEach(l => l.offense?.(o));
      if (o.sev === 'fail' && (this.mode === 'test' || this.mode === 'challenge') && this.endTimer < 0) {
        this.msg('zingri_master: "Stop the vehicle immediately. That is a serious fault."', 'fail');
        this.endTimer = 2.5;
      }
    };
    this.rules.onArrive = () => {
      if (this.mode === 'test' || (this.mode === 'challenge' && this.challenge?.id === 'night')) {
        this.arrived = true;
        this.msg('zingri_master: "Destination reached! Bring the vehicle to a smooth, complete stop."', 'good');
        this.audio.chime();
      }
    };
    this.rules.onReroute = (from) => {
      if (this.route) {
        const r = planMTB(from, this.dest, new Set(this.blockedIds));
        if (r) {
          this.route = r;
          this.rules.route = r;
          this.rules.routeIdx = 0;
          this.msg('zingri_master: "Wrong route! Re-calculating correct MTB route…"', 'warn');
        }
      }
    };
    this.rules.onNode = (node, out) => this.onChallengeNode(node, out);

    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerdown', this.unlockAudio);
    this.onResize();
    this.attractCam(0);
    try { this.renderer.compile(this.world.scene, this.camera); } catch (e) { console.warn(e); }
    this.ready = true;
    progress(1, 'Ready');
    this.loop();
  }

  unlockAudio = () => {
    this.audio.init();
    this.audio.resume();
  };

  on(l: Listener) {
    this.listeners.push(l);
    return () => { this.listeners = this.listeners.filter(x => x !== l); };
  }
  msg(m: string, kind = 'info') {
    this.listeners.forEach(l => l.message?.(m, kind));
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerdown', this.unlockAudio);
    this.audio.stopAll();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  onResize = () => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  applySettings(s: Partial<Settings>) {
    this.settings = { ...this.settings, ...s };
    if (!this.ready) return;
    this.world.safe('Time of day', () => this.world.setTimeOfDay(this.settings.time));
    this.world.safe('Weather', () => this.world.setWeather(this.settings.weather));
    this.world.sun.castShadow = this.settings.quality === 'high';
    this.renderer.setPixelRatio(this.settings.quality === 'high' ? Math.min(window.devicePixelRatio, 1.5) : 0.85);
    this.audio.enabled = this.settings.sound;
    if (this.car && s.trans) {
      this.car.transMode = s.trans;
    }
    this.onResize();
  }

  // ------------------------------------------------------------ Interactive Vehicle & Dashboard Controls
  onKey = (e: KeyboardEvent) => {
    if (this.mode === 'attract') return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    this.keys.add(k);
    this.audio.init();
    this.audio.resume();
    if (e.repeat) return;

    if (k === 'escape' || k === 'p') {
      this.paused = !this.paused;
      this.audio.switchClick(!this.paused);
      return;
    }
    if (this.paused) return;

    // Camera
    if (k === 'c') this.cycleCam();

    // Indicators: ',' (comma) for Left, '.' (period/fullstop) for Right!
    if (e.key === ',' || e.code === 'Comma') {
      e.preventDefault();
      this.toggleLeftIndicator();
    }
    if (e.key === '.' || e.code === 'Period') {
      e.preventDefault();
      this.toggleRightIndicator();
    }
    // Hazard blinker: '/' or 'z'
    if (e.key === '/' || k === 'z') {
      e.preventDefault();
      this.toggleHazard();
    }

    // Headlights: 'l'
    if (k === 'l') this.toggleHeadlights();
    // Wipers: 'y'
    if (k === 'y') this.cycleWipers();
    // Seatbelt: 'b'
    if (k === 'b') this.toggleSeatbelt();
    // Ignition: 'i'
    if (k === 'i') this.toggleEngine();
    // Mirrors: 'v'
    if (k === 'v') this.checkMirrors();
    // Handbrake: Space
    if (k === ' ') this.toggleHandbrake();

    // Sequential Shift Up / Down: ']' / 'e' = Shift Up, '[' = Shift Down
    if (e.key === ']' || k === 'e') {
      this.shiftUp();
    }
    if (e.key === '[') {
      this.shiftDown();
    }

    // Manual H-Shifter direct gear keys: '0' or 'n' = Neutral, '-' = Reverse, '1'..'6' = Gears 1..6
    if (this.car) {
      if (k === '0' || k === 'n') {
        if (this.car.transMode === 'manual') this.selectHGear(0);
        else this.selectAutoPos('N');
      } else if (k === '-') {
        if (this.car.transMode === 'manual') this.selectHGear(-1);
        else this.selectAutoPos('R');
      } else if (['1', '2', '3', '4', '5', '6'].includes(k)) {
        const g = parseInt(k, 10);
        if (g <= this.spec.gears) {
          if (this.car.transMode === 'manual') {
            this.selectHGear(g);
          } else {
            this.car.setAutoPos('M');
            this.car.seqGear = g;
            this.audio.gearShift();
            this.msg(`Sequential Gear M${g}`, 'info');
          }
        }
      }
    }

    if (k === 'r' && this.mode === 'free') this.resetToRoad();
    if (k === 'x') this.lookBack = true;
  };

  onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    if (k === 'x') this.lookBack = false;
  };

  toggleLeftIndicator() {
    this.audio.switchClick(true);
    this.setIndicator(this.indicator === 1 ? 0 : 1);
    this.msg(this.indicator === 1 ? '◀ Left Indicator ON (,)' : 'Indicator OFF', 'info');
  }

  toggleRightIndicator() {
    this.audio.switchClick(true);
    this.setIndicator(this.indicator === -1 ? 0 : -1);
    this.msg(this.indicator === -1 ? 'Right Indicator ON (.) ▶' : 'Indicator OFF', 'info');
  }

  toggleHazard() {
    this.hazard = !this.hazard;
    this.audio.switchClick(this.hazard);
    this.blinkT = 0;
    this.msg(this.hazard ? '⚠️ Hazard Warning Blinkers ON' : 'Hazard Blinkers OFF', this.hazard ? 'warn' : 'info');
  }

  toggleHeadlights() {
    this.headlights = !this.headlights;
    this.audio.switchClick(this.headlights);
    this.msg(this.headlights ? '💡 Headlights ON' : '💡 Headlights OFF', 'info');
  }

  cycleWipers() {
    this.wipers = (this.wipers + 1) % 3;
    this.audio.switchClick(this.wipers > 0);
    this.msg(this.wipers === 0 ? 'Wipers OFF' : this.wipers === 1 ? '🌧️ Wipers LOW' : '⛈️ Wipers FAST', 'info');
  }

  toggleSeatbelt() {
    this.seatbelt = !this.seatbelt;
    this.audio.switchClick(this.seatbelt);
    this.audio.beep(this.seatbelt ? 920 : 420, 0.08);
    this.msg(this.seatbelt ? '🔒 Seatbelt fastened ✔' : 'Seatbelt unfastened', this.seatbelt ? 'good' : 'warn');
  }

  toggleEngine() {
    if (!this.car) return;
    this.car.engineOn = !this.car.engineOn;
    this.car.justStalled = false;
    this.audio.starterCrank(this.car.engineOn);
    this.msg(this.car.engineOn ? '🔑 Engine started' : 'Engine switched off', this.car.engineOn ? 'good' : 'info');
  }

  checkMirrors() {
    this.mirrors = true;
    this.audio.switchClick(true);
    this.msg('🪞 Mirrors checked & adjusted ✔', 'good');
  }

  toggleHandbrake() {
    this.handbrakeOn = !this.handbrakeOn;
    const isHeavy = ['truck', 'mtruck', 'artic', 'bus', 'mbus', 'coach'].includes(this.spec.kind);
    if (isHeavy) this.audio.airBrakeHiss();
    else this.audio.switchClick(this.handbrakeOn);
    this.msg(this.handbrakeOn ? '🅿️ Handbrake APPLIED' : '🅿️ Handbrake RELEASED', 'info');
  }

  setHorn(on: boolean) {
    this.uiHorn = on;
    this.audio.horn(on, this.spec.hornTone);
  }

  setTransMode(m: TransMode) {
    this.settings.trans = m;
    if (this.car) {
      this.car.transMode = m === 'both' ? 'manual' : m;
      this.audio.switchClick(true);
      this.msg(`Transmission Mode: ${m.toUpperCase()}`, 'info');
    }
  }

  selectAutoPos(pos: AutoPos) {
    if (!this.car) return;
    if (this.settings.trans === 'both') this.car.transMode = 'auto';
    this.car.setAutoPos(pos);
    this.audio.gearShift();
    this.msg(`Selector: ${pos}`, 'info');
  }

  selectHGear(g: number) {
    if (!this.car) return;
    if (this.settings.trans === 'both') this.car.transMode = 'manual';
    const ok = this.car.setHGear(g);
    if (ok) {
      this.audio.gearShift();
      const label = g === -1 ? 'Reverse (R)' : g === 0 ? 'Neutral (N)' : `Gear ${g}`;
      this.msg(`H-Shifter: ${label}`, 'info');
    } else {
      this.audio.gearGrind();
      this.rules.flag('GEAR_GRIND', 4);
      this.msg('⚠️ Hold Q (Full Clutch In) before shifting gears!', 'warn');
    }
  }

  shiftUp() {
    if (!this.car) return;
    const ok = this.car.shiftUp();
    if (ok) {
      this.audio.gearShift();
      this.msg(`Shift Up → ${this.car.gearLabel}`, 'info');
    } else if (this.car.justGrinded) {
      this.car.justGrinded = false;
      this.audio.gearGrind();
      this.rules.flag('GEAR_GRIND', 4);
      this.msg('⚠️ Hold Q (Full Clutch In) before shifting gears!', 'warn');
    }
  }

  shiftDown() {
    if (!this.car) return;
    const ok = this.car.shiftDown();
    if (ok) {
      this.audio.gearShift();
      this.msg(`Shift Down → ${this.car.gearLabel}`, 'info');
    } else if (this.car.justGrinded) {
      this.car.justGrinded = false;
      this.audio.gearGrind();
      this.rules.flag('GEAR_GRIND', 4);
      this.msg('⚠️ Hold Q (Full Clutch In) before shifting gears!', 'warn');
    }
  }

  setUiClutch(val: number | null) {
    if (this.car) this.car.uiClutch = val;
  }

  setIndicator(v: number) {
    this.indicator = v;
    this.indYaw = 0;
    this.blinkT = 0;
  }

  cycleCam() {
    const order: CamMode[] = ['chase', 'cockpit', 'hood', 'board', 'cinematic'];
    this.cam = order[(order.indexOf(this.cam) + 1) % order.length];
    this.audio.switchClick(true);
    this.msg(`🎥 Camera: ${CAM_LABELS[this.cam]}`);
  }

  setCam(c: CamMode) {
    this.cam = c;
    this.audio.switchClick(true);
  }

  pressKey(k: string) {
    this.onKey(new KeyboardEvent('keydown', { key: k }));
  }

  // ------------------------------------------------------------ Session Setup
  private setupPlayer(specId: string) {
    if (this.rig) this.world.scene.remove(this.rig.root);
    this.spec = VEHICLES.find(v => v.id === specId) ?? VEHICLES[3];
    this.rig = buildVehicleRig(this.spec, { learner: true, interior: true, plate: `KDZ ${this.spec.cls}L` });
    this.world.scene.add(this.rig.root);

    // Bright forward headlight ground projection decal — visible whenever headlights are ON!
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 256;
    const g = cv.getContext('2d')!;
    const gr = g.createRadialGradient(64, 240, 6, 64, 150, 210);
    gr.addColorStop(0, 'rgba(255,248,210,0.95)');
    gr.addColorStop(0.5, 'rgba(255,240,185,0.45)');
    gr.addColorStop(1, 'rgba(255,230,170,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(46, 256);
    g.lineTo(0, 0);
    g.lineTo(128, 0);
    g.lineTo(82, 256);
    g.fill();

    const bg = new THREE.PlaneGeometry(11, 32);
    bg.rotateX(-Math.PI / 2);
    const beam = new THREE.Mesh(
      bg,
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(cv),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -6,
      }),
    );
    beam.position.set(0, 0.09, this.spec.length / 2 + 15.5);
    beam.visible = false;
    this.rig.root.add(beam);
    this.spot = beam;

    const effectiveTrans: TransMode =
      this.settings.trans === 'both' ? this.spec.defaultTrans : this.settings.trans;
    this.car = new CarPhysics(this.spec, effectiveTrans);
  }

  private placeOn(d: DEdge, along: number, lane = 1) {
    const e = EDGES[d.e];
    const off = laneOffset(e.type, lane);
    const s = d.dir === 1 ? e.trimA + along : e.len - e.trimB - along;
    const p = edgePoint(e, s, d.dir === 1 ? -off : off);
    this.car!.place(p.x, p.z, Math.atan2(e.dx * d.dir, e.dz * d.dir));
    this.camPos.set(p.x - Math.sin(this.car!.heading) * 10, 5, p.z - Math.cos(this.car!.heading) * 10);
  }

  private resetSession(mode: Mode, specId: string) {
    this.mode = mode;
    this.ended = false;
    this.paused = false;
    this.elapsed = 0;
    this.endTimer = -1;
    this.arrived = false;
    this.flash = '';
    this.rules = Object.assign(new RuleMonitor(), {
      onOffense: this.rules.onOffense,
      onArrive: this.rules.onArrive,
      onReroute: this.rules.onReroute,
      onNode: this.rules.onNode,
    });
    this.route = null;
    this.dest = '';
    this.blockedIds = [];
    this.challenge = null;
    this.objective = '';
    this.chState = {};
    this.targetBay = null;
    this.startText = '';
    this.world.setBlocked([]);
    this.traffic.blocked = new Set();
    this.marker.clear();
    this.beacon.visible = false;
    if (this.slowTruck) {
      this.world.scene.remove(this.slowTruck.rig.root);
      this.traffic.cars = this.traffic.cars.filter(c => c !== this.slowTruck);
      this.slowTruck = null;
    }
    try {
      this.setupPlayer(specId);
    } catch (e) {
      this.world.reportFailure(`Player vehicle ${specId}`, e);
      if (this.rig) this.world.scene.remove(this.rig.root);
      this.rig = null;
      this.setupPlayer('B1');
    }
    this.indicator = 0;
    this.hazard = false;
    this.wipers = this.settings.weather === 'rain' || this.settings.weather === 'storm' ? 1 : 0;
    this.rainDrops = 0;
    this.headlights = this.world.isNightOrDusk;
    this.lookBack = false;
    this.audio.init();
    this.audio.resume();
    this.cam = 'chase';
  }

  private respawnTraffic() {
    this.traffic.clear();
    this.world.safe('Traffic', () => this.traffic.spawn(this.settings.traffic, { x: this.car!.x, z: this.car!.z }));
  }

  startFree(specId: string) {
    this.resetSession('free', specId);
    this.world.setTimeOfDay(this.settings.time);
    this.world.setWeather(this.settings.weather);
    this.placeOn({ e: 'e22', dir: 1 }, 40, 1);
    this.seatbelt = true;
    this.mirrors = true;
    this.handbrakeOn = false;
    this.car!.engineOn = true;
    this.phase = 'driving';
    this.respawnTraffic();
    this.startText = 'Free Roam — Explore Nairobi CBD & the 7-Biome Outer Proving Ground Ring!';
    this.msg('zingri_master: "Welcome to Free Roam! Use , / . for indicators, H for horn, L for lights, C for camera."', 'info');
  }

  startTest(specId: string, preset?: { start: DEdge; dest: string; blocked: string[]; night?: boolean; weather?: WeatherKind }) {
    this.resetSession('test', specId);
    const sc = preset ? { ...preset, route: planMTB(preset.start, preset.dest, new Set(preset.blocked))! } : this.genTest();
    this.world.setTimeOfDay(preset?.night ? 'night' : this.settings.time);
    this.world.setWeather(preset?.weather ?? this.settings.weather);
    if (preset?.night) this.headlights = false;
    if (preset?.weather === 'storm' || preset?.weather === 'rain') this.wipers = 0;
    this.route = sc.route;
    this.dest = sc.dest;
    this.blockedIds = sc.blocked;
    this.world.setBlocked(sc.blocked);
    this.traffic.blocked = new Set(sc.blocked);
    this.placeOn(sc.start, 18, 1);
    this.rules.route = sc.route;
    this.rules.dest = sc.dest;
    this.rules.blocked = new Set(sc.blocked);
    this.seatbelt = false;
    this.mirrors = false;
    this.handbrakeOn = true;
    this.car!.engineOn = false;
    this.phase = 'precheck';
    const destN = NODES[sc.dest];
    this.beacon.position.set(destN.x, 30, destN.z);
    this.beacon.visible = true;
    const startName = EDGES[sc.start.e].name;
    this.startText = `Start: ${startName} → Destination: ${this.nodeName(sc.dest)}`;
    this.respawnTraffic();
    this.msg('zingri_master: "Complete your cockpit drill: Seatbelt (B), Mirrors (V), Ignition (I), Release Handbrake (Space)."', 'info');
  }

  nodeName(id: string) {
    const l = LANDMARKS.find(x => x.node === id);
    return l ? `${l.icon} ${l.name} (Junction ${id})` : `${NODES[id]?.label ?? id}`;
  }

  genTest() {
    const edges = Object.values(EDGES).filter(e => e.type !== 'parking');
    const destNodes = [...new Set(LANDMARKS.map(l => l.node))].filter(n => NODES[n].kind !== 'round');
    for (let tries = 0; tries < 400; tries++) {
      const e = edges[Math.floor(Math.random() * edges.length)];
      const start: DEdge = { e: e.id, dir: Math.random() < 0.5 ? 1 : -1 };
      if (e.len - e.trimA - e.trimB < 60) continue;
      const dest = destNodes[Math.floor(Math.random() * destNodes.length)];
      if (dest === e.a || dest === e.b) continue;
      const ideal = findRoute(start, dest, { allowParking: false });
      if (!ideal || ideal.length < 280 || ideal.length > 900) continue;
      const roll = Math.random();
      const want = roll < 0.4 ? 1 : roll < 0.75 ? 2 : 3;
      let blocked: string[] = [];
      if (want === 2 || want === 3) {
        let cur: ReturnType<typeof findRoute> = ideal;
        for (let k = 0; k < 5 && cur; k++) {
          const cand = cur.states.slice(1).map(s => s.e).filter(id => EDGES[id].type !== 'parking' && !blocked.includes(id));
          if (!cand.length) break;
          blocked.push(cand[Math.floor(Math.random() * cand.length)]);
          cur = findRoute(start, dest, { allowParking: false, blocked: new Set(blocked) });
          if (want === 2 && cur) break;
        }
      } else if (Math.random() < 0.5) {
        const off = edges.filter(x => !ideal.states.some(s => s.e === x.id) && x.id !== e.id);
        blocked = [off[Math.floor(Math.random() * off.length)].id];
      }
      if (blocked.includes(e.id)) continue;
      const route = planMTB(start, dest, new Set(blocked));
      if (!route) continue;
      if (route.rule !== want && tries < 300) continue;
      if (route.length > 1400) continue;
      return { start, dest, blocked, route };
    }
    const start: DEdge = { e: 'e22', dir: 1 };
    return { start, dest: 'K', blocked: [] as string[], route: planMTB(start, 'K', new Set())! };
  }

  startChallenge(id: string, specId: string) {
    const def = CHALLENGES.find(c => c.id === id) ?? CHALLENGES[0];
    if (id === 'night') {
      this.startTest(specId, { start: { e: 'e1', dir: 1 }, dest: 'K', blocked: ['e25'], night: true, weather: 'storm' });
      this.mode = 'challenge';
      this.challenge = def;
      this.objective = 'Switch on Headlights (L) & Wipers (Y), complete pre-checks, and drive to Kenyatta Hospital (K)!';
      return;
    }

    this.resetSession('challenge', specId);
    this.challenge = def;
    this.objective = def.desc;
    this.world.setTimeOfDay(this.settings.time);
    this.world.setWeather(this.settings.weather);
    this.seatbelt = true;
    this.mirrors = true;
    this.handbrakeOn = false;
    this.car!.engineOn = true;
    this.phase = 'driving';
    const W = this.world;

    if (id === 'roundabout') {
      this.placeOn({ e: 'e18', dir: 1 }, 5, 2);
      this.objective = 'Move to LANE 3, signal right (.), give way to traffic from the right, and take the 3rd exit (270°) towards M.';
    } else if (id === 'uturn') {
      this.placeOn({ e: 'e20', dir: -1 }, 5, 3);
      this.objective = 'Move to LANE 4 (innermost) and go full circle (360°) at Roundabout 2 — exit back east on Uhuru Highway.';
    } else if (id === 'angle') {
      this.placeOn({ e: 'e2', dir: 1 }, 30, 1);
      const bays = W.bays.filter(b => b.lot === 'p1' && b.side === 'left');
      const target = bays.reduce((a, b) => (b.z > a.z ? b : a));
      W.freeBay(target);
      this.targetBay = target;
      this.addBayMarker(target);
      this.objective = 'Turn RIGHT (.) into P1 (one-way), drive to the FURTHEST free bay on your left and park FORWARDS. Apply handbrake (Space).';
    } else if (id === 'flush') {
      this.placeOn({ e: 'p2', dir: 1 }, 20, 1);
      const bays = W.bays.filter(b => b.lot === 'p2' && b.side === 'left').sort((a, b) => a.z - b.z);
      const target = bays[Math.floor(bays.length * 0.35)];
      W.freeBay(target);
      this.targetBay = target;
      this.addBayMarker(target);
      this.objective = 'Stop ahead of the highlighted bay, then REVERSE into it parallel to the kerb. Apply handbrake (Space).';
    } else if (id === 'estop') {
      this.placeOn({ e: 'e15', dir: 1 }, 3, 2);
      this.chState = { armed: 0, triggered: 0, t: 0, react: -1, startX: 0, startZ: 0, v0: 0 };
      this.rules.suppressHarsh = true;
      this.objective = 'Accelerate to at least 40 km/h and hold your lane. Wait for Chief Instructor zingri_master\'s STOP command.';
    } else if (id === 'overtake') {
      this.placeOn({ e: 'e11', dir: 1 }, 8, 1);
      const truck = new AICar(VEHICLES.find(v => v.id === 'C')!, W.scene, 77);
      truck.factor = 0.4;
      truck.startOn({ e: 'e11', dir: 1 }, 0.2, this.traffic.blocked);
      this.slowTruck = truck;
    } else if (id === 'signals') {
      this.placeOn({ e: 'e24', dir: 1 }, 10, 2);
      this.objective = 'Stop for any pedestrian on the zebra crossing, obey the traffic lights at G and continue STRAIGHT to junction L.';
    } else if (id === 'hillstart') {
      // Place on Rift Escarpment Hill Climb at x = 60, z = -325 facing East (+x uphill)
      this.car!.place(60, -325, Math.PI / 2);
      this.camPos.set(46, 8, -325);
      this.chState = { stoppedInBox: false, minXAfterStop: 95, maxXReached: 60 };
      this.beacon.position.set(185, 35, -325);
      this.beacon.visible = true;
      this.objective = 'Drive up into the yellow Hill-Start Box (20m ahead), come to a COMPLETE STOP & apply Handbrake (Space).';
    } else if (id === 'threepoint') {
      // Place on Harambee Ave (e1: A -> B, heading East +x)
      this.placeOn({ e: 'e1', dir: 1 }, 85, 1);
      this.chState = { usedForward: false, usedReverse: false, turnedAround: false, startHeading: this.car!.heading };
      this.beacon.position.set(NODES.A.x + 30, 30, NODES.A.z);
      this.beacon.visible = true;
      this.objective = 'Perform a 3-Point Turn (Forward right + Reverse left + Forward) on Harambee Ave to face West (180°), then drive to the beacon near A!';
    } else if (id === 'taxi') {
      // VIP Taxi Run from Hilton (Junction D) to Serena Hotel (Junction E) via Moi Ave or MTB route
      this.placeOn({ e: 'e4', dir: 1 }, 165, 1);
      this.chState = { pickedUp: false, comfort: 100 };
      this.beacon.position.set(NODES.D.x, 30, NODES.D.z);
      this.beacon.visible = true;
      this.objective = 'Stop smoothly at Hilton Nairobi (Junction D beacon) to pick up your VIP passenger.';
    } else if (id === 'expedition') {
      // All-in-One Kenya Expedition starting at North-West Highway entrance (-395, -325)
      this.car!.place(-395, -325, Math.PI / 2);
      this.camPos.set(-412, 6, -325);
      this.chState = { cpIdx: 0 };
      this.rules.enabled = false; // Off-road/expedition sidequest focuses on terrain mastery & checkpoints
      const cp = EXPEDITION_CHECKPOINTS[0];
      this.beacon.position.set(cp.x, 35, cp.z);
      this.beacon.visible = true;
      this.objective = `${cp.name}: ${cp.hint}`;
    }

    this.respawnTraffic();
    if (this.slowTruck) {
      this.traffic.cars = this.traffic.cars.filter(c => Math.hypot(c.x - this.slowTruck!.x, c.z - this.slowTruck!.z) > 20);
      this.traffic.cars.push(this.slowTruck);
    }
    this.msg(`zingri_master: "${def.title} — ${this.objective}"`, 'info');
  }

  addBayMarker(b: Bay) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.85 });
    const L = 5.2, Wd = 2.4;
    for (const [w, d, x, z] of [[Wd, 0.15, 0, L / 2], [Wd, 0.15, 0, -L / 2], [0.15, L, Wd / 2, 0], [0.15, L, -Wd / 2, 0]] as number[][]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), mat);
      m.position.set(x, 0.1, z);
      g.add(m);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(Wd, 3, L), new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.14, depthWrite: false }));
    beam.position.y = 1.5;
    g.add(beam);
    g.position.set(b.x, 0, b.z);
    g.rotation.y = b.heading;
    this.marker.add(g);
  }

  resetToRoad() {
    if (!this.car) return;
    let best: { e: string; d: number; s: number } = { e: 'e22', d: 1e9, s: 50 };
    for (const e of Object.values(EDGES)) {
      if (e.type === 'parking') continue;
      const rx = this.car.x - e.ax, rz = this.car.z - e.az;
      const s = Math.max(e.trimA + 5, Math.min(e.len - e.trimB - 5, rx * e.dx + rz * e.dz));
      const p = edgePoint(e, s, 0);
      const d = Math.hypot(p.x - this.car.x, p.z - this.car.z);
      if (d < best.d) best = { e: e.id, d, s };
    }
    const e = EDGES[best.e];
    const dir: 1 | -1 = Math.sin(this.car.heading) * e.dx + Math.cos(this.car.heading) * e.dz >= 0 ? 1 : -1;
    this.placeOn({ e: e.id, dir }, dir === 1 ? best.s - e.trimA : e.len - e.trimB - best.s, 1);
    this.msg('Vehicle reset to nearest Nairobi CBD lane', 'info');
  }

  quitToMenu() {
    this.mode = 'attract';
    this.phase = 'idle';
    this.paused = false;
    this.world.setBlocked([]);
    this.traffic.blocked = new Set();
    this.marker.clear();
    this.beacon.visible = false;
    if (this.rig) {
      this.world.scene.remove(this.rig.root);
      this.rig = null;
    }
    this.car = null;
    this.audio.stopAll();
    this.world.setTimeOfDay(this.settings.time);
    this.world.setWeather(this.settings.weather);
    this.world.boardLabels.visible = false;
    this.boardArrow.visible = false;
  }

  finish(passed: boolean | null, title: string, stats: string[] = []) {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'ended';
    const score = this.rules.score();
    const failed = this.rules.failed();
    const majors = this.rules.offenses.filter(o => o.sev === 'major').length;
    const ok = passed ?? (!failed && score >= 70 && majors <= 2);
    if (ok) this.audio.success();
    else this.audio.fault('fail');
    const res: EndResult = {
      mode: this.mode,
      title,
      passed: ok,
      score,
      offenses: [...this.rules.offenses],
      time: this.elapsed,
      distance: this.car?.odometer ?? 0,
      stats,
      ruleText: this.route?.ruleText,
      vehicleClass: this.spec.id,
      challengeId: this.challenge?.id,
    };
    this.audio.stopAll();
    this.listeners.forEach(l => l.end?.(res));
  }

  // ------------------------------------------------------------ Challenge Logic
  onChallengeNode(node: string, out: DEdge | null) {
    if (this.mode !== 'challenge' || !this.challenge || this.ended) return;
    const id = this.challenge.id;
    const roundFaults = () => this.rules.offenses.filter(o => o.id.startsWith('ROUND') || o.id === 'GIVE_WAY_ROUND').length;
    if (id === 'roundabout' && node === 'R1' && out) {
      if (out.e === 'e23' && out.dir === 1) {
        this.finish(roundFaults() === 0 && !this.rules.failed(), 'Roundabout Master', [
          'Exit taken: 3rd exit (270°) ✔',
          roundFaults() ? 'Roundabout faults committed' : 'Correct Lane 3 discipline ✔',
        ]);
      } else {
        this.finish(false, 'Roundabout Master', ['Wrong exit taken — you needed the 3rd exit towards M.']);
      }
    }
    if (id === 'uturn' && node === 'R2' && out) {
      if (out.e === 'e20' && out.dir === 1) {
        this.finish(roundFaults() === 0 && !this.rules.failed(), 'Full Circle 360°', [
          'Full 360° completed ✔',
          roundFaults() ? 'Roundabout faults committed' : 'Innermost Lane 4 used correctly ✔',
        ]);
      } else {
        this.finish(false, 'Full Circle 360°', ['You left the roundabout before completing the full 360° circle.']);
      }
    }
    if (id === 'signals' && node === 'L') this.finish(null, 'Traffic Signals & Zebra', ['Reached junction L ✔']);
    if (id === 'overtake' && node === 'L') {
      const overtook = this.slowTruck
        ? Math.hypot(this.slowTruck.x - NODES.L.x, this.slowTruck.z - NODES.L.z) > Math.hypot(this.car!.x - NODES.L.x, this.car!.z - NODES.L.z)
        : false;
      const cont = this.rules.offenses.some(o => o.id === 'CROSS_CONT_YELLOW');
      this.finish(overtook && !cont && !this.rules.failed(), 'Yellow Line Overtaking', [
        overtook ? 'Overtook the heavy lorry ✔' : 'You did not overtake the lorry ✘',
        cont ? 'Crossed a continuous yellow line ✘' : 'Respected continuous yellow lines ✔',
      ]);
    }
  }

  tickChallenge(dt: number) {
    if (!this.challenge || !this.car || this.ended) return;
    const id = this.challenge.id;
    const c = this.car;
    const s = this.chState;

    if ((id === 'angle' || id === 'flush') && this.targetBay) {
      const b = this.targetBay;
      const d = Math.hypot(c.x - b.x, c.z - b.z);
      let dh = Math.abs((((c.heading - b.heading) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      if (id === 'flush') dh = Math.min(dh, Math.abs(Math.PI - dh));
      this.objective = `${id === 'angle' ? 'Park FORWARDS in the furthest free bay' : 'REVERSE into the flush bay'} · distance ${d.toFixed(1)} m · angle ${(dh * 57.3).toFixed(0)}°`;
      if (d < 1.05 && dh < 0.24 && Math.abs(c.speed) < 0.12 && this.handbrakeOn) {
        const dirOk = id === 'angle' ? c.lastMoveDir === 1 : c.lastMoveDir === -1;
        this.finish(dirOk && !this.rules.failed(), id === 'angle' ? 'Angle Parking (P1)' : 'Flush Parking (P2)', [
          `Final position error ${d.toFixed(2)} m`,
          `Angle error ${(dh * 57.3).toFixed(1)}°`,
          dirOk ? (id === 'angle' ? 'Parked forwards ✔' : 'Reversed into bay ✔') : (id === 'angle' ? 'Angle bays must be entered FORWARDS ✘' : 'Flush bays must be entered in REVERSE ✘'),
        ]);
      }
    }

    if (id === 'estop') {
      s.t = (s.t as number) + dt;
      if (!s.armed && c.kmh > 38) {
        s.armed = 1;
        s.t = 0;
        s.delay = 1.5 + Math.random() * 2.5;
      }
      if (s.armed && !s.triggered && (s.t as number) > (s.delay as number)) {
        s.triggered = 1;
        s.t = 0;
        s.startX = c.x;
        s.startZ = c.z;
        s.v0 = c.kmh;
        this.flash = 'STOP!';
        this.flashT = 99;
        this.audio.beep(1200, 0.4, 0.25, 'square');
        this.msg('zingri_master: "STOP NOW!"', 'fail');
      }
      if (s.triggered) {
        if ((s.react as number) < 0 && (this.brakeIn > 0.1 || this.handbrakeOn)) s.react = s.t as number;
        if (Math.abs(c.speed) < 0.1) {
          const dist = Math.hypot(c.x - (s.startX as number), c.z - (s.startZ as number));
          const v = (s.v0 as number) / 3.6;
          const allowed = v * 1.0 + (v * v) / (2 * 5.2) + 2.5;
          this.flash = '';
          this.flashT = 0;
          this.finish(dist <= allowed && !this.rules.failed(), 'Emergency Stop Drill', [
            `Speed at command: ${(s.v0 as number).toFixed(0)} km/h`,
            `Reaction time: ${((s.react as number) >= 0 ? (s.react as number) : 0).toFixed(2)} s`,
            `Stopping distance: ${dist.toFixed(1)} m (allowed ${allowed.toFixed(1)} m)`,
          ]);
        }
      } else {
        this.objective = s.armed ? 'Hold 40 km/h… be ready for STOP!' : `Accelerate to 40 km/h (now ${c.kmh.toFixed(0)} km/h)`;
      }
    }

    if (id === 'overtake') {
      this.objective = 'Overtake the slow lorry where the yellow centre line is BROKEN (signal . right, then , left), then reach Junction L.';
    }

    if (id === 'hillstart') {
      // Step 1: Stop in yellow box around x = 88..104, z = -325 with handbrake
      if (!s.stoppedInBox) {
        const distToBox = Math.abs(c.x - 95);
        this.objective = `Step 1: Stop inside the yellow Hill-Start Box on the incline (${distToBox.toFixed(1)} m) & apply Handbrake (Space).`;
        if (distToBox < 7 && Math.abs(c.speed) < 0.15 && this.handbrakeOn) {
          s.stoppedInBox = true;
          s.minXAfterStop = c.x;
          s.stopX = c.x;
          this.audio.chime();
          this.msg('zingri_master: "Good! Now hold Q+Shift (Clutch Bite) + W (Gas ~1800 RPM), release Handbrake (Space), and climb to the summit!"', 'good');
        }
      } else {
        if (c.x < (s.minXAfterStop as number)) s.minXAfterStop = c.x;
        const rollback = Math.max(0, (s.stopX as number) - (s.minXAfterStop as number));
        if (rollback > 0.65) {
          this.rules.flag('HILL_ROLLBACK', 8, `Rolled back ${rollback.toFixed(2)} m`);
        }
        const rem = Math.max(0, 185 - c.x);
        this.objective = `Step 2: Climb to the Escarpment Summit (${rem.toFixed(0)} m ahead) · Rollback: ${rollback.toFixed(2)} m (max 0.60 m)`;
        if (c.x >= 182) {
          const clean = rollback <= 0.65 && !this.rules.failed();
          this.finish(clean, 'Rift Escarpment Hill Start', [
            `Hill incline: 11% grade (+13.5 m crest)`,
            `Maximum rollback: ${rollback.toFixed(2)} m ${rollback <= 0.65 ? '✔' : '✘ (exceeded 0.65 m)'}`,
            `Stalls: ${this.rules.offenses.filter(o => o.id === 'ENGINE_STALL').length}`,
          ]);
        }
      }
    }

    if (id === 'threepoint') {
      if (c.speed > 0.6) s.usedForward = true;
      if (c.speed < -0.5 && s.usedForward) s.usedReverse = true;
      const headingDiff = Math.abs((((c.heading - (s.startHeading as number)) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      if (s.usedReverse && headingDiff > 2.6 && c.speed > 0.5) s.turnedAround = true;
      const distToGoal = Math.hypot(c.x - (NODES.A.x + 30), c.z - NODES.A.z);
      this.objective = !s.usedReverse
        ? 'Step 1: Turn right/left forward, stop before the kerb, then shift into Reverse (R) and back up.'
        : !s.turnedAround
        ? 'Step 2: Complete the 180° turn into the Westbound lane.'
        : `Step 3: Drive West to the finish beacon near Junction A (${distToGoal.toFixed(0)} m).`;
      if (s.turnedAround && distToGoal < 12 && Math.abs(c.speed) < 0.4) {
        const kerbHits = this.rules.offenses.filter(o => o.id === 'KERB').length;
        this.finish(kerbHits === 0 && !this.rules.failed(), '3-Point Turn (Narrow Street)', [
          '3-Point Turn 180° completed ✔',
          kerbHits === 0 ? 'Zero kerb touches ✔' : `Mounted/touched kerb ${kerbHits} time(s) ✘`,
        ]);
      }
    }

    if (id === 'taxi') {
      let comfort = (s.comfort as number) ?? 100;
      if (Math.abs(c.accel) > 5.5) comfort = Math.max(0, comfort - dt * 12);
      if (Math.abs(c.speed * c.yawRate) > 4.2) comfort = Math.max(0, comfort - dt * 10);
      s.comfort = comfort;
      if (!s.pickedUp) {
        const dPickup = Math.hypot(c.x - NODES.D.x, c.z - NODES.D.z);
        this.objective = `Pick up VIP Passenger at Hilton Nairobi (Junction D · ${dPickup.toFixed(0)} m) and come to a stop.`;
        if (dPickup < 16 && Math.abs(c.speed) < 0.25) {
          s.pickedUp = true;
          this.beacon.position.set(NODES.E.x, 30, NODES.E.z);
          this.audio.chime();
          this.msg('VIP Passenger aboard! Drive smoothly to Serena Hotel (Junction E). Keep Comfort ≥ 75%!', 'good');
        }
      } else {
        const dDrop = Math.hypot(c.x - NODES.E.x, c.z - NODES.E.z);
        this.objective = `Drop VIP at Serena Hotel (Junction E · ${dDrop.toFixed(0)} m) and stop · Passenger Comfort: ${Math.round(comfort)}%`;
        if (dDrop < 16 && Math.abs(c.speed) < 0.25) {
          const ok = comfort >= 75 && !this.rules.failed();
          this.finish(ok, 'VIP Taxi Ride-Hail Run (Class B3)', [
            `Passenger Comfort Rating: ${Math.round(comfort)}% ${comfort >= 75 ? '★★★★★ ✔' : '✘ (below 75%)'}`,
            `Trip time: ${Math.round(this.elapsed)} s`,
          ]);
        }
      }
    }

    if (id === 'expedition') {
      const idx = (s.cpIdx as number) ?? 0;
      const cp = EXPEDITION_CHECKPOINTS[idx];
      if (cp) {
        const dist = Math.hypot(c.x - cp.x, c.z - cp.z);
        this.objective = `[${idx + 1}/${EXPEDITION_CHECKPOINTS.length}] ${cp.name} (${dist.toFixed(0)} m) — ${cp.hint}`;
        if (dist < 26) {
          this.audio.chime();
          const nextIdx = idx + 1;
          if (nextIdx >= EXPEDITION_CHECKPOINTS.length) {
            this.finish(true, 'All-in-One Kenya Expedition', [
              'All 7 Biomes conquered (Highway, Hills, Winding, Off-Road, Desert, Snow & Mud) ✔',
              `Total Expedition Time: ${Math.floor(this.elapsed / 60)}m ${Math.round(this.elapsed % 60)}s`,
              `Total Distance: ${(c.odometer / 1000).toFixed(2)} km`,
            ]);
          } else {
            s.cpIdx = nextIdx;
            const ncp = EXPEDITION_CHECKPOINTS[nextIdx];
            this.beacon.position.set(ncp.x, 35, ncp.z);
            this.msg(`zingri_master: "Checkpoint ${idx + 1} cleared! Next: ${ncp.name}"`, 'good');
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ Main Loop
  loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    try {
      if (!this.paused) this.update(dt);
    } catch (e) {
      this.errorCount++;
      const m = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
      if (m !== this.lastError) {
        this.lastError = m;
        console.error('Z-Drive update error', e);
      }
      if (this.errorCount === 1) this.onError(m);
    }
    try {
      if (this.settings.quality === 'high' && this.composer && this.bloom) {
        const night = this.world.isNightOrDusk;
        this.bloom.strength = night ? 0.85 : 0.22;
        this.bloom.threshold = night ? 0.55 : 0.90;
        this.composer.render();
      } else {
        this.renderer.render(this.world.scene, this.camera);
      }
    } catch (e) {
      console.error('Render error', e);
      this.composer = null;
      try { this.renderer.render(this.world.scene, this.camera); } catch { /* ignore */ }
    }
  };

  update(dt: number) {
    const night = this.world.isNightOrDusk;
    const agent: Agent | null = this.car
      ? { x: this.car.x, z: this.car.z, heading: this.car.heading, speed: Math.abs(this.car.speed), length: this.spec.length, width: this.spec.width, isPlayer: true }
      : null;
    this.traffic.update(dt, agent, night);

    if (this.mode === 'attract' || !this.car || !this.rig) {
      this.attractCam(dt);
      this.world.update(this.camLook, dt);
      return;
    }

    const car = this.car;
    if (!this.ended) this.elapsed += dt;

    // Controls
    const k = this.keys;
    const left = k.has('a') || k.has('arrowleft');
    const right = k.has('d') || k.has('arrowright');
    const up = k.has('w') || k.has('arrowup');
    const down = k.has('s') || k.has('arrowdown');
    const clutchKey = k.has('q');
    const shiftKey = k.has('shift');
    const clutchBiteKey = clutchKey && shiftKey; // Q + Left Shift = Clutch Bite-Point Release Zone!

    const steerT = (left ? 1 : 0) - (right ? 1 : 0) + this.touch.steer;
    const rate = steerT !== 0 ? 2.8 : 4.5;
    this.steerIn += Math.max(-rate * dt, Math.min(rate * dt, Math.max(-1, Math.min(1, steerT)) - this.steerIn));
    this.throttleIn += ((up ? 1 : this.touch.throttle) - this.throttleIn) * Math.min(1, dt * 6);
    this.brakeIn += ((down ? 1 : this.touch.brake) - this.brakeIn) * Math.min(1, dt * 8);

    const frozen = this.ended || (this.phase === 'precheck' && !car.engineOn);
    const ctl: Controls = {
      throttle: frozen ? 0 : this.throttleIn,
      brake: this.ended ? 1 : this.brakeIn,
      steer: this.steerIn,
      handbrake: this.handbrakeOn,
      clutchKey,
      clutchBiteKey,
    };

    // Horn (H key or UI button)
    this.horn = k.has('h') || this.uiHorn;
    this.audio.horn(this.horn, this.spec.hornTone);

    // Precheck completion
    if (this.phase === 'precheck' && car.engineOn && this.seatbelt && this.mirrors && !this.handbrakeOn) {
      this.phase = 'driving';
      this.msg(`zingri_master: "Cockpit checks complete! Proceed to ${this.nodeName(this.dest)}."`, 'good');
      this.audio.chime();
    } else if (this.phase === 'precheck' && car.engineOn && !this.handbrakeOn && Math.abs(car.speed) > 0.5) {
      this.phase = 'driving';
      if (!this.mirrors) this.msg('zingri_master: "Remember to check your mirrors (V) before moving off!"', 'warn');
    }

    const loc = locate(car.x, car.z);
    const inOuterProvingGround = Math.abs(car.x) > 425 || Math.abs(car.z) > 250;
    const onPave =
      !inOuterProvingGround &&
      loc.kind === 'off' &&
      this.world.blockRects.some(r => car.x > r.x0 && car.x < r.x1 && car.z > r.z0 && car.z < r.z1) &&
      !Object.values(NODES).some(n => n.kind === 'round' && Math.hypot(car.x - n.x, car.z - n.z) < RB_OUTER + 4.5);

    const wetFactor = this.world.weather === 'storm' ? 0.68 : this.world.weather === 'rain' ? 0.78 : this.world.weather === 'snow' ? 0.52 : 1.0;
    car.step(dt, ctl, onPave ? 1.35 : 1.0, wetFactor);

    // Check if manual clutch stalled
    if (car.justStalled) {
      car.justStalled = false;
      this.audio.stallSound();
      this.rules.flag('ENGINE_STALL', 5);
      this.msg('⚠️ Engine stalled! Press I to restart, hold Q (Clutch In), then use Q + Left Shift (Bite Point) + W (Gas) to launch.', 'warn');
    }

    // Windshield rain droplets & Wiper sweep animation
    const isRaining = this.world.weather === 'rain' || this.world.weather === 'storm' || this.world.weather === 'snow';
    if (isRaining && this.wipers === 0) {
      this.rainDrops = Math.min(1, this.rainDrops + dt * (this.world.weather === 'storm' ? 0.25 : 0.14));
      if (Math.abs(car.speed) > 3) {
        this.noWiperTimer += dt;
        if (this.noWiperTimer > 8) {
          this.rules.flag('NO_WIPERS', 25);
          this.noWiperTimer = 0;
        }
      }
    } else if (this.wipers > 0) {
      this.noWiperTimer = 0;
      const sweepSpeed = this.wipers === 2 ? 7.5 : 4.2;
      const prevSin = Math.sin(this.wiperPhase);
      this.wiperPhase += dt * sweepSpeed;
      const curSin = Math.sin(this.wiperPhase);
      if (Math.sign(prevSin) !== Math.sign(curSin)) {
        this.audio.wiperSwoosh();
        this.rainDrops = Math.max(0, this.rainDrops - 0.55);
      }
      this.rainDrops = Math.max(0, this.rainDrops - dt * 0.6);
    } else {
      this.rainDrops = Math.max(0, this.rainDrops - dt * 0.25);
    }

    // Update 3D wiper blades on windshield
    const wiperAngle = this.wipers > 0 ? Math.abs(Math.sin(this.wiperPhase)) * 1.15 : 0;
    for (const wp of this.rig.wipers) {
      wp.rotation.z = -wiperAngle;
    }

    // Reverse warning beeper on commercial trucks, buses & plant machinery
    const hasRevBeeper = ['truck', 'mtruck', 'artic', 'bus', 'mbus', 'coach', 'plant'].includes(this.spec.kind);
    if (hasRevBeeper && car.reversing && car.engineOn) {
      this.revBeepT += dt;
      if (this.revBeepT > 0.65) {
        this.revBeepT = 0;
        this.audio.beep(1050, 0.22, 0.10, 'square');
      }
    } else {
      this.revBeepT = 0;
    }

    // Collisions
    const ev = car.resolve([...this.world.solids, ...this.world.dynSolids]);
    const kev = car.resolve(this.world.kerbs);
    for (const e of ev) {
      if (e.impact > 0.5) {
        this.rules.collision('solid', e.impact);
        if (e.impact > 1.2) this.audio.crash();
      }
    }
    for (const e of kev) {
      if (e.impact > 0.3) this.rules.collision('kerb', e.impact);
    }
    for (const ai of this.traffic.cars) {
      const dx = ai.x - car.x, dz = ai.z - car.z;
      if (Math.abs(dx) > 14 || Math.abs(dz) > 14) continue;
      const aF = { x: Math.sin(ai.heading), z: Math.cos(ai.heading) };
      for (const pc of car.circles()) {
        for (let t = -1; t <= 1; t++) {
          const ax = ai.x + aF.x * t * (ai.length / 2 - ai.width / 2);
          const az = ai.z + aF.z * t * (ai.length / 2 - ai.width / 2);
          const d = Math.hypot(pc.x - ax, pc.z - az);
          const m = pc.r + ai.width / 2;
          if (d < m && d > 0.001) {
            car.x += ((pc.x - ax) / d) * (m - d);
            car.z += ((pc.z - az) / d) * (m - d);
            if (Math.abs(car.speed) > 0.8 || ai.speed > 0.8) {
              this.rules.collision('vehicle', 3);
              this.audio.crash();
            }
            car.speed *= 0.2;
          }
        }
      }
    }
    for (const p of this.traffic.peds) {
      if (Math.hypot(p.x - car.x, p.z - car.z) < this.spec.width / 2 + 0.4 && Math.abs(car.speed) > 0.5) {
        this.rules.collision('ped', 2);
      }
    }

    // Indicators & Hazard Blinker + Relay Tick-Tock Sound
    if (this.indicator !== 0) {
      this.indYaw += car.yawRate * dt;
      if (Math.abs(this.indYaw) > 1.0 && Math.abs(this.steerIn) < 0.08) this.setIndicator(0);
    }
    const anySignal = this.indicator !== 0 || this.hazard;
    if (anySignal) {
      this.blinkT += dt;
    } else {
      this.blinkT = 0;
    }
    const blinkOn = anySignal && Math.floor(this.blinkT * 2.8) % 2 === 0;
    if (anySignal && blinkOn !== this.lastBlink) {
      this.audio.tick(blinkOn);
    }
    this.lastBlink = blinkOn;

    // Rules update
    if (!this.ended && this.phase !== 'precheck' && !inOuterProvingGround) {
      this.rules.update(
        dt,
        {
          x: car.x,
          z: car.z,
          heading: car.heading,
          speed: car.speed,
          kmh: car.kmh,
          accel: car.accel,
          length: this.spec.length,
          width: this.spec.width,
          indicator: this.indicator,
          horn: this.horn,
          seatbelt: this.seatbelt,
          handbrake: this.handbrakeOn,
          headlights: this.headlights,
          night,
          onPavement: onPave,
          loc,
        },
        this.traffic.signals,
        this.traffic.peds,
        this.world.crossings,
        this.traffic.cars,
      );
    } else if (inOuterProvingGround) {
      this.rules.limit = getTerrainInfo(car.x, car.z).limit;
    }

    this.tickChallenge(dt);

    if (this.arrived && Math.abs(car.speed) < 0.3 && !this.ended) {
      this.finish(null, this.mode === 'challenge' ? 'Night & Rain Storm Exam' : 'NTSA Practical Driving Test', [
        `Route: ${this.route?.ruleText ?? ''}`,
        `Wrong-route deviations: ${this.rules.wrongRouteCount}`,
      ]);
    }
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        this.finish(false, this.mode === 'test' ? 'NTSA Practical Driving Test' : this.challenge?.title ?? 'Challenge', [
          'Assessment terminated by Chief Instructor zingri_master due to a serious fault.',
        ]);
      }
    }

    // Update 3D Vehicle Visuals (Position, Elevation y, Pitch, Roll, Wheels, Steering + Hands, Lamps, Halos, Headlight Cones!)
    const r = this.rig;
    r.root.position.set(car.x, car.y + (onPave ? 0.18 : 0), car.z);
    r.root.rotation.y = car.heading;
    r.body.rotation.x = car.pitch;
    const isTwoWheel = this.spec.kind === 'moped' || this.spec.kind === 'moto';
    r.body.rotation.z = isTwoWheel ? car.roll : -car.roll;
    for (const w of r.wheels) {
      if (w.front) w.pivot.rotation.y = car.steer;
      w.spin.rotation.x = car.wheelSpin / w.r;
    }
    if (r.steering) {
      r.steering.rotation.z = -car.steer * 6.5;
    }

    r.brakeMat.emissiveIntensity = (this.brakeIn > 0.05 && Math.abs(car.speed) > 0.05) || this.handbrakeOn ? 3.5 : this.headlights ? 0.9 : 0.3;
    r.revMat.emissiveIntensity = car.reversing ? 3.0 : 0;

    const leftFlash = (this.indicator === 1 || this.hazard) && blinkOn;
    const rightFlash = (this.indicator === -1 || this.hazard) && blinkOn;
    r.indL.emissiveIntensity = leftFlash ? 5.0 : 0;
    r.indR.emissiveIntensity = rightFlash ? 5.0 : 0;
    r.indL.color.setHex(leftFlash ? 0xffaa00 : 0x553000);
    r.indR.color.setHex(rightFlash ? 0xffaa00 : 0x553000);
    for (const h of r.indHalosL) h.visible = leftFlash;
    for (const h of r.indHalosR) h.visible = rightFlash;

    r.headMat.emissiveIntensity = this.headlights ? 5.0 : 0.25;
    for (const cone of r.headlightCones) cone.visible = this.headlights;
    if (this.spot) this.spot.visible = this.headlights;

    this.audio.engine(car.rpm, this.throttleIn, car.engineOn, this.spec.engineTone);
    if (this.flashT > 0) this.flashT -= dt;
    this.updateCamera(dt);
    this.world.update(new THREE.Vector3(car.x, car.y, car.z), dt);
    (this.beacon.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(this.elapsed * 3) * 0.06;
  }

  attractCam(dt: number) {
    this.cineT += dt * 0.05;
    const R = 150;
    const cx = Math.cos(this.cineT) * R, cz = Math.sin(this.cineT) * R * 0.8;
    this.camera.position.set(cx + 60, 55 + Math.sin(this.cineT * 2) * 10, cz);
    this.camLook.set(60 + Math.cos(this.cineT + 0.8) * 40, 0, Math.sin(this.cineT + 0.8) * 30);
    this.camera.lookAt(this.camLook);
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
  }

  updateCamera(dt: number) {
    const car = this.car!, r = this.rig!;
    const cam = this.camera;
    const f = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
    const pos = new THREE.Vector3(car.x, car.y, car.z);
    this.world.boardLabels.visible = this.cam === 'board';
    this.boardArrow.visible = this.cam === 'board';
    const fog = this.world.scene.fog as THREE.Fog;
    if (this.cam === 'board') {
      fog.near = 2500;
      fog.far = 6000;
    } else {
      this.world.setWeather(this.world.weather);
    }

    let fov: number;
    if (this.cam === 'chase') {
      const L = this.spec.length;
      const dist = 4.5 + L * 0.9;
      const h = 1.8 + this.spec.height * 0.9;
      const back = this.lookBack ? -1 : 1;
      const want = pos.clone().addScaledVector(f, -dist * back).add(new THREE.Vector3(0, h, 0));
      this.camPos.lerp(want, 1 - Math.exp(-dt * 5));
      cam.position.copy(this.camPos);
      this.camLook.copy(pos).addScaledVector(f, 3 * back).add(new THREE.Vector3(0, 1.2, 0));
      cam.lookAt(this.camLook);
      fov = 60 + Math.min(12, car.kmh * 0.12);
    } else if (this.cam === 'cockpit' || this.cam === 'hood') {
      const local = (this.cam === 'cockpit' ? r.cockpit : r.hood).clone();
      r.root.updateMatrixWorld();
      const wp = local.clone().applyMatrix4(r.body.matrixWorld);
      cam.position.copy(wp);
      this.camPos.copy(wp);
      const look = local.clone().add(new THREE.Vector3(this.steerIn * 0.8, -0.32, this.lookBack ? -10 : 10)).applyMatrix4(r.body.matrixWorld);
      cam.lookAt(look);
      fov = this.cam === 'cockpit' ? 74 : 66;
    } else if (this.cam === 'board') {
      cam.position.lerp(new THREE.Vector3(car.x * 0.25, 560, car.z * 0.25 + 170), 1 - Math.exp(-dt * 3));
      cam.lookAt(car.x * 0.25, 0, car.z * 0.25);
      fov = 50;
      this.boardArrow.position.set(car.x, car.y + 14, car.z);
      this.boardArrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f);
    } else {
      this.cineT += dt * 0.25;
      const d = 8 + this.spec.length;
      const want = pos.clone().add(new THREE.Vector3(Math.cos(this.cineT) * d, 2.2 + Math.sin(this.cineT * 0.7) * 1.5, Math.sin(this.cineT) * d));
      this.camPos.lerp(want, 1 - Math.exp(-dt * 3));
      cam.position.copy(this.camPos);
      cam.lookAt(pos.clone().add(new THREE.Vector3(0, 1, 0)));
      fov = 45;
    }
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------ HUD Snapshot
  snapshot(): Snapshot {
    const car = this.car;
    const loc = car ? locate(car.x, car.z) : null;
    let laneInfo = '', roadName = '';
    if (car && loc) {
      if (loc.kind === 'edge') {
        const e = loc.edge!;
        const r = ROAD[e.type];
        roadName = e.name;
        const dir = Math.sin(car.heading) * e.dx + Math.cos(car.heading) * e.dz >= 0 ? 1 : -1;
        const side = -dir * loc.lat!;
        if (r.dual) {
          const lane = Math.max(1, Math.min(r.lanes, r.lanes - Math.floor((side - r.reserve / 2) / r.laneW)));
          laneInfo = side < 0 ? '⚠ WRONG CARRIAGEWAY' : `Lane ${lane} of ${r.lanes} · ${e.type === 'major' ? 'Major' : 'Minor'} road`;
        } else if (e.type === 'two') {
          laneInfo = side < -0.3 ? '⚠ Right side (overtaking)' : 'Left lane · Two-way road';
        } else {
          laneInfo = 'Parking zone';
        }
      } else if (loc.kind === 'node') {
        roadName = loc.node!.label;
        laneInfo = loc.node!.kind === 'round' ? 'Roundabout · clockwise · no stopping' : 'Junction box';
      } else if (loc.kind === 'lot') {
        roadName = loc.lot === 'p1' ? 'Angle Parking P1' : 'Flush Parking P2';
        laneInfo = 'Parking zone · 10 km/h';
      } else {
        roadName = car.biome === 'cbd' ? 'Off-road / Kerb' : car.biomeLabel;
        laneInfo = car.biome === 'cbd' ? '⚠ Off the carriageway' : `Grip ${Math.round(car.surfaceGrip * 100)}% · Slope ${Math.round(car.slopeGrade * 100)}%`;
      }
    }

    let instruction = '', nextDist = 0;
    if (this.route && car) {
      const i = this.rules.routeIdx;
      const cur = this.route.states[i];
      const nx = this.route.states[i + 1];
      const tn = NODES[dTo(cur)];
      nextDist = Math.hypot(tn.x - car.x, tn.z - car.z);
      if (this.settings.hints || this.mode === 'challenge') {
        instruction = nx ? describeTurn(cur, nx) : `Destination ahead: ${this.nodeName(this.dest)}`;
      } else {
        instruction = `Proceed to ${this.nodeName(this.dest)} using the correct MTB route`;
      }
    }

    let signal: Snapshot['signal'] = null;
    if (car && loc?.kind === 'edge') {
      const e = loc.edge!;
      const dir = Math.sin(car.heading) * e.dx + Math.cos(car.heading) * e.dz >= 0 ? 1 : -1;
      const to = dir === 1 ? e.b : e.a;
      const ctl = approachControl(to, e.id);
      const rem = dir === 1 ? e.len - e.trimB - loc.along! : loc.along! - e.trimA;
      if (ctl === 'signal' && rem < 120) signal = { state: this.traffic.signals.state(to, e.horizontal ? 'h' : 'v'), dist: rem };
      else if (ctl === 'stop' && rem < 80) signal = { state: 'stop', dist: rem };
      else if (ctl === 'giveway' && rem < 80) signal = { state: 'giveway', dist: rem };
    }

    const anySignal = this.indicator !== 0 || this.hazard;
    const blinkOn = anySignal && Math.floor(this.blinkT * 2.8) % 2 === 0;
    const hr = Math.floor(this.world.cycleHour);
    const mn = Math.floor((this.world.cycleHour % 1) * 60);
    const clockStr = this.world.time === 'cycle'
      ? `${hr.toString().padStart(2, '0')}:${mn.toString().padStart(2, '0')}`
      : this.world.time.toUpperCase();

    return {
      mode: this.mode,
      phase: this.phase,
      kmh: car?.kmh ?? 0,
      gear: car?.gearLabel ?? 'N',
      rpm: car?.rpm ?? 0,
      redlineRpm: this.spec.redlineRpm,
      limit: this.rules.limit,
      indicator: this.indicator,
      hazard: this.hazard,
      blinkOn,
      headlights: this.headlights,
      wipers: this.wipers,
      horn: this.horn,
      seatbelt: this.seatbelt,
      engineOn: car?.engineOn ?? false,
      handbrake: this.handbrakeOn,
      mirrors: this.mirrors,
      cam: this.cam,
      score: this.rules.score(),
      faults: this.rules.offenses.length,
      time: this.elapsed,
      instruction,
      nextDist,
      laneInfo,
      roadName,
      biomeLabel: car?.biomeLabel ?? '🏙️ Nairobi CBD',
      slopePct: Math.round((car?.slopeGrade ?? 0) * 100),
      gripPct: Math.round((car?.surfaceGrip ?? 1) * 100),
      x: car?.x ?? 0,
      z: car?.z ?? 0,
      heading: car?.heading ?? 0,
      route: this.route ? this.route.nodes : null,
      routeIdx: this.rules.routeIdx,
      dest: this.dest,
      destName: this.dest ? this.nodeName(this.dest) : '',
      blocked: this.blockedIds,
      flash: this.flashT > 0 ? this.flash : '',
      challenge: this.challenge?.title ?? '',
      objective: this.objective,
      signal,
      paused: this.paused,
      ruleText: this.route?.ruleText ?? '',
      vehicle: `Class ${this.spec.cls} · ${this.spec.name}`,
      vehicleId: this.spec.id,
      maxGears: this.spec.gears,
      transMode: this.settings.trans,
      autoPos: car?.autoPos ?? 'D',
      seqGear: car?.seqGear ?? 1,
      hGear: car?.hGear ?? 1,
      clutch: car?.clutch ?? 0,
      clutchBiteActive: Boolean(this.keys.has('q') && this.keys.has('shift')),
      weather: this.world.weather,
      clockStr,
      rainDrops: this.rainDrops,
      taxiComfort: this.challenge?.id === 'taxi' ? Math.round((this.chState.comfort as number) ?? 100) : null,
      startText: this.startText,
      bay: this.targetBay ? { x: this.targetBay.x, z: this.targetBay.z } : null,
      aiCars: this.traffic.cars.map(c => ({ x: c.x, z: c.z })),
    };
  }
}
export { halfWidth };
