// 지형 오브젝트 편집기 자료 시험(D-536·D-398) — 지형마다 줄, 양 고치기·더하기·빼기, 바뀐 항목만 차이로, from = 팩 항목 정규 JSON 해시
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import gatherObjectsJson from "../../../../../content/core/gather_objects.json";
import mapPropsJson from "../../../../../content/core/map_props.json";
import biomesJson from "../../../../../content/core/biomes.json";
import {
  addableRows,
  buildDiff,
  changedEntries,
  hashEntry,
  kindCounts,
  setAmount,
  sortKeys,
  terrainRows,
} from "./terrainObjectsModel.ts";

const pack = { mapProps: mapPropsJson.entries, gatherObjects: gatherObjectsJson.entries };
const biomes = biomesJson.entries.map((entry) => entry.id);

describe("지형 오브젝트 편집기 자료", () => {
  it("팩의 모든 지형에 이 화면에서 고치는 오브젝트가 5종 이상(기획 D-536)", () => {
    const counts = kindCounts(pack, biomes);
    expect(biomes).toHaveLength(14);
    for (const biome of biomes) expect(counts.get(biome), biome).toBeGreaterThanOrEqual(5);
  });

  it("지형 줄: 장식·물 위·지형별 채집 자리·어군을 종류로 나누고 양을 읽는다", () => {
    const deep = terrainRows(pack, "ocean_deep");
    expect(deep.find((row) => row.id === "iceberg")).toMatchObject({ kind: "water", amount: 15 });
    expect(deep.find((row) => row.id === "hydro_vent")).toMatchObject({ kind: "site", amount: 15 });
    expect(deep.find((row) => row.id === "whale_pod")).toMatchObject({ kind: "school", amount: 2 });
    const ice = terrainRows(pack, "ice_sheet");
    expect(ice.find((row) => row.id === "crevasse")?.kind).toBe("cover");
    expect(ice.find((row) => row.id === "snowdrift")?.kind).toBe("decor");
    // 공통 채집 자리(바이옴 표 없음)는 줄이 아니다
    expect(terrainRows(pack, "taiga").some((row) => row.id === "conifer_tree")).toBe(false);
  });

  it("양 고치기·더하기·빼기(범위로 자름, 마지막 지형은 빼지 않는다)와 바뀐 항목", () => {
    let edited = setAmount(pack, "gather_objects", "school_deep", "ocean_deep", 99);
    expect(terrainRows(edited, "ocean_deep").find((row) => row.id === "school_deep")?.amount).toBe(32);
    edited = setAmount(edited, "map_props", "kelp", "lake", 25);
    expect(terrainRows(edited, "lake").find((row) => row.id === "kelp")?.amount).toBe(25);
    expect(addableRows(edited, "lake").some((row) => row.id === "kelp")).toBe(false);
    edited = setAmount(edited, "gather_objects", "sandstone", "desert", null);
    expect(terrainRows(edited, "desert").some((row) => row.id === "sandstone")).toBe(true);
    edited = setAmount(edited, "gather_objects", "tide_rock", "ocean_coastal", null);
    expect(terrainRows(edited, "ocean_coastal").some((row) => row.id === "tide_rock")).toBe(false);
    expect(changedEntries(pack, edited).map((change) => change.id)).toEqual([
      "kelp",
      "tide_rock",
      "school_deep",
    ]);
    expect(changedEntries(pack, pack)).toEqual([]);
  });

  it("차이 파일: entries만, from = 팩 항목 정규 JSON SHA-256(적용 스크립트와 같은 셈)", async () => {
    const edited = setAmount(pack, "map_props", "coral", "ocean_shelf", 44);
    const diff = await buildDiff(pack, edited, "core@77", "2026-11-12T00:00:00.000Z");
    expect(diff).toMatchObject({
      format: "terra-tuning-diff",
      formatVersion: 1,
      packId: "core",
      changes: [],
    });
    const coral = mapPropsJson.entries.find((entry) => entry.id === "coral");
    const expected = createHash("sha256")
      .update(JSON.stringify(sortKeys(coral)))
      .digest("hex");
    expect(diff.entries).toEqual([
      {
        category: "map_props",
        id: "coral",
        from: expected,
        entry: edited.mapProps.find((e) => e.id === "coral"),
      },
    ]);
    expect(await hashEntry({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(
      createHash("sha256").update('{"a":[2,{"c":4,"d":3}],"b":1}').digest("hex"),
    );
  });
});
