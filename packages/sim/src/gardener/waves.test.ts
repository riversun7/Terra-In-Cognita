import { describe, expect, it } from "vitest";
import { type GardenerCoefficients, TEST_GARDENER_COEFFICIENTS } from "./coefficients.ts";
import {
  bitLength,
  floorLog2,
  grantGardenerUnits,
  mothershipCap,
  physicalCount,
  physicalPm,
  waveArrivalMs,
  waveChancePm,
  waveStrength,
} from "./waves.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 공식은 D-460 원래 값으로 본다(세기 기본 4·물리형 나눗수 200 — D-468로 맞춘 출발값과 따로, 계수 값만 바뀌어도 시험이 그대로) */
const c: GardenerCoefficients = { ...TEST_GARDENER_COEFFICIENTS, strengthBase: 4, physicalDivisor: 200 };

describe("정원사 웨이브 공식(D-460 201, C14~C18)", () => {
  it("확률 ‰ = min(300, 영향권 오염 합 ÷ 100), 쉬는 시간 중이면 절반(내림)", () => {
    expect(waveChancePm(0, false, c)).toBe(0);
    expect(waveChancePm(99, false, c)).toBe(0);
    expect(waveChancePm(12_345, false, c)).toBe(123);
    expect(waveChancePm(90_000, false, c)).toBe(300);
    expect(waveChancePm(12_345, true, c)).toBe(61);
    expect(waveChancePm(90_000, true, c)).toBe(150);
  });

  it("⌊log2⌋는 정수 비트 길이 − 1(실수 로그 없음, 201 덧붙임)", () => {
    expect([1n, 2n, 3n, 4n, 7n, 8n, 1023n, 1024n].map(bitLength)).toEqual([1, 2, 2, 3, 3, 4, 10, 11]);
    expect(floorLog2(1n)).toBe(0);
    expect(floorLog2(5n)).toBe(2);
    expect(floorLog2(2n ** 70n + 1n)).toBe(70);
    expect(() => floorLog2(0n)).toThrow(RangeError);
  });

  it("세기 = 4 × (1 + ⌊log2(1 + 도시 + 휴먼 ÷ 50 + 국고 ÷ 100만)⌋)", () => {
    // x = 1 + 4 + 0 + 0 = 5 → 2 → 12
    expect(waveStrength({ cities: 4, humans: 40, treasury: 200_000n }, c)).toBe(12);
    // x = 1 + 1 → 1 → 8
    expect(waveStrength({ cities: 1, humans: 0, treasury: 0n }, c)).toBe(8);
    // 대국: x = 1 + 30 + 600 ÷ 50 + 3억 ÷ 100만 = 1 + 30 + 12 + 300 = 343 → 8 → 36
    expect(waveStrength({ cities: 30, humans: 600, treasury: 300_000_000n }, c)).toBe(36);
    // 빚(음수 국고)은 0으로 본다
    expect(waveStrength({ cities: 0, humans: 0, treasury: -5n }, c)).toBe(4);
  });

  it("도착 = 생성 + max(이동, 예고 8시간)", () => {
    expect(waveArrivalMs(1_000, 0, c)).toBe(1_000 + 8 * HOUR);
    expect(waveArrivalMs(1_000, 10 * HOUR, c)).toBe(1_000 + 10 * HOUR);
  });

  it("물리형 ‰ = min(500, 합 ÷ 200), 마리 수는 내림(질문 214 가)", () => {
    expect(physicalPm(30_000, c)).toBe(150);
    expect(physicalPm(200_000, c)).toBe(500);
    expect(physicalCount(12, 150)).toBe(1);
    expect(physicalCount(36, 500)).toBe(18);
  });

  it("모함 몫 = 유닛 예산의 5%, 진군·전투 중인 수를 빼고 준다(질문 222 가)", () => {
    expect(mothershipCap(c)).toBe(5_000);
    expect(grantGardenerUnits(12, 0, c)).toBe(12);
    expect(grantGardenerUnits(12, 4_995, c)).toBe(5);
    // 웨이브 하나의 최소(세기 기본 4)보다 적게 남으면 주지 않는다
    expect(grantGardenerUnits(12, 4_997, c)).toBe(0);
    expect(grantGardenerUnits(12, 6_000, c)).toBe(0);
  });

  it("출발값: 세기 기본·물리형 나눗수는 D-468 목표(C16a: 합 ≥ 30,000 웨이브의 약 1/3 승)로 맞춘 5·100", () => {
    expect([
      TEST_GARDENER_COEFFICIENTS.strengthBase,
      TEST_GARDENER_COEFFICIENTS.physicalDivisor,
      TEST_GARDENER_COEFFICIENTS.targetWinPm,
      TEST_GARDENER_COEFFICIENTS.targetSum,
    ]).toEqual([5, 100, 333, 30_000]);
    // 4도시 세력 세기 15, 합 30,000 → 물리형 ⌊15 × 300‰⌋ = 4
    const t = TEST_GARDENER_COEFFICIENTS;
    expect(
      physicalCount(waveStrength({ cities: 4, humans: 40, treasury: 0n }, t), physicalPm(30_000, t)),
    ).toBe(4);
  });

  it("쉬는 시간 길이는 7일", () => {
    expect(c.cooldownMs).toBe(7 * DAY);
  });
});
