// 사는 곳 장부·서비스 시험(D-585 1) — 고를 수 있는 집, 쉬는 고른 것(옛 길로), 도시별 거주, 고르기 명령 결과, 주민세 거주 출처에 들어감
import { describe, expect, it } from "vitest";
import { withChosenResidences } from "../npc/residentProperty.ts";
import {
  type ResidenceBuildingFacts,
  type ResidenceWorld,
  createResidenceBook,
  registerResidenceBook,
  residenceBookOf,
} from "./book.ts";
import { createResidenceService } from "./service.ts";

/** 건물 표·유닛 주인·숙소 배정을 바꿀 수 있는 가짜 세계 */
function fakeWorld() {
  const buildings = new Map<number, ResidenceBuildingFacts>([
    // 주인 10의 집(도시 5)
    [100, { cityId: 5, level: 1, living: true, ownerId: 10 }],
    // 주인 10의 집(도시 6)
    [101, { cityId: 6, level: 2, living: true, ownerId: 10 }],
    // 남의 숙소(도시 6, 주인 20)
    [200, { cityId: 6, level: 1, living: true, ownerId: 20 }],
    // 주인 10의 창고(주거 아님)
    [300, { cityId: 5, level: 1, living: false, ownerId: 10 }],
    // 도시 밖 집
    [400, { cityId: null, level: 1, living: true, ownerId: 10 }],
    // 다 짓지 않은 집
    [500, { cityId: 5, level: 0, living: true, ownerId: 10 }],
  ]);
  const owners = new Map<number, number>([
    [1, 10],
    [2, 10],
    [3, 20],
  ]);
  const lodging = new Map<number, { buildingId: number; cityId: number }>([
    [2, { buildingId: 200, cityId: 6 }],
  ]);
  const world: ResidenceWorld = {
    unitOwner: (unitId) => owners.get(unitId),
    building: (id) => buildings.get(id),
    lodgingOf: (unitId) => lodging.get(unitId),
  };
  return { world, buildings, owners, lodging };
}

describe("사는 곳 장부(D-585 1)", () => {
  it("고를 수 있는 집: 내 주거 건물 또는 배정받은 숙소, 도시 안·다 지은 것만", () => {
    const { world } = fakeWorld();
    const book = createResidenceBook(world);
    expect(book.blockOf(1, 10, 100)).toBeNull();
    expect(book.blockOf(1, 10, 300)).toBe("not_housing");
    expect(book.blockOf(1, 10, 400)).toBe("no_city");
    expect(book.blockOf(1, 10, 500)).toBe("unknown_building");
    expect(book.blockOf(1, 10, 999)).toBe("unknown_building");
    // 남의 숙소: 배정받은 유닛 2만
    expect(book.blockOf(1, 10, 200)).toBe("not_eligible");
    expect(book.blockOf(2, 10, 200)).toBeNull();
  });

  it("고른 집이 있으면 그 집, 없거나 쉬면 숙소 배정(옛 길), 둘 다 없으면 없음", () => {
    const { world, buildings, owners } = fakeWorld();
    const book = createResidenceBook(world);
    expect(book.residenceOf(1)).toBeUndefined();
    expect(book.residenceOf(2)).toEqual({ buildingId: 200, cityId: 6, source: "lodging" });
    book.put({ unitId: 2, ownerId: 10, buildingId: 100, chosenAtMs: 1 });
    expect(book.residenceOf(2)).toEqual({ buildingId: 100, cityId: 5, source: "chosen" });
    expect(book.residenceCityOf(2)).toBe(5);
    // 집을 잃으면 고른 것이 쉰다 → 숙소 배정
    buildings.set(100, { cityId: 5, level: 1, living: true, ownerId: 99 });
    expect(book.residenceOf(2)).toEqual({ buildingId: 200, cityId: 6, source: "lodging" });
    buildings.set(100, { cityId: 5, level: 1, living: true, ownerId: 10 });
    // 유닛 주인이 바뀌어도 쉰다
    owners.set(2, 30);
    expect(book.chosenPlace(2)).toBeUndefined();
    owners.set(2, 10);
    expect(book.chosenPlace(2)).toEqual({ buildingId: 100, cityId: 5 });
  });

  it("도시별 고른 거주·주인의 사는 도시(고른 것만)", () => {
    const { world } = fakeWorld();
    const book = createResidenceBook(world);
    book.load([
      { unitId: 2, ownerId: 10, buildingId: 101, chosenAtMs: 1 },
      { unitId: 1, ownerId: 10, buildingId: 100, chosenAtMs: 1 },
      // 쉬는 것(남의 숙소 — 배정 없음)
      { unitId: 3, ownerId: 20, buildingId: 101, chosenAtMs: 1 },
    ]);
    expect(book.chosenIn(5)).toEqual([{ unit: 1, owner: 10, lodging: 100 }]);
    expect(book.chosenIn(6)).toEqual([{ unit: 2, owner: 10, lodging: 101 }]);
    expect(book.ownerResidenceCities(10)).toEqual([5, 6]);
    expect(book.ownerResidenceCities(20)).toEqual([]);
  });

  it("고르기 명령: 내 유닛만, 막는 까닭, 같은 집은 unchanged, null = 풀기", async () => {
    const { world } = fakeWorld();
    const book = createResidenceBook(world);
    const service = createResidenceService({
      book,
      ownerOf: (userId) => (userId === "me" ? 10 : undefined),
      unitOwner: (unitId) => world.unitOwner(unitId),
      now: () => 42,
    });
    expect(await service.set("me", 3, 100)).toEqual({ ok: false, code: "unknown_unit" });
    expect(await service.set("other", 1, 100)).toEqual({ ok: false, code: "unknown_unit" });
    expect(await service.set("me", 1, 300)).toEqual({ ok: false, code: "not_housing" });
    expect(await service.set("me", 1, 200)).toEqual({ ok: false, code: "not_eligible" });
    expect(await service.set("me", 1, null)).toEqual({ ok: false, code: "unchanged" });
    expect(await service.set("me", 1, 100)).toEqual({ ok: true, unitId: 1, buildingId: 100, cityId: 5 });
    expect(book.choiceOf(1)).toEqual({ unitId: 1, ownerId: 10, buildingId: 100, chosenAtMs: 42 });
    expect(await service.set("me", 1, 100)).toEqual({ ok: false, code: "unchanged" });
    // 집을 여럿 가져도 사는 곳은 하나 — 바꾸면 앞의 것을 덮는다
    expect(await service.set("me", 1, 101)).toEqual({ ok: true, unitId: 1, buildingId: 101, cityId: 6 });
    expect(book.chosenIn(5)).toEqual([]);
    expect(await service.set("me", 1, null)).toEqual({ ok: true, unitId: 1, buildingId: null, cityId: null });
    expect(book.choiceOf(1)).toBeUndefined();
    expect(service.view("me", 2, 200, 7)).toEqual({
      status: "ok",
      unitId: 2,
      current: { buildingId: 200, cityId: 6, source: "lodging" },
      building: { buildingId: 200, block: null },
      generatedAt: 7,
    });
    expect(service.view("me", 3, undefined, 7).status).toBe("unknown_unit");
  });

  it("주민세 거주: 고른 집이 있는 유닛은 그 집 도시에서만 센다(숙소 배정·NPC 사는 도시보다 앞)", () => {
    const { world } = fakeWorld();
    const book = createResidenceBook(world);
    const ledger = {};
    registerResidenceBook(ledger, book);
    expect(residenceBookOf(ledger)).toBe(book);
    // 옛 길: 유닛 1은 도시 6에 살고(NPC 사는 도시), 일꾼 2는 도시 6 숙소 200에 배정
    const base6 = [
      { unit: 1, owner: 10, lodging: null },
      { unit: 2, owner: 10, lodging: 200 },
    ];
    expect(withChosenResidences(6, base6, undefined)).toEqual(base6);
    expect(withChosenResidences(6, base6, book)).toEqual(base6);
    book.put({ unitId: 2, ownerId: 10, buildingId: 100, chosenAtMs: 1 });
    book.put({ unitId: 1, ownerId: 10, buildingId: 101, chosenAtMs: 1 });
    expect(withChosenResidences(6, base6, book)).toEqual([{ unit: 1, owner: 10, lodging: 101 }]);
    expect(withChosenResidences(5, [], book)).toEqual([{ unit: 2, owner: 10, lodging: 100 }]);
  });
});
