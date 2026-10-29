// 초안 내보내기·가져오기 시험 — 묶음 모양, 왕복, 64KiB 상한(UTF-8 바이트), 코드(too_large·not_json·unknown_format·invalid_entry),
// 항목 하나 붙여 넣기, 파일 이름
import { PLANET_GENERATOR_FACE_LEVELS, PLANET_SETTING_RANGES } from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  DRAFT_EXPORT_FORMAT,
  DRAFT_IMPORT_MAX_BYTES,
  buildDraftExport,
  draftExportFileName,
  isImportableEntry,
  parseDraftImport,
  serializeDraftExport,
} from "./draftExport.ts";
import { type DraftEntry, entryPresets, withSetting } from "./editorModel.ts";
import { TEST_PLANET } from "./testDefinitions.ts";

const BASE = { contentVersion: "core@2", definitionHash: "ab".repeat(32), generatorVersion: 2 };
const AT = new Date(Date.UTC(2026, 9, 29, 12, 34, 56));
const planet = withSetting(TEST_PLANET, "landPercent", 41);

function bundleText(overrides: Record<string, unknown> = {}): string {
  const bundle = buildDraftExport({
    planet,
    base: BASE,
    checks: [
      { faceLevel: 7, hash: "0123abcd" },
      { faceLevel: 5, hash: "89abcdef" },
      { faceLevel: 7, hash: "0123abce" },
    ],
    generatorVersion: 2,
    exportedAt: AT,
  });
  return JSON.stringify({ ...bundle, ...overrides });
}

const code = (text: string) => {
  const result = parseDraftImport(text);
  return result.ok ? "ok" : result.code;
};

describe("내보내기", () => {
  it("모양: format·formatVersion·exportedAt·generatorVersion·base·checks(레벨 오름차순, 레벨마다 하나)·planet", () => {
    const bundle = buildDraftExport({ planet, base: null, checks: [], generatorVersion: 3, exportedAt: AT });
    expect(Object.keys(bundle)).toEqual([
      "format",
      "formatVersion",
      "exportedAt",
      "generatorVersion",
      "base",
      "checks",
      "planet",
    ]);
    expect(bundle).toMatchObject({
      format: DRAFT_EXPORT_FORMAT,
      formatVersion: 1,
      exportedAt: "2026-10-29T12:34:56.000Z",
      generatorVersion: 3,
      base: null,
    });
    expect(JSON.parse(bundleText()).checks).toEqual([
      { faceLevel: 5, hash: "89abcdef" },
      { faceLevel: 7, hash: "0123abce" },
    ]);
  });

  it("직렬화(들여쓰기)하고 다시 읽으면 같다", () => {
    const bundle = buildDraftExport({ planet, base: BASE, checks: [], generatorVersion: 2, exportedAt: AT });
    const text = serializeDraftExport(bundle);
    expect(text).toContain('\n  "format": "terra-planet-draft"');
    const result = parseDraftImport(text);
    expect(result).toEqual({
      ok: true,
      draft: {
        planet,
        base: BASE,
        checks: [],
        generatorVersion: 2,
        exportedAt: "2026-10-29T12:34:56.000Z",
        bare: false,
      },
    });
  });

  it("파일 이름(UTC 분까지)", () => {
    expect(draftExportFileName("s2_test_planet", AT)).toBe(
      "terra-planet-draft-s2_test_planet-20261029-1234.json",
    );
  });
});

describe("가져오기", () => {
  it("64KiB 상한은 UTF-8 바이트로 센다", () => {
    expect(code(" ".repeat(DRAFT_IMPORT_MAX_BYTES + 1))).toBe("too_large");
    // 한글 한 자 = 3바이트: 글자 수는 상한 아래여도 바이트가 넘는다
    expect(code(`"${"가".repeat(Math.ceil(DRAFT_IMPORT_MAX_BYTES / 3))}"`)).toBe("too_large");
    expect(code(`${bundleText()}${" ".repeat(1000)}`)).toBe("ok");
  });

  it("JSON이 아니면 not_json, 모르는 모양·판이면 unknown_format", () => {
    expect(code("{ not json")).toBe("not_json");
    expect(code("[]")).toBe("unknown_format");
    expect(code("42")).toBe("unknown_format");
    expect(code(bundleText({ format: "other" }))).toBe("unknown_format");
    expect(code(bundleText({ formatVersion: 2 }))).toBe("unknown_format");
    expect(code(bundleText({ checks: [{ faceLevel: 5, hash: "XYZ" }] }))).toBe("unknown_format");
    expect(code(bundleText({ checks: "none" }))).toBe("unknown_format");
    expect(code(bundleText({ base: { contentVersion: 2 } }))).toBe("unknown_format");
    expect(code(bundleText({ exportedAt: 5 }))).toBe("unknown_format");
    expect(code(bundleText({ generatorVersion: "2" }))).toBe("unknown_format");
    expect(code(bundleText({ base: null }))).toBe("ok");
  });

  it("행성 항목이 생성기가 받을 수 없는 모양이면 invalid_entry", () => {
    const [lowest, highest] = PLANET_GENERATOR_FACE_LEVELS;
    const [, maxLand] = PLANET_SETTING_RANGES.landPercent;
    const broken: DraftEntry[] = [
      { ...planet, seed: -1 },
      { ...planet, seed: 1.5 },
      { ...planet, id: "Bad-Id" },
      { ...planet, faceLevel: highest + 1 },
      { ...planet, faceLevel: lowest - 1 },
      { ...planet, biomes: [] },
      { ...planet, biomes: ["ocean_deep", 3] },
      { ...planet, presets: { ...entryPresets(planet), seaLevel: "ocean" } },
      { ...planet, overrides: { landPercent: maxLand + 1 } },
      { ...planet, overrides: { unknownSetting: 1 } },
      { ...planet, overrides: { poleTemperatureC: 40, equatorTemperatureC: 0 } },
    ];
    for (const entry of broken) {
      expect(isImportableEntry(entry)).toBe(false);
      expect(code(bundleText({ planet: entry }))).toBe("invalid_entry");
    }
    expect(code(bundleText({ planet: "s2_test_planet" }))).toBe("invalid_entry");
    expect(isImportableEntry(planet)).toBe(true);
  });

  it("planets.json 항목 하나만 붙여 넣어도 받는다(기준·해시 없음)", () => {
    const result = parseDraftImport(JSON.stringify(TEST_PLANET, null, 2));
    expect(result).toEqual({
      ok: true,
      draft: {
        planet: TEST_PLANET,
        base: null,
        checks: [],
        generatorVersion: null,
        exportedAt: null,
        bare: true,
      },
    });
    expect(code(JSON.stringify({ ...TEST_PLANET, seed: "x" }))).toBe("invalid_entry");
    // presets가 없는 모르는 객체는 묶음으로 읽고 모양이 틀린다
    expect(code(JSON.stringify({ hello: 1 }))).toBe("unknown_format");
  });
});
