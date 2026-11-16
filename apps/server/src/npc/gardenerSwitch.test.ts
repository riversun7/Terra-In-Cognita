// 정원사 웨이브 스위치(GARDENER_WAVES) 시험 — 사용자 결정(2026-11-01 "합치되 웨이브 끔")
import { TEST_GARDENER_COEFFICIENTS, waveChancePm } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { readConfig } from "../config.ts";
import { gardenerRulesOf, gardenerWavesEnabled } from "./gardenerSwitch.ts";

describe("정원사 웨이브 스위치", () => {
  it("운영 설정은 기본 끔이고 GARDENER_WAVES=1 또는 운영 스위치(n53_gardener_waves=1)면 켠다", () => {
    expect(readConfig({}).npc.gardenerWaves).toBe(false);
    expect(readConfig({ GARDENER_WAVES: "0" }).npc.gardenerWaves).toBe(false);
    expect(readConfig({ GARDENER_WAVES: "1" }).npc.gardenerWaves).toBe(true);
    expect(gardenerWavesEnabled(false, 0)).toBe(false);
    expect(gardenerWavesEnabled(false, 1)).toBe(true);
    expect(gardenerWavesEnabled(undefined, 0)).toBe(true);
  });

  it("끄면 오염이 상한이어도 도시 웨이브 확률이 0이고, 켜면 계수표 그대로다", () => {
    const off = gardenerRulesOf(TEST_GARDENER_COEFFICIENTS, false);
    expect(off.chanceMaxPm).toBe(0);
    expect(waveChancePm(1_000_000, false, off)).toBe(0);
    // 오염 층 계수(쌓임·감소·퍼짐)는 그대로라 오염은 계속 쌓인다
    expect(off.decayBp).toBe(TEST_GARDENER_COEFFICIENTS.decayBp);
    expect(off.humanStep).toBe(TEST_GARDENER_COEFFICIENTS.humanStep);
    const on = gardenerRulesOf(TEST_GARDENER_COEFFICIENTS, true);
    expect(on).toBe(TEST_GARDENER_COEFFICIENTS);
    expect(waveChancePm(1_000_000, false, on)).toBeGreaterThan(0);
  });
});
