import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  OLD_RECRUIT_COEFFICIENTS,
  type RecruitCoefficients,
  distributeRecruitElements,
  distributeRecruitStats,
  recruitCards,
  recruitCost,
  recruitElementSlots,
  recruitElementsFromSlots,
  recruitProfileOf,
  recruitWindow,
  recruitWindowEndMs,
  rollRecruitCards,
  takeRecruitSlot,
  takenNow,
} from "./recruitment.ts";

const c = OLD_RECRUIT_COEFFICIENTS;
const HOUR = 3_600_000;
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

describe("구인 카드 옛 규칙(D-469·49 N45, 옛 hq_routes.js)", () => {
  it("레벨마다 카드 수·토탈 스탯 범위 안, 6스탯 합 = 토탈, 칸마다 ⌊토탈 ÷ 12⌋ 이상, 비용 = 등급 × 50 + (토탈 − 최소) × 2", () => {
    for (let level = 1; level <= 5; level++) {
      const rule = c.levels[level - 1];
      if (!rule) throw new Error("level");
      const counts = new Set<number>();
      const totals = new Set<number>();
      for (let seed = 1; seed <= 400; seed++) {
        const cards = rollRecruitCards(level, createRng(seed), c);
        counts.add(cards.length);
        expect(cards.length).toBeGreaterThanOrEqual(rule.cardsMin);
        expect(cards.length).toBeLessThanOrEqual(rule.cardsMax);
        cards.forEach((card, index) => {
          totals.add(card.total);
          expect(card.slot).toBe(index);
          expect(card.level).toBe(level);
          expect(card.total).toBeGreaterThanOrEqual(rule.statsMin);
          expect(card.total).toBeLessThanOrEqual(rule.statsMax);
          expect(card.stats).toHaveLength(6);
          expect(sum(card.stats)).toBe(card.total);
          for (const stat of card.stats)
            expect(stat).toBeGreaterThanOrEqual(Math.max(1, Math.floor(card.total / 12)));
          expect(card.cost).toBe(BigInt(level * 50 + (card.total - rule.statsMin) * 2));
        });
      }
      // 균등 굴림이라 양 끝이 다 나온다
      expect([...counts].toSorted((a, b) => a - b)).toEqual(
        Array.from({ length: rule.cardsMax - rule.cardsMin + 1 }, (_, i) => rule.cardsMin + i),
      );
      expect(totals.has(rule.statsMin) && totals.has(rule.statsMax)).toBe(true);
    }
  });

  it("옛 값: Lv1 30~45 · Lv2 45~60 · Lv3 60~80, 카드 3~5, 비용 Lv1 50~80 · Lv3 150~190, 12시간 갱신", () => {
    expect(c.levels.slice(0, 3)).toEqual([
      { cardsMin: 3, cardsMax: 5, statsMin: 30, statsMax: 45 },
      { cardsMin: 3, cardsMax: 5, statsMin: 45, statsMax: 60 },
      { cardsMin: 3, cardsMax: 5, statsMin: 60, statsMax: 80 },
    ]);
    expect([
      recruitCost(1, 30, c),
      recruitCost(1, 45, c),
      recruitCost(3, 60, c),
      recruitCost(3, 80, c),
    ]).toEqual([50n, 80n, 150n, 190n]);
    expect(c.refreshMs).toBe(12 * HOUR);
    expect(c.startLevel).toBe(1);
  });

  it("속성: 기본 4원소 가운데 2~3개에 10점, 칸마다 1점 이상(빛·어둠 없음)", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 500; seed++) {
      const elements = distributeRecruitElements(createRng(seed), c);
      const values = Object.values(elements);
      expect(Object.keys(elements)).toEqual(["water", "fire", "wind", "earth"]);
      expect(sum(values)).toBe(10);
      const active = values.filter((value) => value > 0);
      seen.add(active.length);
      for (const value of active) expect(value).toBeLessThanOrEqual(9);
    }
    expect([...seen].toSorted((a, b) => a - b)).toEqual([2, 3]);
  });

  it("속성 점수를 키워도 칸마다 상한 10을 넘지 않는다(설정값을 바꾼 세계)", () => {
    const wide: RecruitCoefficients = { ...c, elementPoints: 20, elementsMin: 2, elementsMax: 2 };
    for (let seed = 1; seed <= 200; seed++) {
      const values = Object.values(distributeRecruitElements(createRng(seed), wide));
      expect(sum(values)).toBe(20);
      for (const value of values) expect(value).toBeLessThanOrEqual(10);
    }
  });

  it("6스탯 분배: 토탈이 작아도 칸마다 1점, 남는 점수는 아무 칸에", () => {
    expect(distributeRecruitStats(6, createRng(3))).toEqual([1, 1, 1, 1, 1, 1]);
    const stats = distributeRecruitStats(31, createRng(9));
    expect(sum(stats)).toBe(31);
    for (const stat of stats) expect(stat).toBeGreaterThanOrEqual(2);
  });

  it("카드 묶음은 (세계 시드, 도시, 고용 주체, 창)으로 정해진다: 같으면 같고, 고용 주체·창이 다르면 다르다", () => {
    const a = recruitCards(7, 3, 11, 100, 2, c);
    expect(recruitCards(7, 3, 11, 100, 2, c)).toEqual(a);
    expect(recruitCards(7, 3, 12, 100, 2, c)).not.toEqual(a);
    expect(recruitCards(7, 3, 11, 101, 2, c)).not.toEqual(a);
    expect(recruitCards(7, 3, 11, 100, 0, c)).toEqual([]);
  });

  it("창 = ⌊시각 ÷ 12시간⌋, 산 칸은 창이 지나면 사라진다(쌓이지 않음), 같은 칸은 두 번 못 산다", () => {
    expect(recruitWindow(12 * HOUR - 1, c)).toBe(0);
    expect(recruitWindow(12 * HOUR, c)).toBe(1);
    expect(recruitWindowEndMs(1, c)).toBe(24 * HOUR);
    const first = takeRecruitSlot(undefined, 5, 2, 4);
    expect(first).toEqual({ window: 5, taken: 4 });
    expect(takeRecruitSlot(first, 5, 2, 4)).toBeUndefined();
    expect(takeRecruitSlot(first, 5, 4, 4)).toBeUndefined();
    expect(takeRecruitSlot(first, 5, 0, 4)).toEqual({ window: 5, taken: 5 });
    expect(takenNow(first, 6)).toBe(0);
    expect(takeRecruitSlot(first, 6, 2, 4)).toEqual({ window: 6, taken: 4 });
  });

  it("고용한 휴먼은 레벨 1(시작 레벨)과 카드의 스탯·속성", () => {
    const card = rollRecruitCards(1, createRng(4), c)[0];
    if (!card) throw new Error("card");
    const profile = recruitProfileOf(card, c);
    expect(profile).toEqual({ level: 1, stats: card.stats, elements: card.elements });
  });

  it("속성 4원소 ↔ 12칸(ELEMENT_IDS 차례)", () => {
    const slots = recruitElementSlots({ water: 3, fire: 0, wind: 7, earth: 0 });
    expect(slots).toHaveLength(12);
    expect(sum(slots)).toBe(10);
    expect(recruitElementsFromSlots(slots)).toEqual({ water: 3, fire: 0, wind: 7, earth: 0 });
  });
});
