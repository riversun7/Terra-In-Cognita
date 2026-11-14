// 소품 겉모습 표: 이름표 순서(번호)와 맞고, 엄폐가 셀수록 땅 색을 더 섞는다
import { MAP_PROP_ARTS, RETIRED_MAP_PROP_ARTS } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { PLACEMENT_CELLS } from "../terrain/terrainData.ts";
import { SURFACE, TERRAIN_CELLS } from "../terrain/terrainData.ts";
import { buildPropTextureData, groundClutter, propLook, propSalt, propTint, snowyCell } from "./propLook.ts";

describe("소품 겉모습", () => {
  it("이름표의 그림마다 겉모습이 있고(none·지운 그림 제외), 모르는 번호는 없다", () => {
    expect(propLook(0)).toBeUndefined();
    for (let code = 1; code < MAP_PROP_ARTS.length; code++) {
      const name = MAP_PROP_ARTS[code];
      // 지운 그림(작은 섬 등)은 옛 고정본 지형 파일에 번호가 남아도 그리지 않는다
      if (name !== undefined && RETIRED_MAP_PROP_ARTS.includes(name))
        expect(propLook(code), name).toBeUndefined();
      else expect(propLook(code), name).toBeDefined();
    }
    // 지운 그림은 땅 색도 섞지 않는다(엄폐 0 장식)
    expect(propTint(0, MAP_PROP_ARTS.indexOf("islet"))).toBe(0);
    expect(propLook(MAP_PROP_ARTS.length)).toBeUndefined();
    expect(propLook(MAP_PROP_ARTS.indexOf("tree_conifer"))?.shape).toBe("conifer");
  });

  it("땅 색 세기: 차폐 > 은폐 > 소품만 > 없음", () => {
    const tree = MAP_PROP_ARTS.indexOf("tree_broadleaf");
    expect(propTint(2, tree)).toBeGreaterThan(propTint(1, tree));
    expect(propTint(1, tree)).toBeGreaterThan(propTint(0, tree));
    expect(propTint(0, 0)).toBe(0);
    // 장식 소품(엄폐 0)은 엄폐 칸보다 옅고, 작은 것일수록 더 옅다(멀리서 땅 색이 얼룩지지 않게)
    const grass = MAP_PROP_ARTS.indexOf("tall_grass");
    const bones = MAP_PROP_ARTS.indexOf("bones");
    expect(propTint(0, grass)).toBeLessThan(propTint(1, tree));
    expect(propTint(0, bones)).toBeLessThan(propTint(0, grass));
  });

  it("땅 잔소품: 지표로 고르고(물·지표 없음은 없다), 몫 위의 굴림은 없다. 눈·얼음 지표 칸", () => {
    const surface = new Uint8Array(TERRAIN_CELLS * TERRAIN_CELLS);
    surface[0] = SURFACE.grass;
    surface[1] = SURFACE.water;
    surface[2] = SURFACE.snow;
    surface[3] = SURFACE.shallowWater;
    // 배치 칸 (0·1, 0) → 지형 칸 0, (2·3, 0) → 1, (4, 0) → 2, (6, 0) → 3
    expect(groundClutter(surface, 0, 0.1, 0.5)).toBe("tuft");
    expect(groundClutter(surface, 1, 0.1, 0.01)).toBe("blossom");
    expect(groundClutter(surface, 0, 0.99, 0.5)).toBeNull();
    expect(groundClutter(surface, 2, 0.01, 0.5)).toBeNull();
    expect(groundClutter(surface, 4, 0.01, 0.5)).toBe("snowLump");
    expect(groundClutter(surface, 6, 0.01, 0.5)).toBe("cattail");
    expect(groundClutter(undefined, 0, 0.01, 0.5)).toBeNull();
    expect(snowyCell(surface, 4)).toBe(true);
    expect(snowyCell(surface, 0)).toBe(false);
    expect(snowyCell(undefined, 4)).toBe(false);
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

describe("propSalt", () => {
  it("같은 2차맵 이름이면 같은 값, 이름을 모르면 0, 작은 정수 범위", () => {
    expect(propSalt(null)).toBe(0);
    expect(propSalt("109927540457481")).toBe(propSalt("109927540457481"));
    expect(propSalt("109927540457481")).not.toBe(propSalt("109929687941129"));
    for (const id of ["a", "109927540457481", "east"]) {
      expect(Number.isInteger(propSalt(id))).toBe(true);
      expect(propSalt(id)).toBeGreaterThanOrEqual(0);
      expect(propSalt(id)).toBeLessThan(4_096);
    }
  });
});
