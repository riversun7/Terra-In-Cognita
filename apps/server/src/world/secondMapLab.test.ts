// 개발자 2차맵 시험 서버 쪽 시험 — 월드 행성(팩 S2 시험 행성을 면 레벨 5로 줄여 빠르게)의 2차맵 고르기·칸 값·지형 주소, 그 밖의 행성은 device
import { cellKey } from "@terra/planet";
import { runPlanetGenerator } from "@terra/planet/generator";
import {
  encodePlanetValues,
  findMapPreset,
  planetCellValues,
  planetValuesFromGeneration,
} from "@terra/planet/secondMap";
import { terrainPath } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import { planetSpecsFromPack } from "../planet/sources.ts";
import { loadPack } from "../planetEditor/testSupport.ts";
import { SecondMapLabInputError, SecondMapLabNotReadyError, createSecondMapLab } from "./secondMapLab.ts";
import { TEST_PLANET_ID } from "./world.ts";

const LEVEL = 5;
const spec = planetSpecsFromPack(loadPack().pack).find((item) => item.id === TEST_PLANET_ID);
if (!spec) throw new Error("pack has no S2 test planet");
const input = { ...spec.input, faceLevel: LEVEL };
const details = runPlanetGenerator(input);
const values = planetValuesFromGeneration(
  details.fields,
  details,
  input.biomes.map((biome) => biome.id),
);
const bytes = encodePlanetValues(values);
const testKey = cellKey(0, LEVEL, 5, 9);
const VERSION = "1.3.abcdef01.12345678";

function lab(version: string | null = VERSION) {
  return createSecondMapLab({
    planetId: TEST_PLANET_ID,
    values: () => Promise.resolve(bytes),
    terrainVersion: () => version ?? undefined,
    // 띄운 시험 2차맵은 고정본 판 표지
    loadedVersion: (mapKey) => (mapKey === testKey ? "pinned" : undefined),
    testMapKey: testKey,
  });
}

describe("개발자 2차맵 시험(서버)", () => {
  it("월드 행성이 아니면 device(기기가 만든다)", async () => {
    await expect(lab().locate("s2_editor_planet", { kind: "test" })).resolves.toEqual({ kind: "device" });
  });

  it("시험 2차맵은 띄운 2차맵의 판 표지, 다른 키는 지형 서비스 판 표지. 칸 값은 행성 값과 같다", async () => {
    const test = await lab().locate(TEST_PLANET_ID, { kind: "test" });
    expect(test).toMatchObject({
      kind: "server",
      mapKey: testKey,
      faceLevel: LEVEL,
      terrainUrl: terrainPath(testKey, "pinned"),
      testMapKey: testKey,
    });
    const other = cellKey(2, LEVEL, 10, 20);
    const answer = await lab().locate(TEST_PLANET_ID, { kind: "key", mapKey: other });
    expect(answer).toEqual({
      kind: "server",
      planetId: TEST_PLANET_ID,
      faceLevel: LEVEL,
      mapKey: other,
      terrainUrl: terrainPath(other, VERSION),
      cell: planetCellValues(values, other),
      testMapKey: testKey,
    });
  });

  it("시험 자리 종류는 생성기 도우미와 같은 칸이다", async () => {
    const answer = await lab().locate(TEST_PLANET_ID, { kind: "preset", preset: "mountain" });
    expect(answer).toMatchObject({ kind: "server", mapKey: findMapPreset(values, "mountain") });
  });

  it("틀린 키는 입력 오류, 지형 서비스 준비 전은 준비 안 됨", async () => {
    await expect(lab().locate(TEST_PLANET_ID, { kind: "key", mapKey: 12.5 })).rejects.toBeInstanceOf(
      SecondMapLabInputError,
    );
    await expect(
      lab().locate(TEST_PLANET_ID, { kind: "key", mapKey: cellKey(0, LEVEL + 1, 1, 1) }),
    ).rejects.toBeInstanceOf(SecondMapLabInputError);
    await expect(
      lab(null).locate(TEST_PLANET_ID, { kind: "key", mapKey: cellKey(0, LEVEL, 1, 1) }),
    ).rejects.toBeInstanceOf(SecondMapLabNotReadyError);
  });
});
