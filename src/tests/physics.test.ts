import { describe, it, expect } from "vitest";
import { CarPhysics } from "../game/physics";
import { VEHICLES } from "../game/vehicles";

describe("CarPhysics", () => {
  it("places car and reports kmh zero", () => {
    const spec = VEHICLES.find((v) => v.id === "B1")!;
    const car = new CarPhysics(spec);
    car.place(0, 0, 0);
    expect(car.kmh).toBe(0);
    expect(car.speed).toBe(0);
    expect(car.engineOn).toBe(true);
  });

  it("auto D accelerates forward with throttle", () => {
    const spec = VEHICLES.find((v) => v.id === "B1")!;
    const car = new CarPhysics(spec, "auto");
    car.setAutoPos("D");
    const controls = { throttle: 1, brake: 0, steer: 0, handbrake: false, clutchKey: false, clutchBiteKey: false };
    car.step(0.1, controls, 1.0, 1.0);
    expect(car.speed).toBeGreaterThan(0);
  });

  it("handbrake stops the car", () => {
    const spec = VEHICLES.find((v) => v.id === "B1")!;
    const car = new CarPhysics(spec, "auto");
    car.setAutoPos("D");
    let c = { throttle: 1, brake: 0, steer: 0, handbrake: false, clutchKey: false, clutchBiteKey: false };
    car.step(0.2, c, 1.0, 1.0);
    const moving = car.speed;
    c = { throttle: 0, brake: 0, steer: 0, handbrake: true, clutchKey: false, clutchBiteKey: false };
    car.step(0.5, c, 1.0, 1.0);
    expect(Math.abs(car.speed)).toBeLessThan(moving);
  });

  it("manual requires clutch to shift", () => {
    const spec = VEHICLES.find((v) => v.id === "B2")!;
    const car = new CarPhysics(spec, "manual");
    const ok = car.setHGear(2);
    expect(ok).toBe(false);
    expect(car.justGrinded).toBe(true);
  });

  it("gearLabel reflects state", () => {
    const spec = VEHICLES.find((v) => v.id === "B1")!;
    const car = new CarPhysics(spec, "auto");
    car.setAutoPos("P");
    expect(car.gearLabel).toBe("P");
    car.setAutoPos("R");
    expect(car.gearLabel).toBe("R");
  });
});
