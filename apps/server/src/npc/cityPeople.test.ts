// NPC 도시 시장·처음 인구 시험 — 기획 답 744 나·749 다, docs/adr/2026-11-07-play-flow.md "WP-NPC2".
import type { SimUnit } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { createCityPeople, pickMayor, seedPopulationOf } from "./cityPeople.ts";

/** 구인 카드 휴먼(스탯 STR·DEX·AGI·VIT·INT·WIS) */
const recruit = (stats: number[]): SimUnit["recruit"] => ({
  level: 1,
  stats,
  elements: { water: 0, fire: 0, wind: 0, earth: 0 },
});

describe("pickMayor", () => {
  it("INT + WIS → 스탯 합 → 작은 유닛 ID. 저장된 스탯이 없으면 기본값(모두 10)", () => {
    expect(pickMayor([])).toBeUndefined();
    expect(
      pickMayor([
        { id: 9, recruit: null },
        { id: 4, recruit: null },
      ]),
    ).toBe(4);
    // INT 12 + WIS 9 = 21 > 기본 20
    expect(
      pickMayor([
        { id: 1, recruit: null },
        { id: 8, recruit: recruit([5, 5, 5, 5, 12, 9]) },
      ]),
    ).toBe(8);
    // INT + WIS가 같으면 스탯 합, 그것도 같으면 작은 ID
    expect(
      pickMayor([
        { id: 3, recruit: recruit([5, 5, 5, 5, 15, 15]) },
        { id: 2, recruit: recruit([9, 9, 9, 9, 15, 15]) },
        { id: 1, recruit: recruit([9, 9, 9, 9, 15, 15]) },
      ]),
    ).toBe(1);
    // INT + WIS가 기본보다 작은 카드 휴먼은 기본 휴먼보다 뒤
    expect(
      pickMayor([
        { id: 1, recruit: recruit([30, 30, 30, 30, 5, 5]) },
        { id: 2, recruit: null },
      ]),
    ).toBe(2);
  });
});

describe("seedPopulationOf", () => {
  it("floor(주거 × 천분율 ÷ 1000), 음수는 0", () => {
    expect(seedPopulationOf(40, 750)).toBe(30);
    expect(seedPopulationOf(41, 750)).toBe(30);
    expect(seedPopulationOf(40, 0)).toBe(0);
    expect(seedPopulationOf(-5, 750)).toBe(0);
  });
});

describe("createCityPeople", () => {
  it("시장이 없거나 떠난 도시만 다시 고르고, 바뀐 칸만 쓰기 대기열에 넣는다. 처음 인구는 시작 도시마다 한 번", () => {
    const cities = new Map([
      [1, { start: true }],
      [2, { start: false }],
    ]);
    const units = new Map<number, Pick<SimUnit, "id" | "city" | "recruit">>([
      [10, { id: 10, city: 1, recruit: null }],
      [11, { id: 11, city: 1, recruit: null }],
      [20, { id: 20, city: 2, recruit: null }],
    ]);
    const writes: Record<string, unknown>[] = [];
    const people = createCityPeople({
      world: { cities, units },
      writer: { upsert: (_table, row) => writes.push(row) },
      // 도시 1은 저장된 시장 11(살아 있음), 도시 2는 없음
      rows: [
        { id: 1, mayorUnitId: 11, populationSeededAtMs: null },
        { id: 2, mayorUnitId: null, populationSeededAtMs: null },
      ],
    });
    expect(people.needsSeed(1)).toBe(true);
    expect(people.needsSeed(2)).toBe(false);
    expect(people.sync()).toBe(1);
    // 더 작은 ID(10)가 있어도 저장된 시장 11은 그대로
    expect(people.mayorOf(1)).toBe(11);
    expect(people.mayorOf(2)).toBe(20);
    people.markSeeded(1, 5_000);
    expect(people.needsSeed(1)).toBe(false);
    expect(people.flush()).toBe(2);
    expect(writes).toEqual([
      { id: 1, mayor_unit_id: 11, population_seeded_at_ms: 5_000 },
      { id: 2, mayor_unit_id: 20, population_seeded_at_ms: null },
    ]);
    expect(people.flush()).toBe(0);
    // 시장이 죽으면(거울에서 사라짐) 다시 고른다
    units.delete(11);
    expect(people.mayorOf(1)).toBeUndefined();
    expect(people.sync()).toBe(1);
    expect(people.mayorOf(1)).toBe(10);
    // 다른 도시로 떠나도 다시 고른다
    units.set(10, { id: 10, city: 2, recruit: null });
    people.sync();
    expect(people.mayorOf(1)).toBeUndefined();
    expect(people.mayorOf(2)).toBe(20);
    expect(people.flush()).toBe(1);
    expect(writes.at(-1)).toEqual({ id: 1, mayor_unit_id: null, population_seeded_at_ms: 5_000 });
  });
});
