// 행성 편집기 정의 조회 자료 시험 — 저장소 팩, 확인 해시(기기와 같은 길), 정의 해시(목록 정보와 같은 값), 시작 로그 한 줄.
// 해시·시드 값은 적지 않는다(생성기 판이 바뀌어도 그대로 돈다): 같은 값을 다른 길로 다시 만들어 견준다.
import { GENERATOR_VERSION, generatePlanet, planetInputFromDefinition } from "@terra/planet/generator";
import { PLANET_EDITOR_CHECK_FACE_LEVEL } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { createInlineBaker } from "../planet/baker.ts";
import { createPlanetService } from "../planet/service.ts";
import { createPlanetSource, planetSpecsFromPack } from "../planet/sources.ts";
import { recordingLog } from "../planet/testSupport.ts";
import {
  PLANET_EDITOR_READY_MESSAGE,
  buildPlanetEditorDefinitions,
  checkFaceLevelOf,
  planetEditorLogFields,
} from "./definitions.ts";
import { EDITOR_PLANET_ID, TEST_PLANET_ID, loadPack, packEditorBuild, rawPlanet } from "./testSupport.ts";

describe("행성 편집기 정의 조회 자료", () => {
  const loaded = loadPack();
  const build = packEditorBuild(loaded);
  const { definitions } = build;

  it("팩 버전·임시 여부·서버 생성기 판, 행성은 팩 순서, 바이옴은 팩 파일 그대로", () => {
    expect(definitions.contentVersion).toBe(loaded.content.version);
    expect(definitions.placeholder).toBe(loaded.content.placeholder);
    expect(definitions.generatorVersion).toBe(GENERATOR_VERSION);
    expect(definitions.planets.map((planet) => planet.id)).toEqual(
      (loaded.pack.entries.get("planets") ?? []).map((planet) => planet.id),
    );
    expect(definitions.planets.map((planet) => planet.id)).toEqual(
      expect.arrayContaining([TEST_PLANET_ID, EDITOR_PLANET_ID]),
    );
    expect(definitions.biomes).toEqual(loaded.raw.biomes);
    // 원본 항목 = 팩 파일 JSON 그대로(시드 포함)
    for (const planet of definitions.planets) expect(planet.entry).toEqual(rawPlanet(loaded, planet.id));
    // 구조화 복제·JSON으로 보낼 수 있다(tRPC 응답)
    expect(JSON.parse(JSON.stringify(definitions))).toEqual(definitions);
  });

  it("정의 해시 = 서버가 굽는 원본·목록 정보의 definitionHash", () => {
    const specs = planetSpecsFromPack(loaded.pack);
    const service = createPlanetService({
      sources: specs.map((spec) => createPlanetSource(spec)),
      baker: createInlineBaker(),
      log: recordingLog(),
    });
    for (const planet of definitions.planets) {
      expect(planet.definitionHash).toMatch(/^[0-9a-f]{64}$/);
      expect(planet.definitionHash).toBe(service.manifest(planet.id)?.definitionHash);
    }
  });

  it("확인 해시 = 기기와 같은 길(원본 항목 + 원본 바이옴 → 생성기 입력, 확인 레벨)로 만든 결과 해시", () => {
    const specs = planetSpecsFromPack(loaded.pack);
    for (const planet of definitions.planets) {
      const spec = specs.find((item) => item.id === planet.id);
      if (!spec) throw new Error(`spec ${planet.id}`);
      expect(planet.check.faceLevel).toBe(Math.min(PLANET_EDITOR_CHECK_FACE_LEVEL, spec.input.faceLevel));
      const viaEntry = generatePlanet(
        planetInputFromDefinition(planet.entry, loaded.raw.biomes, planet.check.faceLevel),
      ).meta.hash;
      // 서버 굽기의 입력(검증 결과에서 만든 것)을 레벨만 바꿔도 같다
      const viaSpec = generatePlanet({ ...spec.input, faceLevel: planet.check.faceLevel }).meta.hash;
      expect(planet.check.hash).toBe(viaEntry);
      expect(planet.check.hash).toBe(viaSpec);
    }
  });

  it("편집 전용 행성은 S2 시험 행성과 시드·이름·설명만 다르다(ADR 38 10절)", () => {
    const editor = definitions.planets.find((planet) => planet.id === EDITOR_PLANET_ID);
    const test = definitions.planets.find((planet) => planet.id === TEST_PLANET_ID);
    if (!editor || !test) throw new Error("pack planets missing");
    const differing = Object.keys({ ...editor.entry, ...test.entry }).filter(
      (key) => JSON.stringify(editor.entry[key]) !== JSON.stringify(test.entry[key]),
    );
    expect(differing.toSorted()).toEqual(["description", "id", "name", "seed"]);
    expect(editor.definitionHash).not.toBe(test.definitionHash);
    expect(editor.check.hash).not.toBe(test.check.hash);
  });

  it("확인 레벨 = min(5, 행성 면 레벨). 면 레벨 4 행성은 4로 만든다", () => {
    expect([4, 5, 6, 9].map(checkFaceLevelOf)).toEqual([4, 5, 5, 5]);
    const [spec] = planetSpecsFromPack(loaded.pack);
    if (!spec) throw new Error("no planet");
    const raw = { ...rawPlanet(loaded, spec.id), faceLevel: 4 };
    const small = buildPlanetEditorDefinitions({
      content: loaded.content,
      raw: { planets: [raw], biomes: loaded.raw.biomes },
      specs: [{ ...spec, input: { ...spec.input, faceLevel: 4 } }],
    });
    expect(small.definitions.planets[0]?.check).toEqual({
      faceLevel: 4,
      hash: generatePlanet(planetInputFromDefinition(raw, loaded.raw.biomes, 4)).meta.hash,
    });
  });

  it("팩 자료를 복사해 둔다(조회 자료를 고쳐도 팩 항목은 그대로)", () => {
    const copy = packEditorBuild(loaded);
    const planet = copy.definitions.planets[0];
    if (!planet) throw new Error("no planet");
    planet.entry.seed = -1;
    const biome = copy.definitions.biomes[0];
    if (biome) biome.color = "#000000";
    expect(rawPlanet(loaded, planet.id).seed).not.toBe(-1);
    expect(loaded.raw.biomes[0]).not.toMatchObject({ color: "#000000" });
  });

  it("원본 항목이 없는 행성·생성기가 받지 않는 정의면 던진다(서버가 뜨지 않게)", () => {
    const specs = planetSpecsFromPack(loaded.pack);
    expect(() =>
      buildPlanetEditorDefinitions({
        content: loaded.content,
        raw: { planets: [], biomes: loaded.raw.biomes },
        specs,
      }),
    ).toThrow(/no entry for planet/);
    const [spec] = specs;
    if (!spec) throw new Error("no planet");
    expect(() =>
      buildPlanetEditorDefinitions({
        content: loaded.content,
        raw: {
          planets: [{ ...rawPlanet(loaded, spec.id), biomes: ["ocean_deep", "tundra"] }],
          biomes: loaded.raw.biomes,
        },
        specs: [spec],
      }),
    ).toThrow(RangeError);
  });

  it("시작 로그 한 줄: 행성마다 확인 레벨·해시·걸린 시간, 시드·항목은 없다", () => {
    let clock = 0;
    const timed = buildPlanetEditorDefinitions({
      content: loaded.content,
      raw: loaded.raw,
      specs: planetSpecsFromPack(loaded.pack),
      // 부를 때마다 7ms씩 가는 시계
      now: () => (clock += 7),
    });
    const fields = planetEditorLogFields(timed);
    expect(PLANET_EDITOR_READY_MESSAGE).toBe("planet editor definitions ready");
    expect(fields).toEqual({
      contentVersion: loaded.content.version,
      generatorVersion: GENERATOR_VERSION,
      planets: timed.definitions.planets.map((planet) => ({
        planetId: planet.id,
        checkFaceLevel: planet.check.faceLevel,
        checkHash: planet.check.hash,
        checkMs: 7,
      })),
      totalMs: timed.totalMs,
    });
    expect(timed.timings.every((timing) => timing.ms === 7)).toBe(true);
    const text = JSON.stringify(fields);
    for (const planet of timed.definitions.planets) {
      expect(text).not.toContain(String(planet.entry.seed));
    }
    expect(text).not.toContain("presets");
    // 실제 시계로 만든 것도 시간이 0 이상이다
    expect(build.timings.map((timing) => timing.planetId)).toEqual(
      definitions.planets.map((planet) => planet.id),
    );
    expect(build.timings.every((timing) => timing.ms >= 0)).toBe(true);
    expect(build.totalMs).toBeGreaterThanOrEqual(build.timings.reduce((sum, timing) => sum + timing.ms, 0));
  });
});
