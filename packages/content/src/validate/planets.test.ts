// 행성·바이옴 분류 시험 — 스키마(프리셋·세부 수치·면 레벨·시드·바이옴 규칙)와 참조(행성의 바이옴 표)
import { describe, expect, it } from "vitest";
import { fixture, named } from "../testFixtures.ts";
import { validatePack } from "./pack.ts";

const biome = (id: string, rule: unknown, extra: Record<string, unknown> = {}) => ({
  ...named(id),
  color: "#3d6b4f",
  forestDensity: 0,
  rule,
  ...extra,
});

const BIOMES = [
  biome("ocean_deep", { kind: "ocean", depthClass: "deep" }),
  biome("lake", { kind: "lake" }),
  biome(
    "taiga",
    { kind: "land", temperatureC: { min: -3, max: 5 }, humidity: { min: 70 } },
    { forestDensity: 170 },
  ),
  biome("desert", { kind: "land" }),
];

const PRESETS = {
  seaLevel: "normal",
  temperature: "normal",
  precipitation: "normal",
  mountains: "normal",
  plates: "normal",
  volcanism: "normal",
};

const planet = (extra: Record<string, unknown> = {}) => ({
  ...named("test_world"),
  faceLevel: 9,
  seed: 20261029,
  presets: PRESETS,
  biomes: ["ocean_deep", "lake", "taiga", "desert"],
  ...extra,
});

const check = (planets: unknown[], biomes: unknown[] = BIOMES) =>
  validatePack(fixture({ "biomes.json": { entries: biomes }, "planets.json": { entries: planets } }));

const problems = (planets: unknown[], biomes?: unknown[]) =>
  check(planets, biomes).issues.map((issue) => [
    issue.stage,
    issue.file,
    issue.id,
    issue.path,
    issue.message,
  ]);

/** 바이옴 표의 마지막 항목만 바꿨을 때의 문제 */
const lastBiomeProblems = (entry: unknown) => problems([planet()], [...BIOMES.slice(0, 3), entry]);

describe("행성·바이옴 분류", () => {
  it("올바른 행성과 바이옴은 통과하고, 행성의 바이옴 표는 순서대로 ID를 가리킨다", () => {
    const result = check([planet({ overrides: { landPercent: 35, poleTemperatureC: -30 } })]);
    expect(result.issues).toEqual([]);
    const [entry] = result.pack?.entries.get("planets") ?? [];
    // 참조는 JSON으로 다시 쓰면 ID 문자열이다(바이옴 번호 = 이 배열의 위치)
    expect(JSON.parse(JSON.stringify(entry))).toMatchObject({
      id: "test_world",
      biomes: ["ocean_deep", "lake", "taiga", "desert"],
      overrides: { landPercent: 35, poleTemperatureC: -30 },
    });
  });

  it("프리셋 단계 이름이 틀리면 허용 값을 알린다", () => {
    expect(problems([planet({ presets: { ...PRESETS, seaLevel: "huge" } })])).toEqual([
      [
        "schema",
        "planets.json",
        "test_world",
        "presets.seaLevel",
        '허용하지 않는 값입니다(허용: "archipelago", "normal", "continent").',
      ],
    ]);
  });

  it("프리셋 축이 빠지면 실패한다", () => {
    const partial = Object.fromEntries(Object.entries(PRESETS).filter(([axis]) => axis !== "volcanism"));
    expect(problems([planet({ presets: partial })])).toEqual([
      [
        "schema",
        "planets.json",
        "test_world",
        "presets.volcanism",
        '값이 없습니다. 꼭 적어야 하는 필드입니다(허용: "low", "normal", "high").',
      ],
    ]);
  });

  it("세부 수치는 정해진 이름·정수 범위만 받는다", () => {
    expect(problems([planet({ overrides: { landPercent: 96 } })])).toEqual([
      ["schema", "planets.json", "test_world", "overrides.landPercent", "값이 너무 큽니다(최대 95)."],
    ]);
    expect(problems([planet({ overrides: { seaLevelM: 3 } })])).toEqual([
      [
        "schema",
        "planets.json",
        "test_world",
        "overrides",
        "모르는 필드입니다: seaLevelM. 이름에 오타가 없는지 확인하세요.",
      ],
    ]);
    expect(problems([planet({ overrides: { plateCount: 12.5 } })])).toEqual([
      [
        "schema",
        "planets.json",
        "test_world",
        "overrides.plateCount",
        expect.stringContaining("형식이 다릅니다"),
      ],
    ]);
  });

  it("극 기온과 적도 기온을 함께 덮어쓰면 극이 적도보다 높을 수 없다", () => {
    expect(problems([planet({ overrides: { equatorTemperatureC: 10, poleTemperatureC: 12 } })])).toEqual([
      [
        "schema",
        "planets.json",
        "test_world",
        "overrides",
        "극 기온(poleTemperatureC)이 적도 기온(equatorTemperatureC)보다 높습니다. 극 ≤ 적도로 고치세요.",
      ],
    ]);
  });

  it("면 레벨은 4~10(생성기가 받는 범위), 시드는 u32 정수", () => {
    expect(problems([planet({ faceLevel: 11 })])).toEqual([
      ["schema", "planets.json", "test_world", "faceLevel", "값이 너무 큽니다(최대 10)."],
    ]);
    expect(problems([planet({ seed: -1 })])).toEqual([
      ["schema", "planets.json", "test_world", "seed", "값이 너무 작습니다(최소 0)."],
    ]);
    expect(problems([planet({ seed: 4294967296 })])).toEqual([
      ["schema", "planets.json", "test_world", "seed", "값이 너무 큽니다(최대 4294967295)."],
    ]);
  });

  it("행성의 바이옴 표: 없는 바이옴은 2단계가 잡고(오타 제안), 같은 바이옴을 두 번 쓰면 실패한다", () => {
    expect(problems([planet({ biomes: ["ocean_deep", "lake", "taiga", "deserd"] })])).toEqual([
      [
        "references",
        "planets.json",
        "test_world",
        "biomes[3]",
        '없는 biomes ID "deserd"입니다. 혹시 "desert"?',
      ],
    ]);
    expect(problems([planet({ biomes: ["ocean_deep", "lake", "taiga", "lake"] })])).toEqual([
      [
        "schema",
        "planets.json",
        "test_world",
        "biomes",
        '바이옴 "lake"가 두 번 있습니다. 바이옴 번호는 이 표의 위치라 한 번씩만 씁니다.',
      ],
    ]);
    expect(problems([planet({ biomes: [] })])).toEqual([
      ["schema", "planets.json", "test_world", "biomes", expect.stringContaining("1")],
    ]);
  });

  it("바이옴: 색은 #rrggbb, 숲 밀도 0~255, 규칙 종류·수심 등급·범위가 맞아야 한다", () => {
    expect(lastBiomeProblems(biome("desert", { kind: "land" }, { color: "red" }))).toEqual([
      [
        "schema",
        "biomes.json",
        "desert",
        "color",
        '색은 "#"과 소문자 16진수 6자리로 적으세요(예: "#3d6b4f").',
      ],
    ]);
    expect(lastBiomeProblems(biome("desert", { kind: "land" }, { forestDensity: 256 }))).toEqual([
      ["schema", "biomes.json", "desert", "forestDensity", "값이 너무 큽니다(최대 255)."],
    ]);
    expect(lastBiomeProblems(biome("desert", { kind: "sky" }))).toEqual([
      [
        "schema",
        "biomes.json",
        "desert",
        "rule.kind",
        '규칙 종류(kind)는 "ocean"(depthClass 필요), "lake", "land" 가운데 하나입니다.',
      ],
    ]);
    expect(lastBiomeProblems(biome("desert", { kind: "ocean", depthClass: "abyss" }))).toEqual([
      [
        "schema",
        "biomes.json",
        "desert",
        "rule.depthClass",
        '허용하지 않는 값입니다(허용: "coastal", "shelf", "deep").',
      ],
    ]);
    expect(lastBiomeProblems(biome("desert", { kind: "land", humidity: { min: 100, max: 100 } }))).toEqual([
      [
        "schema",
        "biomes.json",
        "desert",
        "rule.humidity",
        "min은 max보다 작아야 합니다(min은 포함, max는 포함하지 않음).",
      ],
    ]);
    expect(lastBiomeProblems(biome("desert", { kind: "land", humidity: { min: 0, max: 300 } }))).toEqual([
      ["schema", "biomes.json", "desert", "rule.humidity.max", "값이 너무 큽니다(최대 256)."],
    ]);
  });
});
