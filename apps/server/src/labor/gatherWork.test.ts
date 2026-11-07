// 채집 직무 산출 시험 — 진행 쌓기·필요 진행·수확량·나눠 셈해도 같음(docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산")
import {
  type CatalogGather,
  GATHER_TIERS,
  type Primaries,
  TEST_GATHER_BANDS,
  TEST_SOCIETY_COEFFICIENTS,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type GatherProgress, type GatherSite, gatherLots, gatherSettingsOf, statOf } from "./gatherWork.ts";

const CYCLE_MS = 60_000;

/** 벌목장 꼴(팩 lumber_camp: DEX 주·STR 보조, 1 + 0.10/점, 상한 10) — 사다리는 T0 소나무·T1 자작나무만 */
const wood: CatalogGather = {
  primary: "dex",
  secondary: "str",
  subcategory: "wood",
  yieldBase: 1,
  yieldPerStatPm: 100,
  yieldCap: 10,
};

function ladderOf(tiers: Record<number, string[]>): string[][] {
  return Array.from({ length: GATHER_TIERS }, (_, tier) => tiers[tier] ?? []);
}

const site = (rule: CatalogGather, ladder: string[][]): GatherSite => ({
  buildingId: 7,
  facilityId: "lumber_camp",
  level: 1,
  rule,
  ladder,
  bands: TEST_GATHER_BANDS,
  lotSize: new Map(),
  cityId: 3,
});

const tens: Primaries = { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 };
const settings = gatherSettingsOf(TEST_SOCIETY_COEFFICIENTS);

describe("채집 직무 산출(서버, 시뮬과 같은 규칙 함수)", () => {
  it("스탯 코드 → 값, 모르는 코드는 undefined", () => {
    expect(statOf(tens, "dex")).toBe(10);
    expect(statOf({ ...tens, wis: 4 }, "wis")).toBe(4);
    expect(statOf(tens, "luck")).toBeUndefined();
  });

  it("스탯 10(진행 1)·T0만 있는 사다리: 30주기(= 30분)에 묶음 하나, 수확량 1 + ⌊10 × 0.1⌋ = 2개", () => {
    const only = site(wood, ladderOf({ 0: ["item:pine_log"] }));
    const input = { unitId: 11, site: only, primaries: tens, settings, cycleMs: CYCLE_MS };
    const short = gatherLots({ points: 0, seq: 0 }, 29, input);
    expect(short.lots).toBe(0);
    expect(short.outputs).toEqual([]);
    expect(short.points).toBe(29 * CYCLE_MS);
    const full = gatherLots(short, 1, input);
    expect(full.lots).toBe(1);
    expect(full.seq).toBe(1);
    expect(full.points).toBe(0);
    expect(full.outputs).toEqual([{ asset: "item:pine_log", qty: 2n }]);
  });

  it("나눠 셈해도 한 번에 센 것과 같다(같은 묶음 차례는 같은 물건)", () => {
    const two = site(wood, ladderOf({ 0: ["item:pine_log"], 1: ["item:birch_log"] }));
    const input = {
      unitId: 42,
      site: two,
      primaries: { ...tens, dex: 45, str: 30 },
      settings,
      cycleMs: CYCLE_MS,
    };
    const once = gatherLots({ points: 0, seq: 0 }, 2_000, input);
    let pieces: GatherProgress = { points: 0, seq: 0 };
    const total = new Map<string, bigint>();
    for (const made of [1, 7, 300, 2, 690, 1_000]) {
      const step = gatherLots(pieces, made, input);
      pieces = step;
      for (const stack of step.outputs) total.set(stack.asset, (total.get(stack.asset) ?? 0n) + stack.qty);
    }
    expect({ points: pieces.points, seq: pieces.seq }).toEqual({ points: once.points, seq: once.seq });
    expect(Object.fromEntries(total)).toEqual(
      Object.fromEntries(once.outputs.map((stack) => [stack.asset, stack.qty])),
    );
    // 진행 = max(1, ⌊45 ÷ 20⌋) = 2 → 2,000주기 = 4,000 진행. T0 30·T1 60이라 묶음은 66~133개
    expect(once.seq).toBeGreaterThanOrEqual(66);
    expect(once.seq).toBeLessThanOrEqual(133);
  });

  it("선택 방식(농장): 해금 티어 = ⌊(주 + 보조) ÷ 20⌋에서 고르고 그 티어의 필요 진행을 쓴다", () => {
    const farm: CatalogGather = {
      primary: "vit",
      secondary: "int",
      subcategory: "crop",
      mode: "select",
      yieldBase: 1,
      yieldPerStatPm: 80,
      yieldCap: 8,
    };
    const crops = site(farm, ladderOf({ 0: ["item:hay"], 1: ["item:potato"] }));
    // (10 + 10) ÷ 20 = T1 → 필요 진행 60 = 60주기
    const lots = gatherLots({ points: 0, seq: 0 }, 60, {
      unitId: 5,
      site: crops,
      primaries: tens,
      settings,
      cycleMs: CYCLE_MS,
    });
    expect(lots.lots).toBe(1);
    expect(lots.outputs).toEqual([{ asset: "item:potato", qty: 1n }]);
  });
});
