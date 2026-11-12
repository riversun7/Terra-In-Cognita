import { DataTexture } from "three";
import { describe, expect, it } from "vitest";
import {
  ELEVATION_LAND_RAMP,
  RESOURCE_COLORS,
  RESOURCE_MATERIALS,
  cssColor,
  glslRamp,
  mixColor,
  rampColor,
  rampGradient,
  resourceRamp,
} from "./layerColors.ts";
import { LAYER_INDEX, createSharedTileUniforms, createTileMaterial } from "./planetMaterials.ts";
import { PLANET_LAYERS } from "./planetTypes.ts";
import { ResourceLayer, resourceMapProblem } from "./resourceLayer.ts";

const texture = (): DataTexture => new DataTexture(new Uint8Array(4), 1, 1);

describe("1차맵 자료 레이어 색", () => {
  it("색 띠는 0에서 1까지 차례대로이고 끝 색이 양 끝 값이다", () => {
    const ats = ELEVATION_LAND_RAMP.map((stop) => stop.at);
    expect(ats[0]).toBe(0);
    expect(ats.at(-1)).toBe(1);
    expect(ats).toEqual(ats.toSorted((a, b) => a - b));
    expect(rampColor(ELEVATION_LAND_RAMP, 0)).toBe(ELEVATION_LAND_RAMP[0]?.color);
    expect(rampColor(ELEVATION_LAND_RAMP, 1)).toBe(ELEVATION_LAND_RAMP.at(-1)?.color);
    // 띠 밖은 끝 색
    expect(rampColor(ELEVATION_LAND_RAMP, -3)).toBe(ELEVATION_LAND_RAMP[0]?.color);
    expect(rampColor(ELEVATION_LAND_RAMP, 9)).toBe(ELEVATION_LAND_RAMP.at(-1)?.color);
  });

  it("섞기·CSS 색·그라데이션", () => {
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(cssColor(0x0a0b0c)).toBe("#0a0b0c");
    expect(
      rampGradient([
        { at: 0, color: 0xff0000 },
        { at: 1, color: 0x0000ff },
      ]),
    ).toBe("linear-gradient(to right, #ff0000 0.0%, #0000ff 100.0%)");
  });

  it("GLSL 띠 함수는 마디마다 섞기 한 줄", () => {
    const glsl = glslRamp("ramp", ELEVATION_LAND_RAMP);
    expect(glsl.startsWith("vec3 ramp(float t) {")).toBe(true);
    expect(glsl.match(/mix\(/g)?.length).toBe(ELEVATION_LAND_RAMP.length - 1);
  });

  it("원자재 여섯 모두 색이 있고 서로 다르다", () => {
    expect(RESOURCE_MATERIALS).toHaveLength(6);
    const colors = RESOURCE_MATERIALS.map((material) => RESOURCE_COLORS[material]);
    expect(new Set(colors).size).toBe(6);
    expect(resourceRamp("wood")).toHaveLength(3);
  });
});

describe("1차맵 레이어 셰이더 번호·자원 분포 텍스처", () => {
  it("레이어 다섯이 서로 다른 번호이고 타일 재질은 셰이더 하나다", () => {
    expect(new Set(PLANET_LAYERS.map((layer) => LAYER_INDEX[layer])).size).toBe(5);
    const shared = createSharedTileUniforms([0x336699], 100);
    const a = createTileMaterial(shared, texture(), texture(), 32, [0, 0, 1], [0, 0, 1, 0]);
    const b = createTileMaterial(shared, texture(), texture(), 32, [0, 0, 2], [0, 0, 1, 1]);
    expect(a.fragmentShader).toBe(b.fragmentShader);
    expect(a.uniforms.uResource).toBe(shared.uResource);
    expect(a.uniforms.uElevationMax).toBe(shared.uElevationMax);
  });

  it("지도 모양 검사: 칸 수·레벨·원자재", () => {
    const share = new Uint8Array(6 * 4 * 4);
    expect(resourceMapProblem({ material: "ore", level: 2, share, high: share })).toBeNull();
    expect(resourceMapProblem({ material: "ore", level: 3, share, high: null })).toMatch(/cells/);
    expect(resourceMapProblem({ material: "ore", level: 10, share, high: null })).toMatch(/level/);
  });

  it("지도를 올리면 모든 타일 재질이 새 텍스처를 보고, 바꾸면 옛 텍스처를 버린다", () => {
    const shared = createSharedTileUniforms([0x336699], 100);
    const tile = createTileMaterial(shared, texture(), texture(), 32, [0, 0, 1], [0, 0, 1, 0]);
    const layer = new ResourceLayer(shared);
    const share = new Uint8Array(6 * 4 * 4).fill(200);
    const bytes = layer.apply({ material: "wood", level: 2, share, high: null });
    expect(bytes).toBeGreaterThan(share.length);
    expect(shared.uResourceReady.value).toBe(1);
    const first = tile.uniforms.uResource?.value;
    let disposed = false;
    first?.addEventListener("dispose", () => {
      disposed = true;
    });
    // 틀린 지도는 버리고 흐린 바탕만
    expect(layer.apply({ material: "wood", level: 3, share, high: null })).toBe(0);
    expect(disposed).toBe(true);
    expect(shared.uResourceReady.value).toBe(0);
  });
});
