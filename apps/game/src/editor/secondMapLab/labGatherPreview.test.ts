// 2차맵 시험 채집 자리·어군 즉석 미리 보기 시험 — 팩 gather_objects로 비율(천분율·어군 수)을 바꾸면 놓이는 개수와 엔진 입력이 바로 따라온다
import { TERRAIN_SURFACE } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import gatherObjectsJson from "../../../../../content/core/gather_objects.json";
import { setAmount } from "../terrainObjects/terrainObjectsModel.ts";
import { buildGatherPreview, summarizeArtLayer } from "./labGatherPreview.ts";

const MAP_KEY = 350_735_619_325_961;

describe("2차맵 채집·어군 즉석 미리 보기", () => {
  it("사막 채집 자리 천분율을 늘리면 놓이는 오브젝트 수가 늘어난다", () => {
    const surface = new Uint8Array(128 * 128).fill(TERRAIN_SURFACE.sand);
    const art = new Uint8Array(256 * 256);
    const baseEntries = { mapProps: [], gatherObjects: gatherObjectsJson.entries };
    const low = buildGatherPreview({
      mapKey: MAP_KEY,
      surface,
      art,
      biomeId: "desert",
      waterBits: 0,
      gatherObjects: baseEntries.gatherObjects,
    });
    const highEntries = setAmount(baseEntries, "gather_objects", "oasis", "desert", 900);
    const high = buildGatherPreview({
      mapKey: MAP_KEY,
      surface,
      art,
      biomeId: "desert",
      waterBits: 0,
      gatherObjects: highEntries.gatherObjects,
    });
    expect((high.spotsById.get("oasis") ?? []).length).toBeGreaterThan(
      (low.spotsById.get("oasis") ?? []).length,
    );
    expect(high.objectProps.length).toBeGreaterThan(low.objectProps.length);
  });

  it("심해 어군 수를 바꾸면 엔진 SchoolInput 수가 정확히 따라온다", () => {
    const surface = new Uint8Array(128 * 128).fill(TERRAIN_SURFACE.water);
    const baseEntries = { mapProps: [], gatherObjects: gatherObjectsJson.entries };
    const edited = setAmount(baseEntries, "gather_objects", "whale_pod", "ocean_deep", 7);
    const result = buildGatherPreview({
      mapKey: MAP_KEY,
      surface,
      art: undefined,
      biomeId: "ocean_deep",
      waterBits: 1,
      gatherObjects: edited.gatherObjects,
    });
    expect(result.spotsById.get("whale_pod")).toHaveLength(7);
    expect(result.schools.filter((school) => school.points.length >= 2).length).toBeGreaterThanOrEqual(7);
  });

  it("summarizeArtLayer가 그림별 개수와 가운데 가까운 좌표를 낸다", () => {
    const art = new Uint8Array(256 * 256);
    art[10 * 256 + 10] = 8;
    art[128 * 256 + 128] = 8;
    art[200 * 256 + 200] = 5;
    const summary = summarizeArtLayer(art);
    expect(summary.get(8)?.count).toBe(2);
    expect(summary.get(8)?.samples[0]).toEqual({ x: 128, y: 128 });
    expect(summary.get(5)?.count).toBe(1);
  });
});
