import { describe, it, expect } from "vitest";
import { planMTB, classifyTurn, getTerrainInfo, ROAD, NODES } from "../game/map";
import type { DEdge } from "../game/map";

const start: DEdge = { e: "e22", dir: 1 };

describe("MTB Route Planner", () => {
  it("plans a Rule 1 route without parking", () => {
    const route = planMTB(start, "K", new Set());
    expect(route).not.toBeNull();
    expect(route!.rule).toBe(1);
    expect(route!.usesParking).toBe(false);
    expect(route!.ruleText).toContain("Rule 1");
  });

  it("finds an alternate route when edges are blocked (Rule 1 or 2)", () => {
    const blocked = new Set(["e17", "e18"]);
    const route = planMTB(start, "K", blocked);
    expect(route).not.toBeNull();
    expect([1, 2, 3]).toContain(route!.rule);
    expect(route!.usesParking).toBe(route!.rule === 3);
  });

  it("returns null when no route exists", () => {
    const route = planMTB(start, "ZZZ", new Set());
    expect(route).toBeNull();
  });

  it("classifyTurn straight", () => {
    const t = classifyTurn({ e: "e1", dir: 1 }, { e: "e2", dir: 1 });
    expect(t.kind).toBe("straight");
  });
});

describe("Terrain", () => {
  it("CBD biome default", () => {
    const t = getTerrainInfo(0, 0);
    expect(t.biome).toBe("cbd");
    expect(t.limit).toBe(50);
  });

  it("highway biome limit 100", () => {
    const t = getTerrainInfo(-100, -300);
    expect(t.biome).toBe("highway");
    expect(t.limit).toBe(100);
  });
});

describe("Road types", () => {
  it("major road has 4 lanes, limit 60", () => {
    expect(ROAD.major.lanes).toBe(4);
    expect(ROAD.major.limit).toBe(60);
  });
});

describe("Nodes exist", () => {
  it("has expected Nairobi CBD nodes", () => {
    expect(NODES.A).toBeDefined();
    expect(NODES.K).toBeDefined();
    expect(NODES.R1.kind).toBe("round");
  });
});
