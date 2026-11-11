// 유닛 앞 소품 옅게 시험(기획 질문 996 다): 선분 거리 식, 재질에 넣은 셰이더 조각, 세운 나무 가운데 카메라 → 유닛 선분 둘레만 센다
import { MAP_PROP_ARTS } from "@terra/shared";
import { MeshLambertMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PLACEMENT_CELLS, TERRAIN_CELLS } from "../terrain/terrainData.ts";
import {
  type FadeShader,
  createPropFade,
  fadeMaterial,
  patchFadeShader,
  segmentDistance,
} from "./propFade.ts";
import { PropView } from "./propView.ts";

describe("유닛 앞 옅게", () => {
  it("선분 거리: 가운데·끝 밖은 끝에 붙는다", () => {
    const from = new Vector3(0, 10, 0);
    const to = new Vector3(10, 0, 0);
    expect(segmentDistance(from, to, 5, 5, 0).distance).toBeCloseTo(0, 6);
    expect(segmentDistance(from, to, 5, 5, 0).t).toBeCloseTo(0.5, 6);
    const beyond = segmentDistance(from, to, 20, 0, 0);
    expect(beyond.t).toBe(1);
    expect(beyond.distance).toBeCloseTo(10, 6);
  });

  it("재질 셰이더에 조각이 들어가고 모든 재질이 같은 값을 쓴다", () => {
    const fade = createPropFade();
    const material = fadeMaterial(new MeshLambertMaterial(), fade);
    const shader: FadeShader = {
      uniforms: {},
      vertexShader: "#include <common>\nvoid main(){\n#include <project_vertex>\n}",
      fragmentShader: "#include <common>\nvoid main(){\n#include <clipping_planes_fragment>\n}",
    };
    patchFadeShader(shader, fade);
    expect(shader.vertexShader).toContain("vPropFadeWorld");
    expect(shader.fragmentShader).toContain("discard");
    expect(shader.uniforms.uPropFadeTo).toBe(fade.uniforms.uPropFadeTo);
    expect(material.customProgramCacheKey()).toBe("terra-prop-fade");
  });

  it("세운 나무 가운데 카메라 → 유닛 선분 둘레만 옅게 센다(유닛 너머·꺼짐은 0)", () => {
    const art = new Uint8Array(PLACEMENT_CELLS * PLACEMENT_CELLS);
    const cover = new Uint8Array(PLACEMENT_CELLS * PLACEMENT_CELLS);
    const tree = MAP_PROP_ARTS.indexOf("tree_conifer");
    // 배치 칸 (100, 100)·(100, 118)에 빽빽한 나무(칸 = 1m로 둔다)
    for (const cell of [100 * PLACEMENT_CELLS + 100, 118 * PLACEMENT_CELLS + 100]) {
      art[cell] = tree;
      cover[cell] = 2;
    }
    const view = new PropView();
    view.setSources(
      [{ art, cover, placement: null, salt: 0, surface: new Uint8Array(TERRAIN_CELLS * TERRAIN_CELLS) }],
      1,
      () => 0,
    );
    const polygon = [
      { x: 80, z: 80 },
      { x: 120, z: 80 },
      { x: 120, z: 120 },
      { x: 80, z: 120 },
    ];
    expect(view.update(30, { polygon, nearX: 100, nearZ: 120 })).toBe(true);
    expect(view.drawn).toBe(2);
    // 카메라는 남쪽 위, 유닛은 두 나무 사이(z 112) — 카메라 쪽 나무(100, 100)만 사이에 있고 유닛 너머 나무(100, 118)는 아니다
    view.setFade({ x: 100.5, y: 30, z: 60 }, { x: 100.5, y: 0.9, z: 112 }, 2.5);
    expect(view.fadedCount).toBe(1);
    // 유닛이 옆으로 비켜 서면 사이에 나무가 없다
    view.setFade({ x: 140, y: 30, z: 60 }, { x: 140, y: 0.9, z: 112 }, 2.5);
    expect(view.fadedCount).toBe(0);
    view.setFade(null, null, 0);
    expect(view.fadedCount).toBe(0);
    view.dispose();
  });
});
