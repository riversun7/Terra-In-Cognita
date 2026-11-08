// NPC 수도 고르기·옮기기 시험 — 기획 D-528, docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)".
import { describe, expect, it } from "vitest";
import { type CapitalWorld, createNpcCapitals, pickCapital } from "./capitals.ts";

const city = (id: number, development: number, start = false) => ({ id, development, start });

describe("pickCapital", () => {
  it("도시가 없으면 undefined, 지금 수도가 없으면 발전도 높은 → 시작 도시 → 작은 ID", () => {
    expect(pickCapital([], undefined, 10)).toBeUndefined();
    expect(pickCapital([city(3, 20), city(2, 40), city(1, 40)], null, 10)).toBe(1);
    expect(pickCapital([city(1, 40), city(2, 40, true)], undefined, 10)).toBe(2);
    expect(pickCapital([city(5, 10), city(4, 10)], undefined, 10)).toBe(4);
  });

  it("문턱: 다른 도시가 문턱 이상 앞설 때만 옮기고, 지금 수도가 그 세력 도시가 아니면 바로 다시 고른다", () => {
    const list = [city(1, 30, true), city(2, 39), city(3, 40)];
    expect(pickCapital(list, 1, 10)).toBe(3);
    expect(pickCapital(list, 1, 11)).toBe(1);
    // 같은 발전도는 문턱 0이어도 옮기지 않는다
    expect(pickCapital([city(1, 30), city(2, 30)], 2, 0)).toBe(2);
    expect(pickCapital(list, 99, 50)).toBe(3);
  });
});

/** 거울 세계 몫(세력·도시)만 있는 가짜 */
function fakeWorld(): CapitalWorld & {
  cities: Map<number, { id: number; owner: number; start: boolean; development: number }>;
} {
  const cities = new Map([
    [10, { id: 10, owner: 1, start: true, development: 20 }],
    [11, { id: 11, owner: 1, start: true, development: 25 }],
    [20, { id: 20, owner: 2, start: true, development: 5 }],
  ]);
  const factions = new Map([
    [1, { id: 1, alive: true }],
    [2, { id: 2, alive: true }],
    [3, { id: 3, alive: false }],
  ]);
  return { cities, factions };
}

describe("createNpcCapitals", () => {
  it("처음: 저장된 수도가 없으면 발전도로 고르고 세력 행에 적는다, 문턱 아래 차이는 그대로, 넘으면 옮긴다", () => {
    const world = fakeWorld();
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const capitals = createNpcCapitals({
      world,
      stored: new Map([
        [1, 10],
        [2, null],
      ]),
      rowOf: (owner) => owner + 100,
      writer: { upsert: (table, row) => writes.push({ table, row }) },
    });
    expect(capitals.capitalOf(1)).toBe(10);
    expect(capitals.capitalOf(2)).toBe(20);
    expect(capitals.review(10)).toEqual([{ owner: 2, from: undefined, to: 20 }]);
    expect(writes).toEqual([{ table: "factionCapital", row: { id: 102, capital_city_id: 20 } }]);
    // 도시 11이 문턱(10) 넘게 앞서면 옮긴다
    const city11 = world.cities.get(11);
    if (city11) city11.development = 31;
    expect(capitals.review(10)).toEqual([{ owner: 1, from: 10, to: 11 }]);
    expect(capitals.capitalOf(1)).toBe(11);
    // 수도를 잃으면(주인이 바뀜) 저장값과 상관없이 남은 도시에서 바로 고른다. 빼앗은 세력은 문턱 넘게 앞선 그 도시로 옮긴다
    if (city11) city11.owner = 2;
    expect(capitals.capitalOf(1)).toBe(10);
    expect(capitals.review(10)).toEqual([
      { owner: 1, from: 11, to: 10 },
      { owner: 2, from: 20, to: 11 },
    ]);
  });
});
