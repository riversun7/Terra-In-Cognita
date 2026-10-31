// 2차맵 소품(map_props) 분류 시험 — 배치 방식별 필드, 곡선 순서·범위, 그림 종류, 덩이 크기, 바이옴 참조·중복
import { describe, expect, it } from "vitest";
import { fixture, named } from "../testFixtures.ts";
import { validatePack } from "./pack.ts";

const BIOMES = [
  { ...named("taiga"), color: "#3d6b4f", forestDensity: 170, rule: { kind: "land" } },
  { ...named("desert"), color: "#d9c27a", forestDensity: 0, rule: { kind: "land" } },
];

const forest = (extra: Record<string, unknown> = {}) => ({
  ...named("forest_conifer"),
  placement: "forest",
  art: "tree_conifer",
  biomes: [{ biome: "taiga", weight: 900 }],
  ...extra,
});

const scatter = (extra: Record<string, unknown> = {}) => ({
  ...named("boulder"),
  placement: "scatter",
  art: "boulder",
  cover: 2,
  biomes: [{ biome: "desert", weight: 10 }],
  clump: { cells: 16, threshold: 600 },
  maxShare: 30,
  curves: { slopePct: { min: 0, idealMin: 10, idealMax: 200, max: 600 } },
  ...extra,
});

const problems = (props: unknown[]) =>
  validatePack(
    fixture({ "biomes.json": { entries: BIOMES }, "map_props.json": { entries: props } }),
  ).issues.map((issue) => [issue.stage, issue.id, issue.path, issue.message]);

describe("map_props 분류", () => {
  it("숲·흩기 항목이 통과한다", () => {
    expect(problems([forest(), scatter()])).toEqual([]);
  });

  it("숲 항목에는 엄폐 값·덩이·몫 상한이 없다(숲 나누기가 정한다)", () => {
    const issues = problems([forest({ cover: 1 })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.[3]).toContain("cover");
  });

  it("흩기 항목은 엄폐 값이 0·1·2 가운데 하나여야 한다", () => {
    expect(problems([scatter({ cover: 3 })])[0]?.[3]).toContain("엄폐 값");
    expect(problems([scatter({ cover: undefined })])).toHaveLength(1);
  });

  it("곡선은 min ≤ idealMin ≤ idealMax ≤ max, 축 범위 안이다", () => {
    const swapped = problems([
      scatter({ curves: { humidity: { min: 50, idealMin: 40, idealMax: 60, max: 90 } } }),
    ]);
    expect(swapped[0]?.[3]).toContain("min ≤ idealMin");
    const outside = problems([
      scatter({ curves: { absLatitude: { min: 0, idealMin: 10, idealMax: 20, max: 95 } } }),
    ]);
    expect(outside).toHaveLength(1);
    const flat = problems([scatter({ curves: { slopePct: { min: 5, idealMin: 5, idealMax: 5, max: 5 } } })]);
    expect(flat).toHaveLength(1);
  });

  it("그림 종류는 이름표에 있는 것만(none 제외), 덩이 크기는 2의 거듭제곱 표만", () => {
    expect(problems([scatter({ art: "none" })])[0]?.[3]).toContain("그림 종류");
    expect(problems([scatter({ art: "cactus" })])[0]?.[3]).toContain("그림 종류");
    expect(problems([scatter({ clump: { cells: 12, threshold: 500 } })])[0]?.[3]).toContain("덩이 크기");
  });

  it("없는 바이옴은 2단계(참조)가, 같은 바이옴 두 번은 1단계가 막는다", () => {
    const missing = problems([scatter({ biomes: [{ biome: "jungle", weight: 10 }] })]);
    expect(missing.map(([stage]) => stage)).toEqual(["references"]);
    const twice = problems([
      scatter({
        biomes: [
          { biome: "desert", weight: 10 },
          { biome: "desert", weight: 20 },
        ],
      }),
    ]);
    expect(twice[0]?.[3]).toContain("두 번");
  });

  it("배치 방식이 모르는 값이면 실패한다", () => {
    expect(problems([forest({ placement: "grid" })])[0]?.[3]).toContain("배치 방식");
  });
});
