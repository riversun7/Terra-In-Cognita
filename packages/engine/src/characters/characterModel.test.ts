import {
  CHARACTER_LOOK_KEYS,
  CHARACTER_PRESETS,
  type CharacterLook,
  DEFAULT_CHARACTER_LOOK,
  characterLookChoices,
  characterLookForUnit,
  isCharacterLook,
  randomCharacterLook,
} from "@terra/shared/characterLook";
import { describe, expect, it } from "vitest";
import { BASE_HEIGHT_M, TRIANGLE_BUDGET, characterModel } from "./characterModel.ts";
import {
  CHARACTER_SHAPES,
  type CharacterModel,
  GROUP_COUNT,
  SHAPE_TRIANGLES,
  countTriangles,
  mixColor,
  multiplyAffine,
  shadeColor,
  writePartMatrix,
} from "./characterParts.ts";

/** 모델 하나가 멀쩡한가: 수가 모두 유한하고, 크기가 양수이고, 경계가 사람 크기 안이다 */
function expectSane(model: CharacterModel, label: string): void {
  expect(model.parts.length, label).toBeGreaterThan(0);
  for (const part of model.parts) {
    for (const value of [part.x, part.y, part.z, part.sx, part.sy, part.sz, part.rx, part.ry, part.rz]) {
      expect(Number.isFinite(value), label).toBe(true);
    }
    expect(part.sx, label).toBeGreaterThan(0);
    expect(part.sy, label).toBeGreaterThan(0);
    expect(part.sz, label).toBeGreaterThan(0);
    expect(part.group, label).toBeGreaterThanOrEqual(0);
    expect(part.group, label).toBeLessThan(GROUP_COUNT);
    expect(part.color, label).toBeGreaterThanOrEqual(0);
    expect(part.color, label).toBeLessThanOrEqual(0xffffff);
    // 바닥 아래로 내려가지 않는다(발은 y = 0에 선다)
    expect(part.y - Math.hypot(part.sx, part.sy, part.sz) / 2, label).toBeGreaterThan(-0.6);
  }
  expect(model.heightM, label).toBeGreaterThan(1.3);
  expect(model.heightM, label).toBeLessThan(2.6);
  expect(model.halfWidthM, label).toBeGreaterThan(0.2);
  expect(model.halfWidthM, label).toBeLessThan(1.1);
  expect(model.pivots.length, label).toBe(GROUP_COUNT * 3);
  for (const value of model.pivots) expect(Number.isFinite(value), label).toBe(true);
  expect(model.triangles, label).toBe(countTriangles(model.parts));
}

describe("캐릭터 모델", () => {
  it("프리셋 24개: 단계 0은 600, 단계 1은 150 삼각형 안이고 모양이 멀쩡하다", () => {
    for (const preset of CHARACTER_PRESETS) {
      const near = characterModel(preset.look, 0);
      const far = characterModel(preset.look, 1);
      expectSane(near, preset.id);
      expectSane(far, `${preset.id} lod1`);
      expect(near.triangles, preset.id).toBeLessThanOrEqual(TRIANGLE_BUDGET.lod0);
      expect(far.triangles, preset.id).toBeLessThanOrEqual(TRIANGLE_BUDGET.lod1);
      // 먼 단계가 더 가볍다
      expect(far.triangles, preset.id).toBeLessThan(near.triangles);
    }
  });

  it("무작위 외형 500개와 유닛 기본 외형도 상한 안이다", () => {
    for (let seed = 0; seed < 500; seed++) {
      const look = randomCharacterLook(seed);
      const near = characterModel(look, 0);
      const far = characterModel(look, 1);
      expectSane(near, `seed ${seed}`);
      expect(near.triangles, `seed ${seed}`).toBeLessThanOrEqual(TRIANGLE_BUDGET.lod0);
      expect(far.triangles, `seed ${seed}`).toBeLessThanOrEqual(TRIANGLE_BUDGET.lod1);
    }
    for (let id = 1; id <= 100; id++) {
      for (const style of ["commoner", "leader"] as const) {
        const look = characterLookForUnit(id, style);
        expect(characterModel(look, 0).triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET.lod0);
        expect(characterModel(look, 1).triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET.lod1);
      }
    }
  });

  it("어떤 조합이든 상한 안이다: 칸마다 가장 무거운 값을 함께 골라도 넘지 않는다", () => {
    for (const lod of [0, 1] as const) {
      const base = characterModel(DEFAULT_CHARACTER_LOOK, lod).triangles;
      let worst: Record<string, string | number> = { ...DEFAULT_CHARACTER_LOOK };
      let sum = base;
      for (const key of CHARACTER_LOOK_KEYS) {
        let heaviest = 0;
        for (const choice of characterLookChoices(key)) {
          const look = { ...DEFAULT_CHARACTER_LOOK, [key]: choice };
          if (!isCharacterLook(look)) throw new Error(`bad look ${key}=${choice}`);
          const extra = characterModel(look, lod).triangles - base;
          if (extra > heaviest) {
            heaviest = extra;
            worst = { ...worst, [key]: choice };
          }
        }
        sum += heaviest;
      }
      const budget = lod === 0 ? TRIANGLE_BUDGET.lod0 : TRIANGLE_BUDGET.lod1;
      expect(sum, `lod ${lod} 칸마다 가장 큰 값의 합`).toBeLessThanOrEqual(budget);
      // 그 조합을 실제로 만들어도 같다(칸끼리 삼각형 수가 서로 기대지 않는다)
      if (!isCharacterLook(worst)) throw new Error("bad worst look");
      expect(characterModel(worst, lod).triangles).toBe(sum);
    }
  });

  it("같은 외형이면 같은 모델이고, 부위를 바꾸면 모델이 달라진다", () => {
    const look = DEFAULT_CHARACTER_LOOK;
    expect(characterModel(look, 0)).toEqual(characterModel({ ...look }, 0));
    for (const key of CHARACTER_LOOK_KEYS) {
      const choices = characterLookChoices(key);
      const seen = new Set<string>();
      for (const choice of choices) {
        const next = { ...look, [key]: choice };
        if (!isCharacterLook(next)) throw new Error("bad look");
        seen.add(JSON.stringify(characterModel(next, 0).parts));
      }
      // 칸의 값마다 다른 모델이 나온다(고르기가 눈에 보인다)
      expect(seen.size, key).toBe(choices.length);
    }
  });

  it("키 배율·체형이 키에 반영된다", () => {
    const at = (
      height: number,
      build: CharacterLook["build"] = "standard",
      top: CharacterLook["top"] = "none",
    ) =>
      characterModel({ ...DEFAULT_CHARACTER_LOOK, height, build, top, back: "none", extra: "none" }, 1)
        .heightM;
    expect(at(100)).toBeCloseTo(BASE_HEIGHT_M, 1);
    expect(at(110)).toBeGreaterThan(at(100));
    expect(at(90)).toBeLessThan(at(100));
    expect(at(110) / at(90)).toBeCloseTo(110 / 90, 2);
    expect(at(100, "compact")).toBeLessThan(at(100, "standard"));
    expect(at(100, "slender")).toBeGreaterThan(at(100, "standard"));
  });

  it("묶음 축: 팔은 어깨 높이·좌우 대칭, 다리는 엉덩이 높이, 머리는 목", () => {
    const model = characterModel(DEFAULT_CHARACTER_LOOK, 0);
    const pivot = (group: number): readonly [number, number, number] => [
      model.pivots[group * 3] ?? 0,
      model.pivots[group * 3 + 1] ?? 0,
      model.pivots[group * 3 + 2] ?? 0,
    ];
    const [lx, ly] = pivot(2);
    const [rx, ry] = pivot(3);
    expect(lx).toBeCloseTo(-rx, 6);
    expect(ly).toBeCloseTo(ry, 6);
    expect(rx).toBeGreaterThan(0.2);
    const [, hipY] = pivot(4);
    const [, neckY] = pivot(1);
    expect(hipY).toBeGreaterThan(0.3);
    expect(ly).toBeGreaterThan(hipY);
    expect(neckY).toBeGreaterThan(ly);
    // 팔·다리 조각이 양쪽에 같은 수만큼 있다
    const count = (group: number): number => model.parts.filter((part) => part.group === group).length;
    expect(count(2)).toBe(count(3));
    expect(count(4)).toBe(count(5));
    expect(count(2)).toBeGreaterThan(0);
    expect(count(4)).toBeGreaterThan(0);
  });

  it("도형 표와 색 도우미", () => {
    expect(Object.keys(SHAPE_TRIANGLES).toSorted()).toEqual([...CHARACTER_SHAPES].toSorted());
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixColor(0x102030, 0x102030, 0.3)).toBe(0x102030);
    expect(shadeColor(0x808080, 0.5)).toBe(0x404040);
    expect(shadeColor(0x808080, 1)).toBe(0x808080);
    expect(shadeColor(0x000000, 2)).toBe(0xffffff);
  });

  it("조각 행렬: 돌림이 없으면 크기·자리만, 아핀 곱은 차례대로 적용한 것과 같다", () => {
    const part = characterModel(DEFAULT_CHARACTER_LOOK, 1).parts[0];
    if (!part) throw new Error("no part");
    const m = new Float32Array(16);
    writePartMatrix(m, 0, { ...part, rx: 0, ry: 0, rz: 0 });
    expect([...m].map((value) => value + 0)).toEqual(
      [part.sx, 0, 0, 0, 0, part.sy, 0, 0, 0, 0, part.sz, 0, part.x, part.y, part.z, 1].map(Math.fround),
    );
    // z축 90° 돌림: x 축이 y로 간다
    const turned = new Float32Array(16);
    writePartMatrix(turned, 0, {
      ...part,
      x: 0,
      y: 0,
      z: 0,
      sx: 1,
      sy: 1,
      sz: 1,
      rx: 0,
      ry: 0,
      rz: Math.PI / 2,
    });
    expect(turned[0]).toBeCloseTo(0, 6);
    expect(turned[1]).toBeCloseTo(1, 6);
    expect(turned[4]).toBeCloseTo(-1, 6);
    // 옮김 · 돌림 곱
    const move = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1];
    const out = new Float32Array(16);
    multiplyAffine(out, 0, move, 0, turned, 0);
    expect(out[12]).toBeCloseTo(5, 6);
    expect(out[13]).toBeCloseTo(6, 6);
    expect(out[14]).toBeCloseTo(7, 6);
    expect(out[1]).toBeCloseTo(1, 6);
    expect(out[15]).toBe(1);
    const back = new Float32Array(16);
    multiplyAffine(back, 0, turned, 0, move, 0);
    // 돌린 뒤 옮김: (5, 6, 7)이 z축 90° 돌아 (−6, 5, 7)
    expect(back[12]).toBeCloseTo(-6, 5);
    expect(back[13]).toBeCloseTo(5, 5);
    expect(back[14]).toBeCloseTo(7, 5);
  });
});
