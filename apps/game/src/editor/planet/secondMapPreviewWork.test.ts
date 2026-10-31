// 편집기 2차맵 미리보기 일(워커 안 순수 부분) 시험 — 서버와 같은 길로 같은 2차맵을 만드는지, 행성 값을 다시 쓰는지, 틀린 입력.
// 시험 행성은 팩 S2 시험 행성을 면 레벨 5로 줄여 쓴다(빠르게). 해시 값은 적지 않고 같은 코드의 직접 호출과 견준다.
import { planetInputFromDefinition, runPlanetGenerator } from "@terra/planet/generator";
import {
  compileMapProps,
  generateSecondMap,
  mapPropInputsFromJson,
  planetValuesFromGeneration,
} from "@terra/planet/secondMap";
import { describe, expect, it } from "vitest";
import mapPropsFile from "../../../../../content/core/map_props.json" with { type: "json" };
import { cellAtLatLon } from "./cellReport.ts";
import { previewKey } from "./previewJobs.ts";
import type { SecondMapPreviewRequest, SecondMapPreviewStage } from "./secondMapPreviewProtocol.ts";
import { emptyPlanetSlot, runSecondMapJob } from "./secondMapPreviewWork.ts";
import { PACK_BIOMES, TEST_PLANET } from "./testDefinitions.ts";

const LEVEL = 5;
const INPUT = planetInputFromDefinition(TEST_PLANET, PACK_BIOMES, LEVEL);
const PACK_PROPS: readonly unknown[] = mapPropsFile.entries;

function request(
  id: number,
  mapKey: number,
  props: readonly unknown[] = PACK_PROPS,
): SecondMapPreviewRequest {
  return { kind: "secondMap", id, planetKey: previewKey(INPUT), input: INPUT, mapKey, props };
}

describe("2차맵 미리보기 일", () => {
  const mapKey = cellAtLatLon(LEVEL, 12.5, 40).key;

  it("서버 굽기·지형 워커와 같은 길로 만든 2차맵과 같다. 두 번째는 행성 값을 다시 쓴다", () => {
    const details = runPlanetGenerator(INPUT);
    const biomeIds = INPUT.biomes.map((biome) => biome.id);
    const expected = generateSecondMap(
      planetValuesFromGeneration(details.fields, details, biomeIds),
      mapKey,
      compileMapProps(mapPropInputsFromJson(PACK_PROPS), biomeIds),
    );
    const slot = emptyPlanetSlot();
    const stages: SecondMapPreviewStage[] = [];
    const first = runSecondMapJob(request(1, mapKey), slot, { onStage: (stage) => stages.push(stage) });
    expect(first.reply.kind).toBe("result");
    if (first.reply.kind !== "result") return;
    expect(stages).toEqual(["planet", "map"]);
    expect(first.reply.result.terrain.hash).toBe(expected.hash);
    expect(first.reply.result.terrain.cellSizeMm).toBe(expected.cellSizeMm);
    expect(first.reply.result.planetMs).not.toBeNull();
    // 넘길 버퍼 다섯(높이·물·지표·엄폐·그림), 겹침 없음
    expect(first.transfer).toHaveLength(5);
    expect(slot.key).toBe(previewKey(INPUT));

    // 같은 행성의 다른 칸: 행성을 만들지 않는다
    stages.length = 0;
    const neighbour = cellAtLatLon(LEVEL, 13.5, 41).key;
    const second = runSecondMapJob(request(2, neighbour), slot, { onStage: (stage) => stages.push(stage) });
    expect(stages).toEqual(["map"]);
    expect(second.reply.kind === "result" && second.reply.result.planetMs).toBeNull();
  });

  it("다른 행성 열쇠면 다시 만든다. 틀린 입력은 rejected, 다른 레벨의 키는 failed", () => {
    const slot = emptyPlanetSlot();
    expect(runSecondMapJob(request(1, mapKey), slot).reply.kind).toBe("result");
    const other = { ...request(2, mapKey), planetKey: "other" };
    const stages: SecondMapPreviewStage[] = [];
    runSecondMapJob(other, slot, { onStage: (stage) => stages.push(stage) });
    expect(stages).toEqual(["planet", "map"]);

    const badProps = runSecondMapJob(request(3, mapKey, [{ id: "x" }]), slot);
    expect(badProps.reply).toMatchObject({ kind: "error", id: 3, code: "rejected" });
    const unknownArt = runSecondMapJob(
      request(4, mapKey, [{ id: "x", art: "castle", placement: "forest", biomes: [] }]),
      slot,
    );
    expect(unknownArt.reply).toMatchObject({ kind: "error", code: "rejected" });
    const badInput = runSecondMapJob({ ...request(5, mapKey), input: { ...INPUT, faceLevel: 99 } }, slot);
    expect(badInput.reply).toMatchObject({ kind: "error", code: "rejected" });
    const wrongLevel = runSecondMapJob(request(6, cellAtLatLon(LEVEL + 1, 0, 0).key), slot);
    expect(wrongLevel.reply).toMatchObject({ kind: "error", code: "failed" });
  });
});
