import { CHARACTER_PRESETS, DEFAULT_CHARACTER_LOOK, randomCharacterLook } from "@terra/shared/characterLook";
import { describe, expect, it } from "vitest";
import {
  CHARACTER_CACHE_LIMIT,
  CharacterCache,
  REST_POSE,
  compileCharacter,
  writeGroupMatrices,
} from "./characterCompile.ts";
import { characterModel } from "./characterModel.ts";
import { CHARACTER_SHAPES, GROUP, GROUP_COUNT } from "./characterParts.ts";

describe("캐릭터 모델 → 그리기 배열", () => {
  it("조각마다 행렬·색·도형·묶음이 들고 수가 모두 유한하다", () => {
    for (const preset of CHARACTER_PRESETS) {
      const model = characterModel(preset.look, 0);
      const compiled = compileCharacter(model);
      expect(compiled.count).toBe(model.parts.length);
      expect(compiled.matrices.length).toBe(model.parts.length * 16);
      expect(compiled.colors.length).toBe(model.parts.length * 3);
      expect(compiled.triangles).toBe(model.triangles);
      for (const value of compiled.matrices) expect(Number.isFinite(value)).toBe(true);
      for (const value of compiled.colors) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      for (const shape of compiled.shapes) expect(shape).toBeLessThan(CHARACTER_SHAPES.length);
      for (const group of compiled.groups) expect(group).toBeLessThan(GROUP_COUNT);
      // 빛나는 조각이 하나는 있다(눈·등불) — 사이보그 프리셋은 모두 빛 색을 쓴다
      expect([...compiled.glow].some((flag) => flag === 1) || preset.look.plating === 0, preset.id).toBe(
        true,
      );
    }
  });

  it("쉬는 자세의 묶음 행렬은 모두 단위 행렬이다", () => {
    const compiled = compileCharacter(characterModel(DEFAULT_CHARACTER_LOOK, 0));
    const out = new Float32Array(GROUP_COUNT * 16);
    writeGroupMatrices(out, compiled.pivots, REST_POSE);
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (let group = 0; group < GROUP_COUNT; group++) {
      expect([...out.subarray(group * 16, group * 16 + 16)].map((value) => value + 0)).toEqual(identity);
    }
  });

  it("걷는 자세: 축 자리는 제자리, 왼다리 발은 앞으로·오른다리 발은 뒤로, 팔은 반대로 간다", () => {
    const compiled = compileCharacter(characterModel(DEFAULT_CHARACTER_LOOK, 0));
    const out = new Float32Array(GROUP_COUNT * 16);
    writeGroupMatrices(out, compiled.pivots, { swing: 0.5, bob: 0, chop: 0 });
    /** 묶음 행렬로 점 (0, y, 0)을 옮긴 z */
    const zAt = (group: number, y: number): number =>
      (out[group * 16 + 6] ?? 0) * y + (out[group * 16 + 14] ?? 0);
    const yAt = (group: number, y: number): number =>
      (out[group * 16 + 5] ?? 0) * y + (out[group * 16 + 13] ?? 0);
    for (const group of [GROUP.legL, GROUP.legR, GROUP.armL, GROUP.armR]) {
      const pivotY = compiled.pivots[group * 3 + 1] ?? 0;
      expect(zAt(group, pivotY)).toBeCloseTo(0, 5);
      expect(yAt(group, pivotY)).toBeCloseTo(pivotY, 5);
    }
    expect(zAt(GROUP.legL, 0)).toBeGreaterThan(0.05);
    expect(zAt(GROUP.legR, 0)).toBeLessThan(-0.05);
    const handY = (compiled.pivots[GROUP.armL * 3 + 1] ?? 0) - 0.4;
    expect(zAt(GROUP.armL, handY)).toBeLessThan(-0.05);
    expect(zAt(GROUP.armR, handY)).toBeGreaterThan(0.05);
    // 몸·머리는 위아래로만 움직인다
    writeGroupMatrices(out, compiled.pivots, { swing: 0, bob: 0.03, chop: 0 });
    expect(out[GROUP.body * 16 + 13]).toBeCloseTo(0.03, 6);
    expect(out[GROUP.head * 16 + 13]).toBeCloseTo(0.03, 6);
  });

  it("일하는 팔(채집 휘두르기): 두 팔이 앞으로 들리고 오른팔이 더 높다, 다리는 그대로", () => {
    const compiled = compileCharacter(characterModel(DEFAULT_CHARACTER_LOOK, 0));
    const out = new Float32Array(GROUP_COUNT * 16);
    writeGroupMatrices(out, compiled.pivots, { swing: 0, bob: 0, chop: 1.5 });
    const zAt = (group: number, y: number): number =>
      (out[group * 16 + 6] ?? 0) * y + (out[group * 16 + 14] ?? 0);
    const yAt = (group: number, y: number): number =>
      (out[group * 16 + 5] ?? 0) * y + (out[group * 16 + 13] ?? 0);
    const handY = (compiled.pivots[GROUP.armR * 3 + 1] ?? 0) - 0.4;
    // 손이 앞(+z)으로 나가고 위로 올라온다
    expect(zAt(GROUP.armR, handY)).toBeGreaterThan(0.2);
    expect(zAt(GROUP.armL, handY)).toBeGreaterThan(0.1);
    expect(yAt(GROUP.armR, handY)).toBeGreaterThan(yAt(GROUP.armL, handY));
    expect(zAt(GROUP.legL, 0)).toBeCloseTo(0, 5);
    expect(zAt(GROUP.legR, 0)).toBeCloseTo(0, 5);
  });

  it("캐시: 같은 외형·단계는 같은 것을 돌려주고, 상한을 넘으면 비우고 다시 채운다", () => {
    const cache = new CharacterCache();
    const first = cache.get(DEFAULT_CHARACTER_LOOK, 0);
    expect(cache.get({ ...DEFAULT_CHARACTER_LOOK }, 0)).toBe(first);
    expect(cache.get(DEFAULT_CHARACTER_LOOK, 1)).not.toBe(first);
    expect(cache.size).toBe(2);
    for (let seed = 0; seed < CHARACTER_CACHE_LIMIT + 10; seed++) cache.get(randomCharacterLook(seed), 1);
    expect(cache.size).toBeLessThanOrEqual(CHARACTER_CACHE_LIMIT);
    expect(cache.size).toBeGreaterThan(0);
    // 비워진 뒤에도 같은 값으로 다시 만든다
    expect(cache.get(DEFAULT_CHARACTER_LOOK, 0)).toEqual(first);
  });
});
