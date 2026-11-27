import { DataTexture, ShaderLib, Vector3, Vector4 } from "three";
import { describe, expect, it } from "vitest";
import { createMockTerrain } from "../mock/mockTerrain.ts";
import { TERRAIN_SHADER_INSERTS, TerrainMaterial, type TerrainShaderSource } from "./terrainMaterial.ts";
import { buildNoiseTextureData } from "./terrainNoise.ts";
import { HEIGHT_SHADE_MIN_RANGE_M } from "./terrainTextures.ts";

const occurrences = (text: string, part: string): number => text.split(part).length - 1;

/** 설치된 three의 Lambert 셰이더 원본(onBeforeCompile이 받는 것과 같은 단계 문자열) */
const lambertSource = (): TerrainShaderSource => ({
  vertexShader: ShaderLib.lambert.vertexShader,
  fragmentShader: ShaderLib.lambert.fragmentShader,
  uniforms: {},
});

const noise = buildNoiseTextureData();

describe("TerrainMaterial 셰이더 끼우기", () => {
  it("설치된 three의 Lambert 셰이더에 끼울 자리가 한 번씩 있다(three를 올려 자리가 바뀌면 실패)", () => {
    const source = lambertSource();
    for (const [anchor] of TERRAIN_SHADER_INSERTS.vertex)
      expect(occurrences(source.vertexShader, anchor)).toBe(1);
    for (const [anchor] of TERRAIN_SHADER_INSERTS.fragment) {
      expect(occurrences(source.fragmentShader, anchor)).toBe(1);
    }
  });

  it("자리마다 코드를 끼우고 유니폼 열 개(안개·소품·경계 포함)를 잇는다", () => {
    const material = new TerrainMaterial();
    const shader = lambertSource();
    material.patchShader(shader);
    for (const [anchor, code] of TERRAIN_SHADER_INSERTS.vertex)
      expect(shader.vertexShader).toContain(`${anchor}\n${code}`);
    for (const [anchor, code] of TERRAIN_SHADER_INSERTS.fragment) {
      expect(shader.fragmentShader).toContain(`${anchor}\n${code}`);
    }
    expect(Object.keys(shader.uniforms).toSorted()).toEqual([
      "uBorder",
      "uCellSize",
      "uFog",
      "uFogOn",
      "uGrid",
      "uHeight",
      "uNoise",
      "uProps",
      "uPropsOn",
      "uSurface",
    ]);
    // 선언은 main 앞, 색 단계는 main 안(Lambert 기본 색 단계 뒤)
    for (const text of [shader.vertexShader, shader.fragmentShader]) {
      expect(text.indexOf("varying vec3 vTerrainPos;")).toBeLessThan(text.indexOf("void main"));
    }
    const fragment = shader.fragmentShader;
    expect(fragment.indexOf("uniform sampler2D uSurface;")).toBeLessThan(fragment.indexOf("void main"));
    expect(fragment.indexOf("terrainSurfaceColor(vTerrainPos, vTerrainLocal)")).toBeGreaterThan(
      fragment.indexOf("#include <color_fragment>"),
    );
    expect(shader.vertexShader.indexOf("vTerrainPos = ")).toBeGreaterThan(
      shader.vertexShader.indexOf("#include <begin_vertex>"),
    );
    material.dispose();
  });

  it("재질의 onBeforeCompile이 같은 일을 하고, 프로그램 캐시 키를 따로 쓴다", () => {
    const material = new TerrainMaterial();
    const viaHook = lambertSource();
    const direct = lambertSource();
    // three가 부르는 모양 그대로(재질을 this로, 두 번째 인자 렌더러는 쓰지 않는다)
    // oxlint-disable-next-line typescript/unbound-method -- Reflect.apply로 재질을 this로 준다(three 타입이 메서드로 적혀 있다)
    Reflect.apply(material.material.onBeforeCompile, material.material, [viaHook, null]);
    material.patchShader(direct);
    expect(viaHook.vertexShader).toBe(direct.vertexShader);
    expect(viaHook.fragmentShader).toBe(direct.fragmentShader);
    expect(Object.keys(viaHook.uniforms).toSorted()).toEqual(Object.keys(direct.uniforms).toSorted());
    expect(material.material.customProgramCacheKey()).toBe("terra-terrain-surface");
    material.dispose();
  });
});

describe("TerrainMaterial 유니폼 값", () => {
  it("칸 크기·높이 범위·물 높이를 넣고, 높이 밝기 배율은 폭 0.01m에서 멈춘다(평평한 2차맵)", () => {
    const material = new TerrainMaterial();
    const shader = lambertSource();
    material.patchShader(shader);
    const terrain = createMockTerrain(4);

    material.setTerrain(terrain, -20, 40, noise);
    expect(shader.uniforms["uCellSize"]?.value).toBe(terrain.cellSizeM);
    expect(shader.uniforms["uHeight"]?.value).toEqual(new Vector3(-20, 1 / 60, terrain.waterLevelM));

    // 높이가 모두 같은 지형: 1 / 1e-6을 쓰면 보간 오차가 10⁶배로 커져 점무늬가 됐다
    material.setTerrain(terrain, 60, 60, noise);
    expect(shader.uniforms["uHeight"]?.value).toEqual(
      new Vector3(60, 1 / HEIGHT_SHADE_MIN_RANGE_M, terrain.waterLevelM),
    );
    // 잡음 텍스처는 처음 받은 것을 계속 쓴다
    const firstNoise: unknown = shader.uniforms["uNoise"]?.value;
    material.setTerrain(terrain, 0, 10, new Uint8Array(noise.length));
    expect(shader.uniforms["uNoise"]?.value).toBe(firstNoise);
    material.dispose();
  });
});

describe("안개(S3 시야 전송)", () => {
  it("탐사 칸 비트를 텍스처 빨강으로 옮기고 켠다. null이면 끈다", () => {
    const material = new TerrainMaterial();
    const shader = lambertSource();
    material.patchShader(shader);
    const bits = new Uint8Array(128);
    bits[0] = 0b0000_0101;
    material.setExplored(bits);
    const fog: unknown = shader.uniforms.uFog?.value;
    if (!(fog instanceof DataTexture)) throw new Error("fog texture missing");
    const data: unknown = fog.image.data;
    if (!(data instanceof Uint8Array)) throw new Error("fog data missing");
    expect([data[0], data[4], data[8]]).toEqual([255, 0, 255]);
    expect(shader.uniforms.uFogOn?.value).toBe(1);
    material.setExplored(null);
    expect(shader.uniforms.uFogOn?.value).toBe(0);
    material.dispose();
  });
});

describe("2차맵 경계 표시(uBorder)", () => {
  it("중심·인접 역할과 세기를 uBorder 유니폼에 반영한다", () => {
    const material = new TerrainMaterial();
    const shader = lambertSource();
    material.patchShader(shader);
    expect(shader.uniforms.uBorder?.value).toEqual(new Vector4(0, 0, 0, 0));
    material.setBorder(0.9, 0.4, 0.8, true);
    expect(shader.uniforms.uBorder?.value).toEqual(new Vector4(0.9, 0.4, 0.8, 1));
    material.setBorder(0.5, 0.2, 0.3, false);
    expect(shader.uniforms.uBorder?.value).toEqual(new Vector4(0.5, 0.2, 0.3, 0));
    material.dispose();
  });
});
