// 거래소 건물 찾기·짓기 규칙(docs/adr/2026-11-16-exchange-buildings.md) 시험 — 실제 팩 시설
import { describe, expect, it } from "vitest";
import { ORDER_BASE } from "@terra/shared/exchange";
import { facilityCatalogOf } from "../facilities/catalog.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import { TEST_FACILITY_SOURCE } from "../facilities/testFacilities.ts";
import { createExchangeDirectory, exchangeBuildProblem, exchangeKindOf } from "./exchangeBuildings.ts";

const catalog = facilityCatalogOf(() => TEST_FACILITY_SOURCE)();

const record = (
  buildingId: number,
  facilityId: string,
  cityId: number | null,
  level = 1,
): FacilityRecord => ({
  buildingId,
  facilityId,
  level,
  conditionPpm: 1_000_000,
  conditionAtMs: 0,
  builtAtMs: 0,
  builtBy: null,
  cityId,
});

describe("거래소 건물", () => {
  it("팩 시설 넷이 거래소 종류를 가진다(상업)", () => {
    expect(exchangeKindOf(catalog, "goods_exchange")).toBe("goods");
    expect(exchangeKindOf(catalog, "fx_exchange")).toBe("fx");
    expect(exchangeKindOf(catalog, "unit_exchange")).toBe("units");
    expect(exchangeKindOf(catalog, "stock_exchange")).toBe("securities");
    expect(exchangeKindOf(catalog, "farm")).toBeUndefined();
    expect(catalog.facility("goods_exchange")?.category).toBe("commerce");
  });

  it("짓기: 잠긴 종류·도시 밖·같은 도시 같은 종류(짓는 중 포함)는 막는다", () => {
    const records = [record(1, "goods_exchange", 5, 0)];
    expect(exchangeBuildProblem(catalog, records, "farm", 5)).toBeUndefined();
    expect(exchangeBuildProblem(catalog, records, "stock_exchange", 6)).toBe("exchange_locked");
    expect(exchangeBuildProblem(catalog, records, "unit_exchange", 6)).toBe("exchange_locked");
    expect(exchangeBuildProblem(catalog, records, "goods_exchange", null)).toBe("no_place");
    expect(exchangeBuildProblem(catalog, records, "goods_exchange", 5)).toBe("exchange_exists");
    expect(exchangeBuildProblem(catalog, records, "goods_exchange", 6)).toBeUndefined();
    expect(exchangeBuildProblem(catalog, records, "fx_exchange", 5)).toBeUndefined();
  });

  it("그 도시 거래소 = 다 지었고 일하는 것 가운데 가장 작은 건물 ID, 배치 유닛이 없으면 기본 한도", () => {
    const records = [
      record(9, "goods_exchange", 5),
      record(4, "goods_exchange", 5),
      record(3, "goods_exchange", 6, 0),
      record(7, "goods_exchange", 7),
      record(8, "fx_exchange", 5),
    ];
    const directory = createExchangeDirectory({
      records: () => records,
      catalog: () => catalog,
      works: (buildingId) => buildingId !== 7,
      primariesOf: () => ({ int: 100, wis: 100 }),
    });
    expect(directory.cityExchange(5, "goods")).toBe(4);
    // 짓는 중(레벨 0)·일하지 않는 상태는 그 도시 거래소가 아니다
    expect(directory.cityExchange(6, "goods")).toBeUndefined();
    expect(directory.cityExchange(7, "goods")).toBeUndefined();
    expect([...directory.citiesWith("fx")]).toEqual([[5, 8]]);
    expect(directory.stationed(1, "goods")).toEqual([]);
    expect(directory.orderLimit(1, "goods")).toBe(ORDER_BASE);
    // 일하지 않는 거래소(상태 30% 미만 — D-559, 질문 1950)는 "멈춤"으로 알린다
    expect(directory.stoppedIn(7, "goods")).toBe(true);
    expect(directory.stoppedIn(5, "goods")).toBe(false);
    expect(directory.stoppedIn(6, "goods")).toBe(false);
  });

  it("주문 한도는 거래 직무 유닛(직무 배치)으로 센다 — 일하는 거래소만, 내 유닛만(D-571 1944)", () => {
    const records = [record(4, "goods_exchange", 5), record(7, "goods_exchange", 7)];
    const traders = new Map([
      [
        4,
        [
          { unitId: 11, ownerId: 1 },
          { unitId: 12, ownerId: 2 },
        ],
      ],
      [7, [{ unitId: 13, ownerId: 1 }]],
    ]);
    const directory = createExchangeDirectory({
      records: () => records,
      catalog: () => catalog,
      works: (buildingId) => buildingId !== 7,
      primariesOf: (unitId) => ({ int: unitId === 11 ? 30 : 100, wis: 30 }),
      tradersAt: (buildingId) => traders.get(buildingId) ?? [],
    });
    expect(directory.stationed(1, "goods")).toEqual([11]);
    expect(directory.orderLimit(1, "goods")).toBe(ORDER_BASE + 3);
    expect(directory.stationed(2, "goods")).toEqual([12]);
    expect(directory.orderLimit(2, "goods")).toBe(ORDER_BASE + 6);
    expect(directory.orderLimit(3, "goods")).toBe(ORDER_BASE);
  });
});
