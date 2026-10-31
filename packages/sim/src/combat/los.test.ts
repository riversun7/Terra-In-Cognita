import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { type BattleMapInput, COVER_BLOCK, COVER_BUSH, createBattleMap } from "./battleMap.ts";
import { lineClear } from "./los.ts";

function flatInput(size = 32): BattleMapInput {
  const cells = size * size;
  return {
    size,
    passable: new Uint8Array(cells).fill(1),
    cover: new Uint8Array(cells),
    height: new Int32Array(cells),
    buildings: [],
  };
}

const EYE = 16 * 180; // 1.8m(16배 cm)
const end = (x: number, y: number, air = false) => ({ x, y, eye: EYE, air });

describe("전투맵", () => {
  it("한 변은 32~128 짝수만 받는다(X16 기술 범위)", () => {
    expect(() => createBattleMap(flatInput(30))).toThrow(RangeError);
    expect(() => createBattleMap({ ...flatInput(32), size: 33 })).toThrow(RangeError);
    expect(createBattleMap(flatInput(64)).size).toBe(64);
  });

  it("성문은 그 편만 지나가고, 부서지면 누구나 지나간다(질문 97)", () => {
    const input = flatInput();
    input.buildings = [{ id: 1, cells: [5 * 32 + 5], durability: 100, nexus: false, gateSide: 2 }];
    const map = createBattleMap(input);
    const cell = 5 * 32 + 5;
    expect(map.passableFor(cell, 2, new Set())).toBe(true);
    expect(map.passableFor(cell, 1, new Set())).toBe(false);
    expect(map.passableFor(cell, 1, new Set([1]))).toBe(true);
  });
});

describe("시선(정수 직선, ADR 35)", () => {
  it("빈 땅은 보이고, 사이의 차폐 칸이나 건물은 막는다", () => {
    const input = flatInput();
    const map = createBattleMap(input);
    expect(lineClear(map, end(2, 2), end(20, 9), new Set())).toBe(true);
    input.cover[5 * 32 + 10] = COVER_BLOCK;
    const blocked = createBattleMap(input);
    expect(lineClear(blocked, end(2, 5), end(20, 5), new Set())).toBe(false);
    // 수풀(은폐)은 시선을 막지 않는다
    input.cover[5 * 32 + 10] = COVER_BUSH;
    expect(lineClear(createBattleMap(input), end(2, 5), end(20, 5), new Set())).toBe(true);
  });

  it("대각선 걸음의 양옆 두 칸이 모두 막으면 막히고, 한쪽만이면 지나간다", () => {
    const input = flatInput();
    input.cover[4 * 32 + 5] = COVER_BLOCK; // (5,4)
    const oneSide = createBattleMap(input);
    expect(lineClear(oneSide, end(4, 4), end(5, 5), new Set())).toBe(true);
    input.cover[5 * 32 + 4] = COVER_BLOCK; // (4,5)
    expect(lineClear(createBattleMap(input), end(4, 4), end(5, 5), new Set())).toBe(false);
  });

  it("언덕은 낮은 두 끝 사이를 가리고, 높은 곳에서는 넘겨 본다", () => {
    const input = flatInput();
    input.height[10 * 32 + 10] = 16 * 400; // 4m 언덕
    const hill = createBattleMap(input);
    expect(lineClear(hill, end(5, 10), end(15, 10), new Set())).toBe(false);
    const high = createBattleMap({
      ...input,
      height: input.height.map((h, i) => (i === 10 * 32 + 5 ? 16 * 2000 : h)),
    });
    expect(lineClear(high, end(5, 10), end(15, 10), new Set())).toBe(true);
  });

  it("공중 유닛이 한쪽 끝이면 차폐·언덕을 보지 않는다(D-227 ⑧)", () => {
    const input = flatInput();
    input.cover[5 * 32 + 10] = COVER_BLOCK;
    const map = createBattleMap(input);
    expect(lineClear(map, end(2, 5, true), end(20, 5), new Set())).toBe(true);
  });

  it("두 끝을 바꿔도 결과가 같다(대칭, 언덕 + 차폐 + 수풀을 섞은 무작위 지도)", () => {
    const rng = createRng(21);
    const input = flatInput(48);
    for (let i = 0; i < 48 * 48; i++) {
      const roll = rng.nextInt(100);
      input.cover[i] = roll < 6 ? COVER_BLOCK : roll < 16 ? COVER_BUSH : 0;
      input.height[i] = rng.nextInt(16 * 300);
    }
    const map = createBattleMap(input);
    let differ = 0;
    let blocked = 0;
    for (let n = 0; n < 4000; n++) {
      const a = end(rng.nextInt(48), rng.nextInt(48));
      const b = end(rng.nextInt(48), rng.nextInt(48));
      const ab = lineClear(map, a, b, new Set());
      if (ab !== lineClear(map, b, a, new Set())) differ += 1;
      if (!ab) blocked += 1;
    }
    expect(differ).toBe(0);
    expect(blocked).toBeGreaterThan(100);
  });
});
