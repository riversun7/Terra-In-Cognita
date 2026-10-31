// 소품 겉모습 표: 이름표 순서(번호)와 맞고, 엄폐가 셀수록 땅 색을 더 섞는다
import { MAP_PROP_ARTS } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { PLACEMENT_CELLS } from "../terrain/terrainData.ts";
import { buildPropTextureData, propLook, propTint } from "./propLook.ts";

describe("소품 겉모습", () => {
  it("이름표의 그림마다 겉모습이 있고(none 제외), 모르는 번호는 없다", () => {
    expect(propLook(0)).toBeUndefined();
    for (let code = 1; code < MAP_PROP_ARTS.length; code++)
      expect(propLook(code), MAP_PROP_ARTS[code]).toBeDefined();
    expect(propLook(MAP_PROP_ARTS.length)).toBeUndefined();
    expect(propLook(MAP_PROP_ARTS.indexOf("tree_conifer"))?.shape).toBe("conifer");
  });

  it("땅 색 세기: 차폐 > 은폐 > 소품만 > 없음", () => {
    const tree = MAP_PROP_ARTS.indexOf("tree_broadleaf");
    expect(propTint(2, tree)).toBeGreaterThan(propTint(1, tree));
    expect(propTint(1, tree)).toBeGreaterThan(propTint(0, tree));
    expect(propTint(0, 0)).toBe(0);
  });

  it("텍스처: 칸마다 색과 세기(행 우선)", () => {
    const size = PLACEMENT_CELLS * PLACEMENT_CELLS;
    const art = new Uint8Array(size);
    const cover = new Uint8Array(size);
    art[300] = MAP_PROP_ARTS.indexOf("boulder");
    cover[300] = 2;
    const data = buildPropTextureData(art, cover);
    expect(data.length).toBe(size * 4);
    expect(data[300 * 4 + 3]).toBe(190);
    expect(data[3]).toBe(0);
  });
});
