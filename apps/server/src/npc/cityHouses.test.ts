// NPC 도시 가문 시험 — 질문 1848 답(D-569 "도시국가든 도시의 가문들이 존재"·D-212), docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-16, 1847·1848 답)".
import { HOMELESS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type NpcCityHousesLoaded, createNpcCityHouses, targetHouses } from "./cityHouses.ts";

/** 쓰기 대기열 흉내: 넣은 줄을 표마다 센다 */
function fakeWriter() {
  const upserts: { table: string; row: Record<string, unknown> }[] = [];
  const removes: { table: string; row: Record<string, unknown> }[] = [];
  return {
    upserts,
    removes,
    upsert: (table: string, row: Record<string, unknown>) => void upserts.push({ table, row }),
    remove: (table: string, row: Record<string, unknown>) => void removes.push({ table, row }),
  };
}

/** NPC 세력 1(도시 10·11)과 플레이어 가문 2(도시 20), 휴먼 */
function fakeWorld() {
  const factions = new Map<number, { player?: true }>([
    [1, {}],
    [2, { player: true }],
  ]);
  const cities = new Map([
    [10, { owner: 1 }],
    [11, { owner: 1 }],
    [20, { owner: 2 }],
  ]);
  const units = new Map([
    [100, { id: 100, city: 10, owner: 1 }],
    [101, { id: 101, city: 10, owner: 1 }],
    [102, { id: 102, city: 11, owner: 1 }],
    [103, { id: 103, city: HOMELESS, owner: 1 }],
    [200, { id: 200, city: 20, owner: 2 }],
  ]);
  return { factions, cities, units };
}

const make = (
  world: ReturnType<typeof fakeWorld>,
  writer: ReturnType<typeof fakeWriter>,
  loaded: NpcCityHousesLoaded = { houses: [], members: new Map<number, number>() },
  mayors = new Map([
    [10, 101],
    [11, 102],
    [20, 200],
  ]),
) =>
  createNpcCityHouses({
    world,
    writer,
    loaded,
    mayorOf: (cityId) => mayors.get(cityId),
    nameFor: (cityId, mayor) => `성${String(mayor)}-${String(cityId)}`,
  });

describe("NPC 도시 가문", () => {
  it("시장이 있는 NPC 도시마다 하나(가문장 = 시장, 이름 = 시장의 성), 플레이어 가문 도시는 빼고, 휴먼은 사는 도시 가문에(노숙 빼고)", () => {
    const world = fakeWorld();
    const writer = fakeWriter();
    const houses = make(world, writer);
    expect(houses.sync(5000)).toEqual({ created: 2, joined: 3, left: 0, moved: 0 });
    expect(writer.upserts.filter((w) => w.table === "npcHouses").map((w) => w.row)).toEqual([
      { id: 1, city_id: 10, name: "성101-10", founded_at_ms: 5000 },
      { id: 2, city_id: 11, name: "성102-11", founded_at_ms: 5000 },
    ]);
    expect(houses.of(100)).toEqual({ id: 1, cityId: 10, name: "성101-10", leader: false });
    expect(houses.of(101)).toMatchObject({ id: 1, leader: true });
    expect(houses.of(103)).toBeUndefined();
    expect(houses.of(200)).toBeUndefined();
    expect(houses.housesOfCity(20)).toEqual([]);
    // 두 번째 맞추기는 아무것도 쓰지 않는다(멱등)
    const before = writer.upserts.length;
    expect(houses.sync(6000)).toEqual({ created: 0, joined: 0, left: 0, moved: 0 });
    expect(writer.upserts.length).toBe(before);
    expect(houses.counts()).toEqual({ houses: 2, members: 3 });
  });

  it("새로 생긴 휴먼은 그 도시 가문에 들고, 한 번 들면 다른 도시로 옮겨도 그대로, 죽으면 빠진다", () => {
    const world = fakeWorld();
    const writer = fakeWriter();
    const houses = make(world, writer);
    houses.sync(1);
    world.units.set(104, { id: 104, city: 11, owner: 1 });
    const moved = world.units.get(100);
    if (moved) moved.city = 11;
    world.units.delete(102);
    expect(houses.sync(2)).toEqual({ created: 0, joined: 1, left: 1, moved: 0 });
    expect(houses.of(104)?.id).toBe(2);
    expect(houses.of(100)?.id).toBe(1);
    expect(writer.removes).toEqual([{ table: "npcHouseUnits", row: { unit_id: 102 } }]);
  });

  it("켤 때 읽은 가문·소속은 그대로 쓰고(새 ID는 그 다음), 시장이 없는 도시는 아직 세우지 않는다, 띄우지 않은 휴먼 줄은 지우지 않는다", () => {
    const world = fakeWorld();
    const writer = fakeWriter();
    const houses = make(
      world,
      writer,
      {
        houses: [{ id: 7, cityId: 10, name: "옛가문", foundedAtMs: 1 }],
        members: new Map([
          [100, 7],
          [999, 7],
        ]),
      },
      new Map([[10, 101]]),
    );
    expect(houses.sync(3)).toEqual({ created: 0, joined: 1, left: 0, moved: 0 });
    expect(houses.of(100)).toMatchObject({ id: 7, name: "옛가문" });
    expect(houses.housesOfCity(11)).toEqual([]);
    expect(writer.removes).toEqual([]);
    expect(houses.counts().members).toBe(3);
  });

  it("D-573: 도시 등급마다 가문 수 — 모자란 가문을 세우고 가장 큰 가문의 늦게 든 사람부터 나눠 옮긴다(시장은 그대로), 새 휴먼은 가장 작은 가문에", () => {
    const rules = {
      housesByGrade: [1, 1, 2, 3, 4, 5],
      territory: { gradeAtDevelopment: [10, 20, 30, 40, 50] },
    };
    expect(targetHouses(0, rules)).toBe(1);
    expect(targetHouses(25, rules)).toBe(2);
    expect(targetHouses(99, rules)).toBe(5);
    const factions = new Map<number, { player?: true }>([[1, {}]]);
    const cities = new Map([[10, { owner: 1, development: 25 }]]);
    const units = new Map<number, { id: number; city: number; owner: number }>();
    for (let id = 100; id < 106; id += 1) units.set(id, { id, city: 10, owner: 1 });
    const writer = fakeWriter();
    const houses = createNpcCityHouses({
      world: { factions, cities, units },
      writer,
      loaded: { houses: [{ id: 1, cityId: 10, name: "옛", foundedAtMs: 0 }], members: new Map() },
      mayorOf: () => 100,
      nameFor: (cityId, unitId) => `성${String(unitId)}`,
      rules: () => rules,
    });
    // 옛 세계: 휴먼 6이 모두 첫 가문에 든 뒤, 목표 2라 둘째 가문을 세우고 3명(6 ÷ 2)을 옮긴다
    expect(houses.sync(9)).toEqual({ created: 1, joined: 6, left: 0, moved: 3 });
    expect(houses.housesOfCity(10)).toEqual([1, 2]);
    expect([103, 104, 105].map((id) => houses.of(id)?.id)).toEqual([2, 2, 2]);
    expect(houses.of(100)).toMatchObject({ id: 1, leader: true });
    expect(houses.of(105)).toMatchObject({ id: 2, name: "성105" });
    // 둘째 가문장 = 시장 규칙(스탯이 없으면 같은 점수 → 작은 ID)
    expect(houses.of(103)?.leader).toBe(true);
    // 멱등: 다시 맞춰도 그대로
    expect(houses.sync(10)).toEqual({ created: 0, joined: 0, left: 0, moved: 0 });
    // 새 휴먼은 가장 작은 가문(같으면 먼저 세운 가문)
    units.set(106, { id: 106, city: 10, owner: 1 });
    units.delete(105);
    houses.sync(11);
    expect(houses.of(106)?.id).toBe(2);
  });

  it("질문 2012 답: 수도의 지배 가문(먼저 세운 가문)의 장은 국가 지도자, 지도자가 없으면 시장", () => {
    const world = fakeWorld();
    const writer = fakeWriter();
    let leader: number | undefined = 900;
    const houses = createNpcCityHouses({
      world,
      writer,
      loaded: { houses: [], members: new Map() },
      mayorOf: (cityId) => (cityId === 10 ? 101 : 102),
      nameFor: (cityId) => `가${String(cityId)}`,
      capitalOf: (owner) => (owner === 1 ? 10 : undefined),
      leaderOf: () => leader,
    });
    houses.sync(1);
    expect(houses.of(101)?.leader).toBe(false);
    expect(houses.rulingHouseOf(1)).toEqual({ id: 1, cityId: 10, name: "가10", leader: true });
    expect(houses.of(102)?.leader).toBe(true);
    expect(houses.rulingHouseOf(2)).toBeUndefined();
    leader = undefined;
    expect(houses.of(101)?.leader).toBe(true);
    expect(houses.rulingHouseOf(1)?.leader).toBe(false);
  });
  it("governance-2(질문 2406): 의결로 정한 지배 가문이 처음 규칙을 대신한다 — NPC 가문이면 그 가문장 = 지도자, 플레이어 가문이면 NPC 지배 가문 없음(퇴임)", () => {
    const world = fakeWorld();
    const houses = createNpcCityHouses({
      world,
      writer: fakeWriter(),
      loaded: { houses: [], members: new Map() },
      mayorOf: (cityId) => (cityId === 10 ? 101 : 102),
      nameFor: (cityId) => `가${String(cityId)}`,
      capitalOf: (owner) => (owner === 1 ? 10 : undefined),
      leaderOf: (owner) => (owner === 1 ? 900 : undefined),
    });
    houses.sync(1);
    houses.setRuling(1, { npc: true, id: 2 });
    expect(houses.rulingHouseOf(1)).toEqual({ id: 2, cityId: 11, name: "가11", leader: true });
    expect(houses.headOf(2)).toBe(900);
    expect(houses.headOf(1)).toBe(101);
    expect(houses.rulingHeads()).toEqual([{ house: 2, unit: 900 }]);
    expect(houses.rulingPlayerHouseOf(1)).toBeUndefined();
    // 그 가문 도시를 잃으면 처음 규칙으로
    world.cities.set(11, { owner: 2 });
    expect(houses.rulingHouseOf(1)?.id).toBe(1);
    world.cities.set(11, { owner: 1 });
    houses.setRuling(1, { npc: false, id: 55 });
    expect(houses.rulingHouseOf(1)).toBeUndefined();
    expect(houses.rulingPlayerHouseOf(1)).toBe(55);
    expect(houses.rulingHeads()).toEqual([]);
    expect(houses.headOf(1)).toBe(101);
    // 빈자리(질문 2403 답 D-582): 지배 가문 없음
    houses.setRuling(1, "vacant");
    expect(houses.rulingHouseOf(1)).toBeUndefined();
    expect(houses.rulingPlayerHouseOf(1)).toBeUndefined();
    houses.setRuling(1, undefined);
    expect(houses.rulingHouseOf(1)?.id).toBe(1);
  });
});
