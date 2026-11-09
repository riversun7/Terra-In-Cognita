import { describe, expect, it } from "vitest";
import { createPartGeometry } from "./buildingGeometry.ts";
import {
  BUILDING_ART_KINDS,
  BUILDING_CONDITIONS,
  type BuildingArtKind,
  artKindOf,
  resolveLook,
} from "./buildingLook.ts";
import { type ModelInput, buildingModel } from "./buildingModels.ts";
import {
  FACILITY_LOOK_COLORS,
  FACILITY_LOOK_MODELS,
  type FacilityLookColor,
} from "@terra/shared/facilityLook";
import { BUILDING_COLORS, LOOK_COLORS, NATION_ACCENTS, WINDOW_DARK, lookColor } from "./buildingPalette.ts";
import { type BuildingPart, PART_SHAPES, type PartShape, partBounds } from "./buildingParts.ts";

/** 배치 칸 평균(m) — 지형 칸 11.72m ÷ 2 */
const CELL_M = 5.86;
const SIZES: readonly [number, number][] = [
  [2, 2],
  [3, 2],
  [2, 3],
  [3, 3],
  [4, 4],
  [5, 5],
];

const input = (over: Partial<ModelInput>): ModelInput => ({
  kind: "house",
  widthM: 3 * CELL_M,
  depthM: 3 * CELL_M,
  level: 1,
  state: "ok",
  accent: null,
  seed: 7,
  ...over,
});

/** 도형마다 꼭짓점 수(지오메트리를 한 번 만들어 센다) */
const VERTICES = new Map<PartShape, number>(
  PART_SHAPES.map((shape) => {
    const geometry = createPartGeometry(shape);
    const count = geometry.getAttribute("position").count;
    geometry.dispose();
    return [shape, count];
  }),
);

const pad = (parts: readonly BuildingPart[]) => parts.find((part) => part.ground);
const top = (parts: readonly BuildingPart[]): number => Math.max(...parts.map((part) => part.y + part.sy));
const colorIn = (parts: readonly BuildingPart[], color: readonly number[]): boolean =>
  parts.some((part) => part.color.every((value, i) => Math.abs(value - (color[i] ?? 0)) < 1e-9));

describe("buildingModel", () => {
  it("모든 종류·크기·레벨·상태의 조각이 바닥 판 안에 들고, 크기가 양수·유한하다", () => {
    for (const kind of BUILDING_ART_KINDS)
      for (const [w, d] of SIZES)
        for (const level of [1, 2, 3, 5])
          for (const state of BUILDING_CONDITIONS) {
            const W = w * CELL_M;
            const D = d * CELL_M;
            const parts = buildingModel(input({ kind, widthM: W, depthM: D, level, state, accent: 2 }));
            expect(parts.length, `${kind} ${w}x${d} L${level} ${state}`).toBeGreaterThan(3);
            for (const part of parts) {
              const b = partBounds(part);
              const where = `${kind} ${w}x${d} L${level} ${state} ${part.shape}`;
              expect(b.x0, where).toBeGreaterThanOrEqual(-W / 2 - 1e-6);
              expect(b.x1, where).toBeLessThanOrEqual(W / 2 + 1e-6);
              expect(b.z0, where).toBeGreaterThanOrEqual(-D / 2 - 1e-6);
              expect(b.z1, where).toBeLessThanOrEqual(D / 2 + 1e-6);
              expect(b.y0, where).toBeGreaterThanOrEqual(0);
              for (const value of [part.sx, part.sy, part.sz]) {
                expect(Number.isFinite(value), where).toBe(true);
                expect(value, where).toBeGreaterThan(0);
              }
            }
          }
  });

  it("같은 입력이면 같은 조각(씨앗), 씨앗이 달라도 조각 수는 같다", () => {
    for (const kind of BUILDING_ART_KINDS) {
      const a = buildingModel(input({ kind, seed: 41 }));
      expect(buildingModel(input({ kind, seed: 41 }))).toEqual(a);
      // 좌우 뒤집기·색 고르기만 바뀐다(일반 집은 집 높이도 흔든다)
      expect(buildingModel(input({ kind, seed: 42 })).length).toBe(a.length);
    }
  });

  it("건물 하나의 꼭짓점·조각 수 상한(휴대폰 부담): 조각 ≤ 160, 꼭짓점 ≤ 8,000", () => {
    let worst = { parts: 0, vertices: 0, kind: "" };
    for (const kind of BUILDING_ART_KINDS)
      for (const [w, d] of SIZES)
        for (const state of BUILDING_CONDITIONS) {
          const parts = buildingModel(
            input({
              kind,
              widthM: w * CELL_M,
              depthM: d * CELL_M,
              level: 5,
              state,
              accent: 0,
              upgrading: true,
            }),
          );
          const vertices = parts.reduce((sum, part) => sum + (VERTICES.get(part.shape) ?? 0), 0);
          if (vertices > worst.vertices)
            worst = { parts: parts.length, vertices, kind: `${kind} ${w}x${d} ${state}` };
        }
    expect(worst.parts, worst.kind).toBeLessThanOrEqual(160);
    expect(worst.vertices, worst.kind).toBeLessThanOrEqual(8000);
  });

  it("종류마다 알아볼 조각: 밭 줄·통나무(눕힘)·갱도·굴뚝·첨탑 금 끝·연구소 반구·병원 십자·행정 기둥", () => {
    const has = (kind: BuildingArtKind, test: (part: BuildingPart) => boolean): boolean =>
      buildingModel(input({ kind })).some(test);
    expect(has("farm", (p) => p.color === BUILDING_COLORS.wheat || p.color === BUILDING_COLORS.crop)).toBe(
      true,
    );
    expect(has("farm", (p) => p.shape === "dome")).toBe(true);
    expect(has("lumber", (p) => p.shape === "cylinder" && p.lay && p.color === BUILDING_COLORS.log)).toBe(
      true,
    );
    expect(has("mine", (p) => p.color === BUILDING_COLORS.shaft)).toBe(true);
    expect(has("mine", (p) => p.color === BUILDING_COLORS.ore)).toBe(true);
    expect(has("smelter", (p) => p.shape === "cylinder" && p.sy >= 10)).toBe(true);
    expect(has("temple", (p) => p.shape === "cone" && p.color === BUILDING_COLORS.gold)).toBe(true);
    expect(has("lab", (p) => p.shape === "dome" && p.color === BUILDING_COLORS.glassDome)).toBe(true);
    expect(has("hospital", (p) => p.color === BUILDING_COLORS.crossRed)).toBe(true);
    expect(
      buildingModel(input({ kind: "government" })).filter((p) => p.shape === "cylinder").length,
    ).toBeGreaterThan(4);
    expect(has("kiln", (p) => p.shape === "dome")).toBe(true);
    expect(has("stockpile", (p) => p.color === BUILDING_COLORS.crate)).toBe(true);
  });

  it("레벨: 3부터 본채가 높아지고, 2부터 덧붙는 조각이 생긴다", () => {
    for (const kind of ["storehouse", "hospital", "house", "smelter"] as const) {
      const one = buildingModel(input({ kind, level: 1 }));
      const three = buildingModel(input({ kind, level: 3 }));
      expect(top(three), kind).toBeGreaterThan(top(one));
    }
    for (const kind of ["farm", "lumber", "mine", "temple", "government"] as const) {
      const one = buildingModel(input({ kind, level: 1 }));
      const two = buildingModel(input({ kind, level: 2 }));
      expect(two.length, kind).toBeGreaterThan(one.length);
    }
  });

  it("상태: 짓는 중은 비계 색 뼈대·창 불 꺼짐, 손상은 돌 조각, 멈춤은 창 불 꺼짐, 폐허는 낮다", () => {
    const building = buildingModel(input({ kind: "storehouse", state: "building" }));
    expect(colorIn(building, BUILDING_COLORS.scaffold)).toBe(true);
    expect(building.some((p) => p.shape === "gable")).toBe(false);
    const ok = buildingModel(input({ kind: "storehouse", state: "ok" }));
    const damaged = buildingModel(input({ kind: "storehouse", state: "damaged" }));
    expect(damaged.length).toBeGreaterThan(ok.length);
    // 손상은 색이 어둡다(벽 색 그대로인 조각이 없다)
    expect(colorIn(damaged, BUILDING_COLORS.wallWood)).toBe(false);
    const disabled = buildingModel(input({ kind: "storehouse", state: "disabled" }));
    const glows = disabled.filter((p) => p.shape === "glow");
    expect(glows.length).toBeGreaterThan(0);
    expect(glows.every((p) => p.color === WINDOW_DARK)).toBe(true);
    const ruin = buildingModel(input({ kind: "storehouse", state: "ruin" }));
    expect(top(ruin)).toBeLessThan(4);
  });

  it("국가 색: 깃발·용마루에 쓰고, 없으면(null) 그 색 조각이 없다. 멈춤·폐허는 깃발 없음", () => {
    const accent = NATION_ACCENTS[1] ?? [0, 0, 0];
    expect(colorIn(buildingModel(input({ kind: "storehouse", accent: 1 })), accent)).toBe(true);
    expect(colorIn(buildingModel(input({ kind: "storehouse", accent: null })), accent)).toBe(false);
    expect(colorIn(buildingModel(input({ kind: "storehouse", accent: 1, state: "disabled" })), accent)).toBe(
      false,
    );
    expect(colorIn(buildingModel(input({ kind: "farm", accent: 7 })), NATION_ACCENTS[1] ?? [])).toBe(true);
  });
});

describe("resolveLook", () => {
  it("시설 ID → 모델 종류(모르는 ID·없음은 일반 집), 레벨 0은 짓는 중, 레벨은 1~5", () => {
    expect(artKindOf("lumber_camp")).toBe("lumber");
    expect(artKindOf("grand_warehouse")).toBe("warehouse");
    expect(artKindOf("biotech_lab")).toBe("lab");
    expect(artKindOf("government_hall")).toBe("government");
    expect(artKindOf("future_thing")).toBe("house");
    expect(artKindOf("toString")).toBe("house");
    expect(artKindOf(null)).toBe("house");
    expect(resolveLook(undefined)).toEqual({
      kind: "house",
      level: 1,
      state: "ok",
      upgrading: false,
      accent: null,
      wall: null,
      roof: null,
      heightPm: 1000,
    });
    expect(resolveLook({ facility: "farm", level: 0 }).state).toBe("building");
    expect(resolveLook({ facility: "farm", level: 9, accent: 3 })).toMatchObject({ level: 5, accent: 3 });
    expect(resolveLook({ facility: "farm", level: 2, state: "ruin", upgrading: true }).upgrading).toBe(false);
    expect(resolveLook({ accent: -1 }).accent).toBeNull();
  });
});

describe("겉모습 자료(팩 facilities.look, 2026-11-09)", () => {
  it("이름표가 팩 스키마(@terra/shared)와 같다: 모델 종류 = 엔진 모델, 색 이름마다 색 표의 색", () => {
    expect([...BUILDING_ART_KINDS]).toEqual([...FACILITY_LOOK_MODELS]);
    expect(Object.keys(LOOK_COLORS).toSorted()).toEqual([...FACILITY_LOOK_COLORS].toSorted());
    for (const name of FACILITY_LOOK_COLORS) {
      const key = LOOK_COLORS[name];
      expect(BUILDING_COLORS[key], name).toBeDefined();
      expect(lookColor(name)).toEqual(BUILDING_COLORS[key]);
    }
    expect(lookColor("toString")).toBeNull();
    expect(lookColor(undefined)).toBeNull();
  });

  it("look.model이 시설 ID보다 먼저, 모르는 모델은 시설 ID로, 높이는 500~2000‰로 자른다", () => {
    expect(resolveLook({ facility: "farm", art: { model: "temple" } }).kind).toBe("temple");
    expect(resolveLook({ facility: "farm", art: {} }).kind).toBe("farm");
    // 옛 서버·덮어쓰기 줄이 모르는 이름을 주면 시설 ID로
    expect(resolveLook({ facility: "mine", art: JSON.parse('{"model":"castle"}') }).kind).toBe("mine");
    expect(resolveLook({ art: { wall: "brick", roof: "teal" } })).toMatchObject({
      wall: BUILDING_COLORS.wallBrick,
      roof: BUILDING_COLORS.roofTeal,
    });
    expect(resolveLook({ art: { heightPm: 9000 } }).heightPm).toBe(2000);
    expect(resolveLook({ art: { heightPm: 10 } }).heightPm).toBe(500);
    expect(resolveLook({ art: null }).heightPm).toBe(1000);
  });

  it("벽·지붕 색을 주면 집 모양 모델의 벽·지붕이 그 색이 되고, 주지 않으면 그대로다", () => {
    const pick: FacilityLookColor = "gold";
    const gold = BUILDING_COLORS.gold;
    const golden = (parts: readonly BuildingPart[]): number =>
      parts.filter((part) => colorIn([part], gold)).length;
    for (const kind of BUILDING_ART_KINDS) {
      const plain = buildingModel(input({ kind }));
      const walled = buildingModel(input({ kind, wall: lookColor(pick), roof: lookColor(pick) }));
      // 광산(바위 언덕)은 권양탑 지붕만, 나머지는 벽 또는 지붕이 금색이 된다
      expect(golden(walled), kind).toBeGreaterThan(golden(plain));
    }
    // 같은 입력·같은 씨앗이면 색만 다르고 조각 수·자리는 같다(씨앗 난수 차례를 바꾸지 않는다)
    const a = buildingModel(input({ kind: "house", seed: 11 }));
    const b = buildingModel(input({ kind: "house", seed: 11, wall: lookColor("brick") }));
    expect(b.map((part) => [part.shape, part.x, part.y, part.z])).toEqual(
      a.map((part) => [part.shape, part.x, part.y, part.z]),
    );
  });

  it("높이 배율은 바닥 판 위 조각의 높이를 곱하고 판은 그대로다", () => {
    const base = buildingModel(input({ kind: "warehouse" }));
    const tall = buildingModel(input({ kind: "warehouse", heightPm: 1500 }));
    expect(top(tall)).toBeCloseTo(0.3 + (top(base) - 0.3) * 1.5, 6);
    expect(pad(tall)).toEqual(pad(base));
  });
});

describe("part geometry", () => {
  it("단위 도형은 모두 [-0.5, 0.5]³ 안, 박공은 삼각 8개(꼭짓점 24)", () => {
    for (const shape of PART_SHAPES) {
      const geometry = createPartGeometry(shape);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      expect(box, shape).not.toBeNull();
      if (!box) continue;
      for (const value of [box.min.x, box.min.y, box.min.z])
        expect(value, shape).toBeGreaterThanOrEqual(-0.5 - 1e-6);
      for (const value of [box.max.x, box.max.y, box.max.z])
        expect(value, shape).toBeLessThanOrEqual(0.5 + 1e-6);
      geometry.dispose();
    }
    expect(VERTICES.get("gable")).toBe(24);
  });
});
