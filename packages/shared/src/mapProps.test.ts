// 소품 이름표: 그림 번호는 한 번 쓰면 바뀌지 않는다(지형 파일·고정본이 가리킨다)
import { describe, expect, it } from "vitest";
import {
  MAP_PROP_ARTS,
  MAP_PROP_CLUMP_CELLS,
  MAP_PROP_CURVE_AXES,
  MAP_PROP_CURVE_AXIS_NAMES,
  mapPropArtCode,
} from "./mapProps.ts";

describe("2차맵 소품 이름표", () => {
  it("그림 번호는 지금까지 쓴 그대로다(새 그림은 끝에만 더한다)", () => {
    expect(MAP_PROP_ARTS.slice(0, 8)).toEqual([
      "none",
      "tree_broadleaf",
      "tree_conifer",
      "tree_palm",
      "bush",
      "reeds",
      "boulder",
      "log",
    ]);
    // 2026-11-11 장식 소품 11종(끝에 더함)
    expect(MAP_PROP_ARTS.slice(8)).toEqual([
      "cactus",
      "dry_shrub",
      "tall_grass",
      "flowers",
      "stones",
      "driftwood",
      "termite_mound",
      "dead_tree",
      "fern",
      "ice_block",
      "bones",
      // 2026-11-12 노두(서버 채집 오브젝트 그림, 끝에 더함)
      "outcrop_stone",
      "outcrop_copper",
    ]);
    expect(MAP_PROP_ARTS.length).toBeLessThanOrEqual(256);
    expect(mapPropArtCode("boulder")).toBe(6);
    expect(mapPropArtCode("cactus")).toBe(8);
    expect(mapPropArtCode("unicorn_statue")).toBe(-1);
  });

  it("곡선 축 목록이 범위 표와 같고, 범위·덩이 크기가 맞다", () => {
    expect(MAP_PROP_CURVE_AXIS_NAMES).toEqual(Object.keys(MAP_PROP_CURVE_AXES));
    for (const [low, high] of Object.values(MAP_PROP_CURVE_AXES)) expect(low).toBeLessThan(high);
    for (const cells of MAP_PROP_CLUMP_CELLS) expect(Number.isInteger(Math.log2(cells))).toBe(true);
  });
});
