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

  it("묶음 상한(채집소 반경 안 남은 번수): 닿으면 멈추고 진행은 묶음 하나 몫까지만 남는다", () => {
    const only = site(wood, ladderOf({ 0: ["item:pine_log"] }));
    const input = { unitId: 11, site: only, primaries: tens, settings, cycleMs: CYCLE_MS };
    // 120주기 = 묶음 넷 몫, 상한 1 → 하나만, 진행 = 묶음 하나 몫(30주기), 막힘
    const capped = gatherLots({ points: 0, seq: 0 }, 120, { ...input, maxLots: 1 });
    expect(capped).toMatchObject({ lots: 1, seq: 1, capped: true, points: 30 * CYCLE_MS });
    expect(capped.outputs).toEqual([{ asset: "item:pine_log", qty: 2n }]);
    // 상한 0: 묶음 없음
    expect(gatherLots({ points: 0, seq: 0 }, 120, { ...input, maxLots: 0 })).toMatchObject({
      lots: 0,
      capped: true,
      outputs: [],
    });
    // 상한이 넉넉하면 막히지 않는다(상한 없음과 같다)
    const free = gatherLots({ points: 0, seq: 0 }, 120, input);
    expect(gatherLots({ points: 0, seq: 0 }, 120, { ...input, maxLots: 10 })).toEqual(free);
    expect(free).toMatchObject({ lots: 4, capped: false });
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

  it("약초원(추첨 INT + WIS)·목장(선택 WIS + AGI): 앞 셋과 같은 함수가 스탯 짝만 바꿔 돈다", () => {
    const herb: CatalogGather = {
      primary: "int",
      secondary: "wis",
      subcategory: "herb",
      yieldBase: 1,
      yieldPerStatPm: 100,
      yieldCap: 8,
    };
    const stats: Primaries = { str: 1, dex: 1, agi: 30, vit: 1, int: 40, wis: 30 };
    // INT 40 → 진행 2, WIS 30 → 한 번에 1 + 3 = 4개. T0만 있는 사다리: 30 진행 = 15주기에 묶음 하나
    const herbs = gatherLots({ points: 0, seq: 0 }, 15, {
      unitId: 21,
      site: site(herb, ladderOf({ 0: ["item:wild_herb"] })),
      primaries: stats,
      settings,
      cycleMs: CYCLE_MS,
    });
    expect(herbs.lots).toBe(1);
    expect(herbs.outputs).toEqual([{ asset: "item:wild_herb", qty: 4n }]);
    const ranch: CatalogGather = {
      primary: "wis",
      secondary: "agi",
      subcategory: "livestock_product",
      mode: "select",
      yieldBase: 1,
      yieldPerStatPm: 80,
      yieldCap: 6,
    };
    // WIS 30 + AGI 30 = 60 → 해금 T3, 사다리는 T2까지 → 양고기(T2, 필요 진행 90). WIS 30 → 진행 1, AGI 30 → 1 + 2 = 3개
    const meat = gatherLots({ points: 0, seq: 0 }, 90, {
      unitId: 22,
      site: site(ranch, ladderOf({ 0: ["item:raw_meat"], 2: ["item:mutton"] })),
      primaries: stats,
      settings,
      cycleMs: CYCLE_MS,
    });
    expect(meat.lots).toBe(1);
    expect(meat.outputs).toEqual([{ asset: "item:mutton", qty: 3n }]);
  });

  it("낚시터(성공 확률 뒤 추첨 AGI + DEX): 실패한 시도는 시간만 들고 아무것도 내지 않는다", () => {
    const fishing: CatalogGather = {
      primary: "agi",
      secondary: "dex",
      subcategory: "fish",
      yieldBase: 1,
      yieldPerStatPm: 100,
      yieldCap: 5,
      catch: { basePm: 300, maxPm: 800, statPm: 500, fullStat: 200 },
    };
    const input = {
      unitId: 31,
      site: site(fishing, ladderOf({ 0: ["item:loach"] })),
      primaries: tens,
      settings,
      cycleMs: CYCLE_MS,
    };
    // 스탯 10·10: 성공 350‰, 한 번에 2마리. 시도 하나 = T0 30주기 → 30,000주기 = 시도 1,000번
    const result = gatherLots({ points: 0, seq: 0 }, 30_000, input);
    expect(result.lots).toBe(1000);
    const fish = Number(result.outputs[0]?.qty ?? 0n);
    expect(result.outputs.map((stack) => stack.asset)).toEqual(["item:loach"]);
    expect(fish % 2).toBe(0);
    expect(Math.abs(fish / 2 - 350)).toBeLessThan(50);
    // 성공 확률을 늘 성공(1000‰)으로 두면 시도마다 낚는다
    const always = gatherLots({ points: 0, seq: 0 }, 30_000, {
      ...input,
      site: site(
        { ...fishing, catch: { basePm: 1000, maxPm: 1000, statPm: 0, fullStat: 200 } },
        input.site.ladder,
      ),
    });
    expect(always.outputs).toEqual([{ asset: "item:loach", qty: 2000n }]);
    // 나눠 셈해도 같다(시도 차례마다 같은 난수)
    let progress: GatherProgress = { points: 0, seq: 0 };
    let total = 0n;
    for (let i = 0; i < 100; i++) {
      const step = gatherLots(progress, 300, input);
      progress = step;
      total += step.outputs[0]?.qty ?? 0n;
    }
    expect(total).toBe(result.outputs[0]?.qty);
  });
});
