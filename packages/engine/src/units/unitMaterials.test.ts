import { ShaderLib } from "three";
import { describe, expect, it } from "vitest";
import { UNIT_BODY_SHADER_INSERT, UnitBodyMaterial } from "./unitMaterials.ts";

const occurrences = (text: string, part: string): number => text.split(part).length - 1;

describe("유닛 몸 재질(밤 빛)", () => {
  it("설치된 three의 Lambert 조각 셰이더에 끼울 자리가 한 번씩 있다(three를 올려 자리가 바뀌면 실패)", () => {
    const source = ShaderLib.lambert.fragmentShader;
    expect(occurrences(source, UNIT_BODY_SHADER_INSERT.anchor)).toBe(1);
    expect(occurrences(source, UNIT_BODY_SHADER_INSERT.pars[0])).toBe(1);
    // 인스턴스 색을 곱한 뒤(color_fragment)에 끼워야 자기 색으로 빛난다
    expect(source.indexOf("#include <color_fragment>")).toBeLessThan(
      source.indexOf(UNIT_BODY_SHADER_INSERT.anchor),
    );
  });

  it("유니폼을 잇고 밤 빛 줄을 끼운다. 값은 0 아래로 내려가지 않는다", () => {
    const body = new UnitBodyMaterial();
    const shader = { fragmentShader: ShaderLib.lambert.fragmentShader, uniforms: {} };
    body.patchShader(shader);
    expect(shader.fragmentShader).toContain(
      `${UNIT_BODY_SHADER_INSERT.anchor}\n${UNIT_BODY_SHADER_INSERT.code}`,
    );
    expect(shader.fragmentShader).toContain(UNIT_BODY_SHADER_INSERT.pars[1]);
    expect(Object.keys(shader.uniforms)).toEqual(["uNightLift"]);
    body.setNightLift(0.3);
    expect(body.nightLift).toBe(0.3);
    body.setNightLift(-1);
    expect(body.nightLift).toBe(0);
    expect(body.material.customProgramCacheKey()).toBe("terra-unit-body");
    body.material.dispose();
  });
});
