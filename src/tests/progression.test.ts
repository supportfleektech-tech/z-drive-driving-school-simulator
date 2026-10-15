import { describe, it, expect } from "vitest";
import {
  recordSessionResult,
  loadProgression,
  saveProgression,
  driverRankTitle,
  buildLeaderboard,
  isClassUnlockedForFreeRoam,
  ALL_CLASS_IDS,
  defaultClassState,
} from "../game/progression";
import type { ProgressionData } from "../game/progression";

describe("Progression", () => {
  const base: ProgressionData = {
    driverName: "Test_Driver",
    totalMerits: 0,
    expeditionBestSec: null,
    instructorOverride: false,
    classes: Object.fromEntries(ALL_CLASS_IDS.map((id) => [id, defaultClassState(id)])),
  };

  it("recordSessionResult test pass earns merits and sets task[1]", () => {
    const result = recordSessionResult(base, "C1", "test", true, 85, 0, 5000);
    const updated = result.updated.classes["C1"];
    expect(updated.tasks[1]).toBe(true);
    expect(updated.testsPassed).toBe(1);
    expect(updated.bestScore).toBe(85);
    expect(result.meritsEarned).toBeGreaterThan(0);
  });

  it("challenge pass sets task[0]", () => {
    const result = recordSessionResult(base, "C1", "challenge", true, 90, 0, 8000, "hillstart");
    const updated = result.updated.classes["C1"];
    expect(updated.tasks[0]).toBe(true);
    expect(updated.challengesPassed).toBe(1);
  });

  it("clean drive >= 80 with 0 faults sets task[2]", () => {
    const result = recordSessionResult(base, "C1", "test", true, 88, 0, 3000);
    const updated = result.updated.classes["C1"];
    expect(updated.tasks[2]).toBe(true);
    expect(updated.cleanDrives).toBe(1);
  });

  it("all 3 tasks true licenses the class", () => {
    let data = base;
    data = recordSessionResult(data, "C1", "challenge", true, 90, 0, 2000, "hillstart").updated;
    data = recordSessionResult(data, "C1", "test", true, 85, 0, 4000).updated;
    data = recordSessionResult(data, "C1", "test", true, 88, 0, 5000).updated;
    expect(data.classes["C1"].licensed).toBe(true);
  });

  it("failed test does not set task[1]", () => {
    const result = recordSessionResult(base, "C1", "test", false, 50, 3, 2000);
    expect(result.updated.classes["C1"].tasks[1]).toBe(false);
  });

  it("driverRankTitle tiers", () => {
    expect(driverRankTitle(0, 0).title).toContain("Provisional Learner");
    expect(driverRankTitle(2400, 15).title).toContain("Grandmaster Captain");
    expect(driverRankTitle(1500, 10).title).toContain("Senior Commercial");
  });

  it("buildLeaderboard includes player and ranks", () => {
    const lb = buildLeaderboard(base);
    expect(lb.some((r) => r.isPlayer)).toBe(true);
    expect(lb[0].rank).toBe(1);
    expect(lb.every((r, i) => r.rank === i + 1)).toBe(true);
  });

  it("isClassUnlockedForFreeRoam respects instructorOverride", () => {
    const overriden = { ...base, instructorOverride: true };
    expect(isClassUnlockedForFreeRoam(overriden, "C1")).toBe(true);
    expect(isClassUnlockedForFreeRoam(base, "B1")).toBe(true); // starter licensed
    expect(isClassUnlockedForFreeRoam(base, "C1")).toBe(false);
  });

  it("load/save round trip", () => {
    saveProgression(base);
    const loaded = loadProgression();
    expect(loaded.driverName).toBe("Test_Driver");
    expect(Object.keys(loaded.classes).length).toBe(ALL_CLASS_IDS.length);
  });
});
