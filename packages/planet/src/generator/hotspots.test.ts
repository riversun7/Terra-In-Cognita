// 열점 사슬 시험(출력 판 3, 다양성 고침 3단계) — 사슬 길이·간격·높이·굽음이 사슬마다 다른지, 화산 높이 더하기를
// 묶음으로 거른 결과가 모든 화산을 보는 계산과 비트까지 같은지
import { NORMAL_PRESETS, detExp, resolvePlanetSettings } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { buildGrid } from "./grid.ts";
import {
  HOTSPOT_MAX_CONES,
  HOTSPOT_MIN_CONES,
  type Volcano,
  addVolcanoes,
  hotspotVolcanoes,
} from "./hotspots.ts";
import { createPlates } from "./plates.ts";
import { STREAM_PLATE_WARP, mix32, streamSeed } from "./random.ts";
import { S2_TEST_PLANET_SEED } from "./testFixtures.ts";
import { hotspotSpacing } from "./testVarietyUnit.ts";
import { km } from "./util.ts";

/** 열점 많음 설정(열점 12개)으로 시드 하나의 화산 목록 */
function chainsOf(seed: number): Volcano[] {
  const settings = resolvePlanetSettings({ ...NORMAL_PRESETS, volcanism: "high" });
  const continentalShare = (settings.landPercent + settings.shelfPercent) / 100;
  const plates = createPlates(seed, settings.plateCount, continentalShare);
  return hotspotVolcanoes(
    seed,
    plates,
    streamSeed(seed, STREAM_PLATE_WARP),
    settings.hotspotCount,
    settings.volcanismPercent / 100,
    () => false,
  );
}

/** 모든 화산을 보는 계산(출력 판 2의 addVolcanoes와 같은 식, 같은 결정적 지수 함수) */
function naiveVolcanoes(
  sx: Float64Array,
  sy: Float64Array,
  sz: Float64Array,
  elevation: Float32Array,
  volcanoes: readonly Volcano[],
): void {
  for (let c = 0; c < elevation.length; c++) {
    let add = 0;
    for (const volcano of volcanoes) {
      const dx = (sx[c] ?? 0) - volcano.x;
      const dy = (sy[c] ?? 0) - volcano.y;
      const dz = (sz[c] ?? 0) - volcano.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const r2 = volcano.radius * volcano.radius;
      if (d2 < 9 * r2) add += volcano.height * detExp(-d2 / r2);
    }
    if (add !== 0) elevation[c] = (elevation[c] ?? 0) + add;
  }
}

/** 두 걸음(현) 방향 사이 각도(도) */
function turnDegrees(a: Volcano, b: Volcano, c: Volcano): number | undefined {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const vz = c.z - b.z;
  const lu = Math.sqrt(ux * ux + uy * uy + uz * uz);
  const lv = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (lu < 1e-9 || lv < 1e-9) return undefined;
  const cos = Math.min(1, (ux * vx + uy * vy + uz * vz) / (lu * lv));
  return (Math.acos(cos) * 180) / Math.PI;
}

describe("열점 사슬 모양", () => {
  it("사슬마다 화산 3~12개, 사슬 번호는 열점 순서이고 같은 사슬 화산은 이어서 나온다", () => {
    for (const seed of [S2_TEST_PLANET_SEED, 1, 2, 3, 42]) {
      const volcanoes = chainsOf(seed);
      const lengths = new Map<number, number>();
      let last = -1;
      for (const volcano of volcanoes) {
        expect(volcano.chain, `seed ${seed}`).toBeGreaterThanOrEqual(last);
        last = volcano.chain;
        lengths.set(volcano.chain, (lengths.get(volcano.chain) ?? 0) + 1);
      }
      expect(lengths.size).toBe(12);
      for (const length of lengths.values()) {
        expect(length).toBeGreaterThanOrEqual(HOTSPOT_MIN_CONES);
        expect(length).toBeLessThanOrEqual(HOTSPOT_MAX_CONES);
      }
    }
  });

  it("사슬 길이가 사슬마다 다르다(시드 8개 × 사슬 12개에서 길이 6가지 이상)", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 8; seed++) {
      const lengths = new Map<number, number>();
      for (const volcano of chainsOf(seed)) lengths.set(volcano.chain, (lengths.get(volcano.chain) ?? 0) + 1);
      for (const length of lengths.values()) seen.add(length);
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it("이웃 화산 간격의 변동 계수 ≥ 0.15(출력 판 2는 0.01), 평균 간격은 약 240km(실제 환산)", () => {
    const settings = resolvePlanetSettings(NORMAL_PRESETS);
    for (const seed of [S2_TEST_PLANET_SEED, 1, 42]) {
      const spacing = hotspotSpacing(seed, settings);
      expect(spacing.cv, `seed ${seed}`).toBeGreaterThanOrEqual(0.15);
      expect(spacing.meanGapKm).toBeGreaterThan(200);
      expect(spacing.meanGapKm).toBeLessThan(280);
      expect(spacing.minCones).toBeGreaterThanOrEqual(HOTSPOT_MIN_CONES);
      expect(spacing.maxCones).toBeLessThanOrEqual(HOTSPOT_MAX_CONES);
    }
  });

  it("사슬 안에서 오래된 화산일수록 낮고, 걸음마다 방향이 12° 안에서 굽는다(대부분 걸음이 굽는다)", () => {
    let bent = 0;
    let steps = 0;
    for (const seed of [S2_TEST_PLANET_SEED, 1, 42]) {
      const volcanoes = chainsOf(seed);
      for (let k = 2; k < volcanoes.length; k++) {
        const a = volcanoes[k - 2];
        const b = volcanoes[k - 1];
        const c = volcanoes[k];
        if (!a || !b || !c || a.chain !== c.chain) continue;
        expect(c.height).toBeLessThan(b.height);
        const degrees = turnDegrees(a, b, c);
        if (degrees === undefined) continue;
        // 현으로 잰 각도라 구 곡률 몫(간격 약 240km에서 0.1° 미만)만큼 여유를 둔다
        expect(degrees).toBeLessThan(12.5);
        steps++;
        if (degrees > 1) bent++;
      }
    }
    expect(steps).toBeGreaterThan(50);
    expect(bent / steps).toBeGreaterThan(0.8);
  });
});

describe("화산 높이 더하기 (묶음으로 거르기)", () => {
  it("모든 화산을 보는 계산과 비트까지 같다: 큰·작은 반지름, 면 경계·꼭짓점 근처 포함", () => {
    const grid = buildGrid(6);
    const volcanoes: Volcano[] = [];
    for (let k = 0; k < 160; k++) {
      // 정수 해시로 고른 방향(10개 중 하나는 정육면체 꼭짓점, 하나는 면 경계 근처)
      let x = (mix32(k * 7 + 1) / 4_294_967_296) * 2 - 1;
      let y = (mix32(k * 7 + 2) / 4_294_967_296) * 2 - 1;
      let z = (mix32(k * 7 + 3) / 4_294_967_296) * 2 - 1;
      if (k % 10 === 0) [x, y, z] = [1, 1, 1];
      if (k % 10 === 1) [x, y, z] = [1, 0.999, (mix32(k) / 4_294_967_296) * 2 - 1];
      const length = Math.sqrt(x * x + y * y + z * z);
      volcanoes.push({
        x: x / length,
        y: y / length,
        z: z / length,
        height: 500 + (mix32(k * 7 + 5) % 6000),
        radius: km(40 + (mix32(k * 7 + 4) % 400)),
        chain: Math.floor(k / 12),
      });
    }
    const start = Float32Array.from({ length: grid.cellCount }, (_, c) => (mix32(c + 9) % 2000) - 1000);
    const culled = Float32Array.from(start);
    const naive = Float32Array.from(start);
    addVolcanoes(grid, grid.x, grid.y, grid.z, culled, volcanoes);
    naiveVolcanoes(grid.x, grid.y, grid.z, naive, volcanoes);
    let differences = 0;
    let raised = 0;
    for (let c = 0; c < grid.cellCount; c++) {
      if (!Object.is(culled[c], naive[c])) differences++;
      if (culled[c] !== start[c]) raised++;
    }
    expect(differences).toBe(0);
    // 화산이 실제로 높이를 더했다(빈 시험이 아니다)
    expect(raised).toBeGreaterThan(grid.cellCount / 10);
  });
});
