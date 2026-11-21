// NPC 운반 물류센터 맡기기 시험(DB 없음) — 기획 대조 2274, logistics/npcOutsource.ts
import { cargoLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { CarryResult, CarrySpec } from "../gather/carrySpec.ts";
import { npcOutsourceOf } from "./npcOutsource.ts";

const NPC = 40;
const CITY = 3;
const MAP = 77;
const GRAIN = "item:grain";

/** 첫 곳(10)은 나를 일꾼 없음, 다음 곳(11)은 운반꾼 5가 진다 */
const firstAnswer = (spec: CarrySpec): CarryResult =>
  spec.via === 10 ? "no_shop_worker" : { arriveAtMs: 9000, porter: 5 };

describe("NPC 운반 물류센터 맡기기", () => {
  it("싼 차례로 실제 운반 길에 맡기고, 나를 일꾼이 없으면 다음 곳, 국고가 모자라면 그만, 닿음 = 운반꾼 화물이 빔", () => {
    let ids = 1;
    const ledger = createLedgerBook({ nextAccountId: () => ids++, nextTxId: () => ids++ });
    const specs: CarrySpec[] = [];
    let answer = firstAnswer;
    let carrier: ((spec: CarrySpec) => CarryResult) | undefined;
    const places = { cities: () => [{ id: CITY, mapKey: MAP, x: 50, y: 60 }] };
    const outsource = npcOutsourceOf({
      haul: { centers: () => [10, 11], carrier: () => carrier },
      places: () => places,
      maps: new Map(),
      ledger,
    });
    const request = {
      key: "x:1",
      cityId: CITY,
      owner: NPC,
      stacks: [{ asset: GRAIN, qty: 4n }],
      from: cityLocation(CITY),
      to: 123_456,
      x: 70,
      y: 80,
      atMs: 0,
      durMs: 1000,
    };
    // 실제 운반 길이 아직 없으면 맡기지 않는다
    expect(outsource(request, 1000)).toBeUndefined();
    carrier = (spec) => {
      specs.push(spec);
      return answer(spec);
    };
    const handed = outsource(request, 1000);
    expect(handed?.arriveAtMs).toBe(9000);
    expect(specs.map((spec) => spec.via)).toEqual([10, 11]);
    expect(specs[1]).toMatchObject({
      ownerId: NPC,
      buildingId: 11,
      mapKey: MAP,
      cityId: CITY,
      source: cityLocation(CITY),
      deliverTo: 123_456,
      from: { x: 50, y: 60 },
      to: { x: 70, y: 80 },
      atMs: 1000,
    });
    // 운반꾼 화물에 물건이 있으면 아직, 비면 닿음
    ledger.post({
      kind: "test",
      atMs: 0,
      entries: [
        { account: ledger.systemAccount("source", GRAIN), amount: -4n },
        { account: ledger.ownerAccount(NPC, GRAIN, cargoLocation(5)), amount: 4n },
      ],
    });
    expect(handed?.done()).toBe(false);
    ledger.post({
      kind: "test",
      atMs: 0,
      entries: [
        { account: ledger.ownerAccount(NPC, GRAIN, cargoLocation(5)), amount: -4n },
        { account: ledger.ownerAccount(NPC, GRAIN, 123_456), amount: 4n },
      ],
    });
    expect(handed?.done()).toBe(true);
    // 국고가 모자라면 다음 곳을 보지 않는다
    specs.length = 0;
    answer = () => "insufficient_funds";
    expect(outsource(request, 2000)).toBeUndefined();
    expect(specs).toHaveLength(1);
  });
});
