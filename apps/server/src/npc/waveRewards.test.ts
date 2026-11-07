// 정원사 2(서버) 시험 — 막아 낸 웨이브 보상 아이템(D-499)·정원사 상태 저장 모양(관계도·명성)·웨이브 끔 스위치의 보호 레이드(D-500).
// docs/adr/2026-11-01-gardener-r5b.md "바뀜 (2026-11-07, 정원사 2)". 저장소 팩은 보유 물건 시험 자료(testContent.ts)로 읽는다.
import { TEST_GARDENER_COEFFICIENTS, createLedgerBook, waveReward } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import { parseStoredGardener } from "./gardener.ts";
import { gardenerRulesOf } from "./runtime.ts";
import { grantWaveReward, rewardRecordOf, waveRewardItemsOf } from "./waveRewards.ts";

/** 저장소 팩 아이템(+ 보유 물건 시험 아이템 — 유전자·크리쳐 재료가 아니다) */
const packItems = () => TEST_HOLDING_CONTENT.items;

const counter = () => {
  let n = 0;
  return () => {
    n += 1;
    return n;
  };
};

describe("막아 낸 웨이브 보상(D-499)", () => {
  it("팩: 유전자 조각은 gene.drops에 wave가 있는 것(크리쳐 스탯 조각), 크리쳐 재료 중분류는 지금 비어 있다", () => {
    const items = waveRewardItemsOf(packItems());
    expect(items.genes).toEqual(["gene_stat_creature"]);
    expect(items.materials).toEqual([]);
  });

  it("크리쳐 재료만 그 소유 주체 장부에 시스템 발행으로 낸다, 유전자는 인스턴스(D-516)라 양만 기록한다", () => {
    const ledger = createLedgerBook({ nextAccountId: counter(), nextTxId: counter() });
    const reward = waveReward("city", 15, TEST_GARDENER_COEFFICIENTS);
    const granted = grantWaveReward(
      ledger,
      42,
      reward,
      { genes: ["gene_stat_creature"], materials: ["fake_hide"] },
      1000,
    );
    expect(granted).toEqual([{ item: "fake_hide", quantity: 7 }]);
    expect(ledger.balanceOf(42, "gene_stat_creature")).toBe(0n);
    expect(ledger.balanceOf(42, "fake_hide")).toBe(7n);
    expect(JSON.parse(rewardRecordOf(reward, granted))).toEqual({
      renown: 150,
      genes: 1,
      materials: 7,
      items: [["fake_hide", 7]],
    });
  });

  it("보호 레이드는 아무것도 주지 않는다(D-500)", () => {
    const ledger = createLedgerBook({ nextAccountId: counter(), nextTxId: counter() });
    const reward = waveReward("protection", 40, TEST_GARDENER_COEFFICIENTS);
    expect(grantWaveReward(ledger, 42, reward, { genes: ["g"], materials: ["m"] }, 0)).toEqual([]);
    expect([...ledger.accounts()]).toHaveLength(0);
  });
});

describe("정원사 상태 저장(npc_society.gardener)", () => {
  it("옛 줄(관계도·명성 없음)은 빈 표로 읽고, 새 줄은 짝 목록을 읽는다(틀린 짝은 건너뜀)", () => {
    const old = parseStoredGardener({ mothershipCell: 7, nextWaveId: 3, nomads: [] });
    expect(old?.relations).toEqual([]);
    expect(old?.renown).toEqual([]);
    const next = parseStoredGardener({
      mothershipCell: 7,
      nextWaveId: 3,
      nomads: [],
      relations: [
        [12, -40],
        [13, 75],
        ["x", 1],
      ],
      renown: [[12, 300]],
    });
    expect(next?.relations).toEqual([
      [12, -40],
      [13, 75],
    ]);
    expect(next?.renown).toEqual([[12, 300]]);
  });
});

describe("웨이브 끔 스위치(GARDENER_WAVES, 49 N53)", () => {
  it("끄면 보호 레이드 세기 배율도 0(레이드 없음), 관계도 계수는 그대로", () => {
    const off = gardenerRulesOf(TEST_GARDENER_COEFFICIENTS, false);
    expect(off.raidStrengthPm).toBe(0);
    expect(off.relationPollutionStep).toBe(TEST_GARDENER_COEFFICIENTS.relationPollutionStep);
    expect(gardenerRulesOf(TEST_GARDENER_COEFFICIENTS, true).raidStrengthPm).toBe(2000);
  });
});
