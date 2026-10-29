// 지형 틀 시험(출력 판 3, 다양성 고침 3단계) — 고원·분지·구릉·산맥 단면 값의 범위, 해안선 흔들기가 바꾸는 칸
// (낮은 해안 땅·얕은 바다만, 땅·바다가 뒤바뀌는 칸만, 새 바다는 원래 바다와 이어짐), 봉우리 다듬기
import { describe, expect, it } from "vitest";
import { buildGrid, neighbors8 } from "./grid.ts";
import {
  HIGHLAND_RISE_M,
  HILL_RISE_M,
  alongStrength,
  coastOctaves,
  hillOctaves,
  hillRelief,
  interiorRelief,
  mountainShape,
  roughenCoasts,
  softenPeaks,
} from "./landforms.ts";
import { mix32 } from "./random.ts";
import { areaPercentile } from "./util.ts";

/** 면 레벨의 평균 칸 각도(grid.ts와 같은 식, 큰 격자를 만들지 않고) */
const cellAngleOf = (faceLevel: number) => Math.sqrt((4 * Math.PI) / (6 * 4 ** faceLevel));

/** 정수 해시로 고른 단위 벡터 k */
function unitPoint(k: number): [number, number, number] {
  const x = (mix32(k * 3 + 11) / 4_294_967_296) * 2 - 1;
  const y = (mix32(k * 3 + 12) / 4_294_967_296) * 2 - 1;
  const z = (mix32(k * 3 + 13) / 4_294_967_296) * 2 - 1;
  const length = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / length, y / length, z / length];
}

describe("값의 범위", () => {
  it("고원·분지 −250 ~ +1000m, 극 쪽(|z| ≥ 0.97)은 고원이 절반, 구릉 0 ~ 350m", () => {
    let highest = Number.NEGATIVE_INFINITY;
    let lowest = Number.POSITIVE_INFINITY;
    let polarHighest = Number.NEGATIVE_INFINITY;
    let hills = 0;
    for (let k = 0; k < 20_000; k++) {
      const [x, y, z] = unitPoint(k);
      const relief = interiorRelief(77, x, y, z, z);
      highest = Math.max(highest, relief);
      lowest = Math.min(lowest, relief);
      polarHighest = Math.max(polarHighest, interiorRelief(77, x, y, z, 0.98));
      const hill = hillRelief(77, x, y, z, 3);
      expect(hill).toBeGreaterThanOrEqual(0);
      expect(hill).toBeLessThanOrEqual(HILL_RISE_M);
      if (hill > 0) hills++;
    }
    expect(highest).toBeLessThanOrEqual(HIGHLAND_RISE_M);
    expect(highest).toBeGreaterThan(0.99 * HIGHLAND_RISE_M);
    expect(lowest).toBeGreaterThanOrEqual(-250);
    expect(lowest).toBeLessThan(-240);
    expect(polarHighest).toBeLessThanOrEqual(HIGHLAND_RISE_M / 2);
    // 구릉은 지역마다 있고 없다
    expect(hills / 20_000).toBeGreaterThan(0.2);
    expect(hills / 20_000).toBeLessThan(0.8);
  });

  it("산맥 단면 두 채널은 표준편차 약 1이고 ±2.5 안, 경계를 따라 바뀌는 세기는 0.3 ~ 1.4이고 표준편차 약 0.3", () => {
    const out = new Float64Array(2);
    const sums = [0, 0, 0];
    const squares = [0, 0, 0];
    const samples = 20_000;
    for (let k = 0; k < samples; k++) {
      const [x, y, z] = unitPoint(k);
      mountainShape(5, x, y, z, out);
      const along = alongStrength(5, x, y, z);
      expect(along).toBeGreaterThanOrEqual(0.3);
      expect(along).toBeLessThanOrEqual(1.4);
      const values = [out[0] ?? 0, out[1] ?? 0, along];
      values.forEach((value, i) => {
        sums[i] = (sums[i] ?? 0) + value;
        squares[i] = (squares[i] ?? 0) + value * value;
      });
      expect(Math.abs(out[0] ?? 0)).toBeLessThanOrEqual(2.5);
      expect(Math.abs(out[1] ?? 0)).toBeLessThanOrEqual(2.5);
    }
    const sd = (i: number) => {
      const mean = (sums[i] ?? 0) / samples;
      return Math.sqrt((squares[i] ?? 0) / samples - mean * mean);
    };
    expect(sd(0)).toBeGreaterThan(0.8);
    expect(sd(0)).toBeLessThan(1.2);
    expect(sd(1)).toBeGreaterThan(0.8);
    expect(sd(1)).toBeLessThan(1.2);
    expect(sd(2)).toBeGreaterThan(0.22);
    expect(sd(2)).toBeLessThan(0.36);
  });

  it("옥타브 수: 해안 노이즈는 F6 이하에서 끄고 F7 1 · F8 2 · F9 3, 구릉은 F6 2 · F7 이상 3", () => {
    expect([4, 5, 6, 7, 8, 9].map((level) => coastOctaves(cellAngleOf(level)))).toEqual([0, 0, 0, 1, 2, 3]);
    expect([5, 6, 7, 8, 9].map((level) => hillOctaves(cellAngleOf(level)))).toEqual([1, 2, 3, 3, 3]);
  });
});

describe("봉우리 다듬기", () => {
  it("8,000m까지는 그대로, 그 위는 늘 증가하고 10,000m 아래", () => {
    const heights = Float32Array.from({ length: 400 }, (_, k) => -2000 + k * 50);
    const softened = Float32Array.from(heights);
    softenPeaks(softened);
    for (let k = 0; k < heights.length; k++) {
      const before = heights[k] ?? 0;
      const after = softened[k] ?? 0;
      if (before <= 8000) expect(after).toBe(before);
      else {
        expect(after).toBeLessThan(before);
        expect(after).toBeLessThan(10_000);
        expect(after).toBeGreaterThan(softened[k - 1] ?? 0);
      }
    }
  });
});

/** 시험용 지형: 위도 띠 경사(적도 북쪽 땅) + 칸마다 작은 해시 기복. 낮은 해안 평야와 가파른 해안이 함께 있다 */
function testTerrain(faceLevel: number): { grid: ReturnType<typeof buildGrid>; elevation: Float32Array } {
  const grid = buildGrid(faceLevel);
  const elevation = new Float32Array(grid.cellCount);
  for (let c = 0; c < grid.cellCount; c++) {
    const z = grid.z[c] ?? 0;
    const x = grid.x[c] ?? 0;
    // 동반구(x > 0)는 완만한 해안(1km 오를 때 약 1,300km), 서반구는 가파른 해안
    const slope = x > 0 ? 5000 : 60_000;
    elevation[c] = slope * (z - 0.2) + ((mix32(c + 1) % 41) - 20);
  }
  return { grid, elevation };
}

describe("해안선 흔들기", () => {
  it("낮은 해안 땅·얕은 바다만, 땅·바다가 뒤바뀌는 칸만 바꾸고, 새 바다는 원래 바다와 이어진다", () => {
    const { grid, elevation } = testTerrain(7);
    const before = Float32Array.from(elevation);
    const landPercent = 40;
    const seaLevel = areaPercentile(grid, before, 1 - landPercent / 100);
    roughenCoasts(grid, 123, grid.x, grid.y, grid.z, elevation, landPercent, 1);
    let changed = 0;
    let newLand = 0;
    let newSea = 0;
    const out = new Int32Array(8);
    for (let c = 0; c < grid.cellCount; c++) {
      const old = before[c] ?? 0;
      const now = elevation[c] ?? 0;
      if (Object.is(old, now)) continue;
      changed++;
      // 바뀐 칸은 낮은 땅(+300m 안)이거나 얕은 바다(−300m 안)였다
      expect(Math.abs(old - seaLevel)).toBeLessThanOrEqual(300);
      // 땅·바다가 뒤바뀐다
      expect(old > seaLevel).not.toBe(now > seaLevel);
      if (now > seaLevel) newLand++;
      else newSea++;
    }
    expect(newLand).toBeGreaterThan(20);
    expect(newSea).toBeGreaterThan(20);
    expect(changed).toBe(newLand + newSea);
    // 새 바다 칸은 원래 바다와(새 바다 칸을 거쳐) 이어진다: 원래 바다에서 새 바다 칸으로만 퍼져 모두 닿아야 한다
    const reached = new Uint8Array(grid.cellCount);
    const queue: number[] = [];
    for (let c = 0; c < grid.cellCount; c++) {
      if ((before[c] ?? 0) <= seaLevel) {
        reached[c] = 1;
        queue.push(c);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      neighbors8(grid, queue[head] ?? 0, out);
      for (const next of out) {
        if (next < 0 || reached[next] === 1) continue;
        if ((before[next] ?? 0) > seaLevel && (elevation[next] ?? 0) <= seaLevel) {
          reached[next] = 1;
          queue.push(next);
        }
      }
    }
    for (let c = 0; c < grid.cellCount; c++) {
      if ((before[c] ?? 0) > seaLevel && (elevation[c] ?? 0) <= seaLevel)
        expect(reached[c], `cell ${c}`).toBe(1);
    }
  });

  it("완만한 해안이 가파른 해안과 비슷한 거리만큼 굽는다(높이 노이즈라면 완만한 쪽만 크게 바뀐다)", () => {
    const { grid, elevation } = testTerrain(7);
    const before = Float32Array.from(elevation);
    roughenCoasts(grid, 123, grid.x, grid.y, grid.z, elevation, 40, 1);
    let gentle = 0;
    let steep = 0;
    for (let c = 0; c < grid.cellCount; c++) {
      if (Object.is(before[c], elevation[c])) continue;
      if ((grid.x[c] ?? 0) > 0) gentle++;
      else steep++;
    }
    expect(steep).toBeGreaterThan(0);
    // 가파른 쪽은 +300m 창이 좁아 조금 덜 바뀌지만 같은 크기 정도다
    expect(gentle / steep).toBeLessThan(4);
  });

  it("칸이 크면(F6) 또는 기복 0이면 아무것도 바꾸지 않고, 같은 입력은 같은 결과다", () => {
    const coarse = testTerrain(6);
    const coarseBefore = Float32Array.from(coarse.elevation);
    roughenCoasts(coarse.grid, 123, coarse.grid.x, coarse.grid.y, coarse.grid.z, coarse.elevation, 40, 1);
    expect(coarse.elevation).toEqual(coarseBefore);
    const flat = testTerrain(7);
    const flatBefore = Float32Array.from(flat.elevation);
    roughenCoasts(flat.grid, 123, flat.grid.x, flat.grid.y, flat.grid.z, flat.elevation, 40, 0);
    expect(flat.elevation).toEqual(flatBefore);
    const a = testTerrain(7);
    const b = testTerrain(7);
    roughenCoasts(a.grid, 9, a.grid.x, a.grid.y, a.grid.z, a.elevation, 40, 1);
    roughenCoasts(b.grid, 9, b.grid.x, b.grid.y, b.grid.z, b.elevation, 40, 1);
    expect(a.elevation).toEqual(b.elevation);
  });
});
