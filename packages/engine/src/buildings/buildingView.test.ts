import { InstancedMesh } from "three";
import { describe, expect, it } from "vitest";
import { BuildingView } from "./buildingView.ts";
import type { BuildingFootprint, QuarterTurns } from "./footprint.ts";

const CELL_M = 5;
const flat = (): number => 10;
const TURNS: readonly QuarterTurns[] = [0, 1, 2, 3];

const footprint = (over: Partial<BuildingFootprint>): BuildingFootprint => ({
  id: 1,
  cellX: 10,
  cellY: 10,
  width: 3,
  depth: 3,
  rotation: 0,
  heightM: 6,
  ...over,
});

const FACILITIES = [
  "farm",
  "lumber_camp",
  "mine",
  "smelter",
  "kitchen",
  "workshop",
  "sawmill",
  "kiln",
  "stockpile",
  "storehouse",
  "warehouse",
  "grand_warehouse",
  "temple",
  "biotech_lab",
  "government_hall",
  "hospital",
];

describe("BuildingView", () => {
  it("건물 수와 상관없이 도형마다 InstancedMesh 하나(그리기 호출 ≤ 7)", () => {
    const view = new BuildingView();
    const buildings = FACILITIES.flatMap((facility, i) =>
      TURNS.map((rotation) =>
        footprint({
          id: i * 4 + rotation + 1,
          cellX: (i % 8) * 12,
          cellY: Math.floor(i / 8) * 12 + rotation * 30,
          rotation,
          look: { facility, level: 1 + rotation, accent: rotation, state: rotation === 3 ? "damaged" : "ok" },
        }),
      ),
    );
    view.set(buildings, CELL_M, flat);
    const meshes = view.group.children.filter((child) => child instanceof InstancedMesh);
    expect(meshes.length).toBeLessThanOrEqual(7);
    expect(meshes.length).toBeGreaterThanOrEqual(5);
    expect(view.count).toBe(buildings.length);
    const instances = meshes.reduce((sum, mesh) => sum + (mesh instanceof InstancedMesh ? mesh.count : 0), 0);
    expect(instances).toBe(view.parts);
    // 다시 넣으면 앞의 것을 버리고 새로 만든다
    view.set(buildings.slice(0, 2), CELL_M, flat);
    expect(view.count).toBe(2);
    view.set([], CELL_M, flat);
    expect(view.group.children.length).toBe(0);
    view.dispose();
  });

  it("누르기: 위에서 판 위를 누르면 그 건물(판 안 자리), 판 밖이면 null, 앞의 건물이 가린다", () => {
    const view = new BuildingView();
    view.set(
      [
        footprint({ id: 5, cellX: 10, cellY: 10, look: { facility: "storehouse" } }),
        footprint({
          id: 6,
          cellX: 20,
          cellY: 10,
          width: 2,
          depth: 2,
          rotation: 1,
          look: { facility: "temple" },
        }),
      ],
      CELL_M,
      flat,
    );
    const down = { x: 0, y: -1, z: 0 };
    const hit = view.pick({ x: 51, y: 100, z: 64 }, down);
    expect(hit?.id).toBe(5);
    expect(hit?.x).toBeCloseTo(51);
    expect(hit?.z).toBeCloseTo(64);
    expect(view.pick({ x: 105, y: 100, z: 55 }, down)?.id).toBe(6);
    expect(view.pick({ x: 80, y: 100, z: 64 }, down)).toBeNull();
    // 옆에서(+x 쪽에서 -x로) 보면 가까운 건물(6)이 먼저 가린다
    const side = view.pick({ x: 200, y: 11, z: 55 }, { x: -1, y: 0, z: 0 });
    expect(side?.id).toBe(6);
    view.dispose();
  });

  it("밤 정도는 0~1로 자르고, 이상한 값은 낮(0)으로 본다", () => {
    const view = new BuildingView();
    expect(() => {
      view.setNight(2);
      view.setNight(-1);
      view.setNight(Number.NaN);
    }).not.toThrow();
    view.dispose();
  });
});
