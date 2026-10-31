import { DataTexture } from "three";
import { describe, expect, it } from "vitest";
import {
  createBaseGlobeMaterial,
  createSharedTileUniforms,
  createTileMaterial,
  skyLightUniformsOf,
} from "./planetMaterials.ts";
import { DAY_NIGHT_BAND } from "./sky.ts";
import { DAY_NIGHT_SHADE } from "./skyShade.ts";

const SKY_KEYS = [
  "uSkyBlend",
  "uSunDir",
  "uSunDirView",
  "uNight",
  "uNightTint",
  "uTwilight",
  "uShade",
  "uNightLift",
] as const;

const texture = (): DataTexture => new DataTexture(new Uint8Array(4), 1, 1);

describe("1차맵 재질: 하늘 빛 uniform", () => {
  it("타일·바탕 구가 같은 하늘 uniform 객체를 나눠 쓴다(프레임마다 한 번 고치면 모두 바뀐다)", () => {
    const shared = createSharedTileUniforms([0x336699], 100);
    const tileA = createTileMaterial(shared, texture(), texture(), 32, [0, 0, 1], [0, 0, 1, 0]);
    const tileB = createTileMaterial(shared, texture(), texture(), 32, [0, 0, 2], [0, 0, 1, 1]);
    const globe = createBaseGlobeMaterial(shared, false);
    for (const key of SKY_KEYS) {
      expect(tileA.uniforms[key]).toBe(shared[key]);
      expect(tileB.uniforms[key]).toBe(shared[key]);
      expect(globe.uniforms[key]).toBe(shared[key]);
    }
    expect(Object.keys(skyLightUniformsOf(shared)).toSorted()).toEqual([...SKY_KEYS].toSorted());
    // 같은 셰이더 글자 = 프로그램 하나(하늘 모드를 바꿔도 다시 컴파일하지 않는다)
    expect(tileA.fragmentShader).toBe(tileB.fragmentShader);
  });

  it("처음은 끔(섞기 0·세기 0)이고, 밤 값은 DAY_NIGHT_SHADE·DAY_NIGHT_BAND에서 온다", () => {
    const shared = createSharedTileUniforms([], 0);
    expect(shared.uSkyBlend.value).toBe(0);
    expect(shared.uNight.value.toArray()).toEqual([
      DAY_NIGHT_SHADE.nightLight,
      DAY_NIGHT_BAND.low,
      DAY_NIGHT_BAND.high,
      0,
    ]);
    expect(shared.uNightTint.value.toArray()).toEqual([...DAY_NIGHT_SHADE.nightTint]);
    expect(shared.uShade.value.toArray()).toEqual([
      DAY_NIGHT_SHADE.dayLambert,
      DAY_NIGHT_SHADE.nightDesaturate,
      DAY_NIGHT_SHADE.reliefGain,
      DAY_NIGHT_SHADE.dayLight,
    ]);
  });

  it("끔 길은 하늘 전 셰이더 식 그대로다(카메라 빛 → 고른 칸이 빛 앞)", () => {
    const shared = createSharedTileUniforms([], 0);
    const tile = createTileMaterial(shared, texture(), texture(), 32, [0, 0, 1], [0, 0, 1, 0]);
    expect(tile.fragmentShader).toContain("color = base * (0.5 + 0.62 * diffuse);");
    expect(tile.fragmentShader).toContain(
      "if (uSkyBlend <= 0.0) {\n    color = cameraLight(applyPick(base), n, wet);",
    );
    const globe = createBaseGlobeMaterial(shared, false);
    expect(globe.fragmentShader).toContain("vec3 lit = uColor * (0.5 + 0.62 * diffuse);");
    expect(globe.fragmentShader).toContain("if (uSkyBlend > 0.0) {");
  });
});
