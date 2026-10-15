import type { VehicleSpec } from './vehicles';
import type { Obstacle } from './world';
import { getTerrainInfo, type BiomeKind } from './map';

export type TransMode = 'auto' | 'manual' | 'both';
export type AutoPos = 'P' | 'R' | 'N' | 'D' | 'M';

export interface Controls {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  clutchKey: boolean;      // 'Q' held
  clutchBiteKey: boolean;  // 'Q' + 'Left Shift' held (bite-point release zone)
}

export interface CollisionEvent {
  kind: 'solid' | 'kerb';
  impact: number;
  x: number;
  z: number;
}

export class CarPhysics {
  x = 0;
  y = 0;
  z = 0;
  heading = 0;
  speed = 0;
  steer = 0;
  yawRate = 0;
  accel = 0;
  rpm = 800;
  gearNo = 1;
  engineOn = true;
  handbrake = false;
  reversing = false;
  pitch = 0;
  roll = 0;
  wheelSpin = 0;
  odometer = 0;
  lastMoveDir = 1;
  stopHold = 0;

  // Transmission & Clutch state
  transMode: TransMode = 'auto';
  autoPos: AutoPos = 'D';
  seqGear = 1;     // 1..gears when in 'M' sequential mode
  hGear = 1;       // -1 = R, 0 = N, 1..6 = forward gears in H-shifter manual mode
  clutch = 0;      // 0 = fully engaged, 1 = fully depressed (Q), ~0.45 = bite-point zone (Q + Left Shift)
  uiClutch: number | null = null; // optional UI slider override
  hadBiteLaunch = false;
  justStalled = false;
  justGrinded = false;

  // Terrain & slope state
  slopeGrade = 0;
  biome: BiomeKind = 'cbd';
  biomeLabel = '🏙️ Nairobi CBD';
  surfaceGrip = 1.0;

  constructor(public spec: VehicleSpec, transMode?: TransMode) {
    this.rpm = spec.idleRpm;
    this.transMode = transMode ?? spec.defaultTrans;
  }

  get fwdX() { return Math.sin(this.heading); }
  get fwdZ() { return Math.cos(this.heading); }
  get kmh() { return Math.abs(this.speed) * 3.6; }

  get isManualActive() {
    return this.transMode === 'manual';
  }

  get gearLabel(): string {
    if (!this.engineOn) return 'OFF';
    if (this.transMode === 'manual') {
      if (this.hGear === -1) return 'M·R';
      if (this.hGear === 0) return 'M·N';
      return `M·${this.hGear}`;
    }
    if (this.autoPos === 'P') return 'P';
    if (this.autoPos === 'R') return 'R';
    if (this.autoPos === 'N') return 'N';
    if (this.autoPos === 'M') return `M${this.seqGear}`;
    if (this.speed < -0.2 || (this.reversing && Math.abs(this.speed) < 0.2)) return 'R';
    if (Math.abs(this.speed) < 0.2 && this.stopHold === 0) return 'D1';
    return `D${this.gearNo}`;
  }

  place(x: number, z: number, heading: number) {
    const t = getTerrainInfo(x, z);
    this.x = x;
    this.y = t.y;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.accel = 0;
    this.hadBiteLaunch = false;
  }

  setAutoPos(pos: AutoPos) {
    this.autoPos = pos;
    if (pos === 'R') this.reversing = true;
    else if (pos === 'D' || pos === 'M') this.reversing = false;
    if (pos === 'M') this.seqGear = Math.max(1, Math.min(this.spec.gears, this.gearNo));
  }

  shiftUp(): boolean {
    if (this.transMode === 'manual') {
      if (this.clutch < 0.55) {
        this.justGrinded = true;
        return false;
      }
      if (this.hGear < this.spec.gears) {
        this.hGear = this.hGear === -1 ? 0 : this.hGear + 1;
        return true;
      }
      return false;
    }
    // In Automatic or Both: switch to 'M' sequential if in 'D' and increment seqGear
    if (this.autoPos === 'D') {
      this.autoPos = 'M';
      this.seqGear = Math.min(this.spec.gears, this.gearNo + 1);
      return true;
    }
    if (this.autoPos === 'M' && this.seqGear < this.spec.gears) {
      this.seqGear++;
      return true;
    }
    return false;
  }

  shiftDown(): boolean {
    if (this.transMode === 'manual') {
      if (this.clutch < 0.55) {
        this.justGrinded = true;
        return false;
      }
      if (this.hGear > -1) {
        this.hGear--;
        return true;
      }
      return false;
    }
    if (this.autoPos === 'D') {
      this.autoPos = 'M';
      this.seqGear = Math.max(1, this.gearNo - 1);
      return true;
    }
    if (this.autoPos === 'M' && this.seqGear > 1) {
      this.seqGear--;
      return true;
    }
    return false;
  }

  setHGear(g: number): boolean {
    const clamped = Math.max(-1, Math.min(this.spec.gears, g));
    if (this.transMode === 'manual' && clamped !== 0 && this.clutch < 0.55 && this.engineOn) {
      this.justGrinded = true;
      return false;
    }
    this.hGear = clamped;
    if (clamped === 0) this.hadBiteLaunch = false;
    return true;
  }

  step(dt: number, c: Controls, surfacePenalty: number, wetFactor = 1.0) {
    const s = this.spec;
    const maxV = s.maxSpeed / 3.6;
    const v = this.speed;
    const spd = Math.abs(v);

    // Terrain & slope query
    const terr = getTerrainInfo(this.x, this.z);
    this.y += (terr.y - this.y) * Math.min(1, dt * 14);
    this.biome = terr.biome;
    this.biomeLabel = terr.biomeLabel;
    const grip = Math.max(0.32, terr.grip * wetFactor);
    this.surfaceGrip = grip;

    // Slope grade along current vehicle heading (positive = uphill)
    const slopeAlong = terr.slopeX * this.fwdX + terr.slopeZ * this.fwdZ;
    this.slopeGrade = slopeAlong;

    // Update Clutch position
    if (this.uiClutch !== null) {
      this.clutch = this.uiClutch;
    } else if (c.clutchBiteKey) {
      // Q + Left Shift = Bite-Point Release Zone (~0.42)
      this.clutch += (0.42 - this.clutch) * Math.min(1, dt * 8);
      if (c.throttle > 0.12) this.hadBiteLaunch = true;
    } else if (c.clutchKey) {
      // Q alone = Full Clutch In (1.0)
      this.clutch += (1.0 - this.clutch) * Math.min(1, dt * 14);
    } else {
      // Released = Engaged (0.0)
      this.clutch += (0.0 - this.clutch) * Math.min(1, dt * 9);
    }

    if (spd > 2.2) this.hadBiteLaunch = true;
    if (spd < 0.15 && this.clutch > 0.85) this.hadBiteLaunch = false;

    let a = 0;

    if (this.transMode === 'manual') {
      // ==================== MANUAL (CLUTCH + H-SHIFTER) ====================
      const g = this.hGear;
      const coupling = Math.max(0, Math.min(1, (0.88 - this.clutch) / 0.88)); // 0 when clutch in, 1 when engaged
      const inBiteZone = this.clutch >= 0.22 && this.clutch <= 0.68;

      if (this.engineOn) {
        if (g === 0 || this.clutch > 0.85) {
          // Neutral or clutch fully in: engine revs freely with gas!
          const freeRpm = s.idleRpm + c.throttle * (s.redlineRpm - s.idleRpm) * 0.92;
          this.rpm += (freeRpm - this.rpm) * Math.min(1, dt * 8);
        } else {
          // Gear ratio speed ceiling for current gear
          const gearMaxV = g === -1 ? Math.min(11, maxV * 0.28) : maxV * (0.24 + 0.76 * (g / s.gears));
          const dirSign = g === -1 ? -1 : 1;
          const signedV = v * dirSign;
          const ratioFrac = Math.max(0, signedV / Math.max(2, gearMaxV));

          const wheelRpm = s.idleRpm + ratioFrac * (s.redlineRpm - s.idleRpm);
          const freeRpm = s.idleRpm + c.throttle * (s.redlineRpm - s.idleRpm) * 0.92;
          const blendedRpm = wheelRpm * coupling + freeRpm * (1 - coupling);
          this.rpm += (blendedRpm - this.rpm) * Math.min(1, dt * 8);

          // Stall check: if clutch is dumped (< 0.16) at near-standstill without going through bite point + gas, or if overloaded in too high a gear at standstill
          const wrongDir = signedV < -0.6;
          const stallFromDump = spd < 1.2 && this.clutch < 0.16 && !this.hadBiteLaunch && c.throttle < 0.25;
          const stallFromHighGear = spd < 0.8 && g >= 3 && this.clutch < 0.20 && c.throttle < 0.6;
          if ((stallFromDump || stallFromHighGear || wrongDir) && !c.clutchKey) {
            this.engineOn = false;
            this.justStalled = true;
            this.rpm = 0;
          } else {
            // Drive force proportional to gear torque multiplier, throttle, and clutch coupling
            const gearTorqueMult = g === -1 ? 1.25 : (1.35 - 0.55 * ((g - 1) / Math.max(1, s.gears - 1)));
            const overspeedFade = Math.max(0, 1 - Math.pow(Math.max(0, signedV) / gearMaxV, 2.2));
            const biteAssist = inBiteZone ? 1.18 : 1.0;
            const driveAcc = s.accel * gearTorqueMult * c.throttle * coupling * overspeedFade * biteAssist * grip;
            a += dirSign * driveAcc;

            // Bite-point hill hold: when in bite zone with gas balanced, resists rolling backward!
            if (inBiteZone && c.throttle > 0.15 && v * dirSign < 0) {
              a += -v * 6.0 * coupling;
            }
            // Engine braking when off throttle in gear
            if (c.throttle < 0.05 && spd > 0.5) {
              a -= Math.sign(v) * 1.1 * coupling * gearTorqueMult;
            }
          }
        }
      } else {
        this.rpm += (0 - this.rpm) * Math.min(1, dt * 6);
      }

      // Footbrake in Manual always brakes (never auto-reverses!)
      if (c.brake > 0.01) {
        a -= Math.sign(v || 1) * s.brake * c.brake * grip;
        if (spd < 0.25) a = 0;
      }
      this.gearNo = Math.max(1, Math.abs(g));
      this.reversing = g === -1;
    } else {
      // ==================== AUTOMATIC (P–R–N–D–M) ====================
      const pos = this.autoPos;
      if (pos === 'P') {
        this.speed = 0;
        this.accel = 0;
        const targetRpm = this.engineOn ? s.idleRpm + c.throttle * (s.redlineRpm - s.idleRpm) * 0.6 : 0;
        this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 7);
        return;
      }
      if (pos === 'N') {
        const targetRpm = this.engineOn ? s.idleRpm + c.throttle * (s.redlineRpm - s.idleRpm) * 0.85 : 0;
        this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 7);
        if (c.brake > 0.01 && spd > 0.05) a -= Math.sign(v) * s.brake * c.brake * grip;
      } else if (pos === 'R') {
        this.reversing = true;
        if (this.engineOn && c.throttle > 0.01) {
          if (v <= 0.3) {
            if (v > -9.5) a -= s.accel * 0.75 * c.throttle * grip;
          } else {
            a -= s.brake * c.throttle * grip;
          }
        }
        if (c.brake > 0.01) {
          if (v < -0.1) a += s.brake * c.brake * grip;
          else if (this.engineOn && c.throttle < 0.01 && v > -6.5) a -= s.accel * 0.65 * c.brake * grip;
        }
      } else {
        // 'D' or 'M' (Sequential)
        const maxGearV = pos === 'M' ? maxV * (0.26 + 0.74 * (this.seqGear / s.gears)) : maxV;
        const gearMult = pos === 'M' ? (1.28 - 0.45 * ((this.seqGear - 1) / Math.max(1, s.gears - 1))) : 1.0;

        if (this.engineOn) {
          if (c.throttle > 0.01) {
            if (v >= -0.3) {
              this.reversing = false;
              const f = 1 - Math.pow(Math.max(0, v) / maxGearV, 2);
              a += s.accel * gearMult * c.throttle * Math.max(0, f) * (v < 3 ? 1.12 : 1) * grip;
            } else {
              a += s.brake * c.throttle * grip;
            }
          }
          if (c.brake > 0.01 && Math.abs(v) < 0.3) this.stopHold += dt;
          else if (c.brake < 0.01) this.stopHold = 0;

          if (c.brake > 0.01) {
            if (v > 0.3) a -= s.brake * c.brake * grip;
            else if (pos === 'D' && (v < -0.3 || this.stopHold > 0.35)) {
              this.reversing = true;
              if (v > -5.2) a -= s.accel * 0.62 * c.brake * grip;
            }
          }
        } else if (c.brake > 0.01) {
          a -= Math.sign(v) * s.brake * c.brake * grip;
        }
      }

      // Automatic / Sequential RPM & gear calculation
      const frac = Math.max(0, v) / maxV;
      if (pos === 'M') {
        this.gearNo = this.seqGear;
      } else {
        this.gearNo = Math.min(s.gears, 1 + Math.floor(frac * s.gears * 1.15));
      }
      const gFrac = pos === 'M'
        ? Math.min(1, Math.max(0, v) / (maxV * (this.seqGear / s.gears)))
        : (frac * s.gears * 1.15) % 1;
      const span = s.redlineRpm - s.idleRpm;
      const targetRpm = !this.engineOn
        ? 0
        : v < -0.1
        ? s.idleRpm + 300 + spd * 380
        : s.idleRpm + gFrac * span * (0.62 + 0.38 * c.throttle) + (c.throttle > 0 ? 280 : 0);
      this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 6);
    }

    // Slope gravity pullback! Uphill (slopeAlong > 0) pulls car backward (-a); downhill pulls forward (+a)
    if (Math.abs(slopeAlong) > 0.004) {
      a -= 9.81 * slopeAlong;
    }

    // Handbrake
    this.handbrake = Boolean(c.handbrake);
    if (c.handbrake) {
      a -= Math.sign(v || slopeAlong || 1) * 7.8;
      if (Math.abs(v) < 0.7 && c.throttle < 0.3) {
        a = 0;
      }
    }

    // Rolling resistance + biome drag + aero drag
    const biomeDrag = terr.drag * surfacePenalty;
    const roll = (0.18 + (biomeDrag - 1) * 1.65) * Math.sign(v);
    const aero = s.drag * v * Math.abs(v) * 30;
    a -= roll + aero;

    let nv = v + a * dt;

    // Prevent flat-ground braking/resistance from reversing direction on its own
    const onSlope = Math.abs(slopeAlong) > 0.015;
    if (!onSlope && c.throttle < 0.01 && !(c.brake > 0.01 && v <= 0.3 && !this.isManualActive)) {
      if (Math.sign(nv) !== Math.sign(v) && v !== 0) nv = 0;
    }
    if (c.handbrake && Math.abs(nv) < 0.45 && c.throttle < 0.25) nv = 0;
    if (!onSlope && Math.abs(nv) < 0.03 && c.throttle < 0.01 && c.brake < 0.01) nv = 0;

    this.accel = (nv - v) / Math.max(dt, 1e-4);
    this.speed = nv;

    // Steering with surface grip influence
    const spdNow = Math.abs(nv);
    const maxS = (s.maxSteer * (0.7 + 0.3 * grip)) / (1 + (spdNow * spdNow) / 240);
    const target = c.steer * maxS;
    const rate = 2.2 + (spdNow < 3 ? 1.2 : 0);
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));
    this.yawRate = (nv / s.wheelBase) * Math.tan(this.steer);
    this.heading += this.yawRate * dt;
    this.x += Math.sin(this.heading) * nv * dt;
    this.z += Math.cos(this.heading) * nv * dt;
    this.odometer += spdNow * dt;
    if (spdNow > 0.2) this.lastMoveDir = Math.sign(nv);

    // Body pitch (including terrain slope!) & roll
    const latAcc = nv * this.yawRate;
    const targetPitch = -this.accel * 0.006 - slopeAlong * 0.85;
    const isTwoWheel = s.kind === 'moped' || s.kind === 'moto';
    const targetRoll = isTwoWheel ? -Math.atan(latAcc / 9.8) : latAcc * 0.008;
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 6);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 6);
    this.wheelSpin += nv * dt;
  }

  circles() {
    const s = this.spec;
    const r = Math.max(0.4, s.width / 2);
    const n = Math.max(2, Math.round(s.length / s.width));
    const out: { x: number; z: number; r: number }[] = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : -s.length / 2 + r + ((s.length - 2 * r) * i) / (n - 1);
      out.push({ x: this.x + this.fwdX * t, z: this.z + this.fwdZ * t, r });
    }
    return out;
  }

  resolve(obs: Obstacle[]): CollisionEvent[] {
    const events: CollisionEvent[] = [];
    const reach = this.spec.length / 2 + 2;
    for (let iter = 0; iter < 2; iter++) {
      for (const o of obs) {
        if (o.enabled === false) continue;
        const ext = o.shape === 'circle' ? o.r! : Math.max(o.hw!, o.hd!);
        if (Math.abs(o.x - this.x) > reach + ext || Math.abs(o.z - this.z) > reach + ext) continue;
        for (const c of this.circles()) {
          let nx = 0, nz = 0, pen = 0;
          if (o.shape === 'circle') {
            const dx = c.x - o.x, dz = c.z - o.z;
            const d = Math.hypot(dx, dz);
            const m = c.r + o.r!;
            if (d < m && d > 1e-6) { nx = dx / d; nz = dz / d; pen = m - d; }
          } else {
            const qx = Math.max(o.x - o.hw!, Math.min(c.x, o.x + o.hw!));
            const qz = Math.max(o.z - o.hd!, Math.min(c.z, o.z + o.hd!));
            const dx = c.x - qx, dz = c.z - qz;
            const d = Math.hypot(dx, dz);
            if (d < c.r) {
              if (d > 1e-6) { nx = dx / d; nz = dz / d; pen = c.r - d; }
              else {
                const px = o.hw! - Math.abs(c.x - o.x), pz = o.hd! - Math.abs(c.z - o.z);
                if (px < pz) { nx = Math.sign(c.x - o.x) || 1; pen = px + c.r; }
                else { nz = Math.sign(c.z - o.z) || 1; pen = pz + c.r; }
              }
            }
          }
          if (pen > 0) {
            this.x += nx * pen;
            this.z += nz * pen;
            const vx = this.fwdX * this.speed, vz = this.fwdZ * this.speed;
            const impact = -(vx * nx + vz * nz);
            if (impact > 0) {
              events.push({ kind: o.kind, impact, x: c.x - nx * c.r, z: c.z - nz * c.r });
              this.speed *= o.kind === 'solid' ? 0.25 : 0.55;
            }
          }
        }
      }
    }
    return events;
  }
}
