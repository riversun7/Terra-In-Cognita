// NPC 도시 가문 시험 — 질문 1848 답(D-569 "도시국가든 도시의 가문들이 존재"·D-212), docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-16, 1847·1848 답)".
import { HOMELESS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type NpcCityHousesLoaded, createNpcCityHouses } from "./cityHouses.ts";

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
    expect(houses.sync(5000)).toEqual({ created: 2, joined: 3, left: 0 });
    expect(writer.upserts.filter((w) => w.table === "npcHouses").map((w) => w.row)).toEqual([
      { id: 1, city_id: 10, name: "성101-10", founded_at_ms: 5000 },
      { id: 2, city_id: 11, name: "성102-11", founded_at_ms: 5000 },
    ]);
    expect(houses.of(100)).toEqual({ id: 1, cityId: 10, name: "성101-10", leader: false });
    expect(houses.of(101)).toMatchObject({ id: 1, leader: true });
    expect(houses.of(103)).toBeUndefined();
    expect(houses.of(200)).toBeUndefined();
    expect(houses.houseOfCity(20)).toBeUndefined();
    // 두 번째 맞추기는 아무것도 쓰지 않는다(멱등)
    const before = writer.upserts.length;
    expect(houses.sync(6000)).toEqual({ created: 0, joined: 0, left: 0 });
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
    expect(houses.sync(2)).toEqual({ created: 0, joined: 1, left: 1 });
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
    expect(houses.sync(3)).toEqual({ created: 0, joined: 1, left: 0 });
    expect(houses.of(100)).toMatchObject({ id: 7, name: "옛가문" });
    expect(houses.houseOfCity(11)).toBeUndefined();
    expect(writer.removes).toEqual([]);
    expect(houses.counts().members).toBe(3);
  });
});
