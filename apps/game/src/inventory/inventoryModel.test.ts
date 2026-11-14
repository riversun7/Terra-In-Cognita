import type { HoldingLine, HoldingPlace } from "@terra/shared/economy";
import { describe, expect, it } from "vitest";
import {
  buildingIdOf,
  cargoUnitOf,
  estimateValue,
  groupPlaces,
  parseInventoryTab,
  totalLines,
} from "./inventoryModel.ts";

const line = (item: string, qty: string): HoldingLine => ({
  asset: `item:${item}`,
  item,
  currency: null,
  qty,
  locked: "0",
  spoilsAt: null,
});
const place = (id: string, kind: HoldingPlace["kind"], lines: HoldingLine[]): HoldingPlace => ({
  id,
  kind,
  name: null,
  store: null,
  capacity: null,
  lines,
});

describe("인벤토리 자료 모양", () => {
  it("칸 이름 읽기: 모르는 값은 전체", () => {
    expect(parseInventoryTab("units")).toBe("units");
    expect(parseInventoryTab("x")).toBe("all");
    expect(parseInventoryTab(undefined)).toBe("all");
  });

  it("자리 ID에서 건물·유닛 번호", () => {
    expect(buildingIdOf({ id: "building_42", kind: "building" })).toBe(42);
    expect(buildingIdOf({ id: "building_x", kind: "building" })).toBeNull();
    expect(cargoUnitOf({ id: "cargo_17", kind: "cargo" })).toBe(17);
    expect(cargoUnitOf({ id: "cargo_17", kind: "building" })).toBeNull();
  });

  it("창고 = 도시 창고 + 내 창고 시설, 건물 = 그 밖의 건물 창고, 유닛 = 화물", () => {
    const groups = groupPlaces(
      [
        place("3", "warehouse", []),
        place("building_10", "building", []),
        place("building_11", "building", []),
        place("cargo_5", "cargo", []),
        place("ledger", "ledger", []),
      ],
      new Set([10]),
    );
    expect(groups.warehouses.map((p) => p.id)).toEqual(["3", "building_10"]);
    expect(groups.buildings.map((p) => p.id)).toEqual(["building_11"]);
    expect([...groups.cargo.keys()]).toEqual([5]);
    expect(groups.ledger.map((p) => p.id)).toEqual(["ledger"]);
  });

  it("전체: 같은 자산을 자리마다 더하고 몇 곳인지 센다, 0은 뺀다, 많은 차례", () => {
    const totals = totalLines([
      place("3", "warehouse", [line("log", "5000"), line("copper_ore", "100")]),
      place("cargo_5", "cargo", [line("log", "2000"), line("stone", "0")]),
    ]);
    expect(totals.map((t) => [t.asset, t.qty, t.places])).toEqual([
      ["item:log", 7000n, 2],
      ["item:copper_ore", 100n, 1],
    ]);
  });

  it("추정 가치: 묶음 수(버림) × 묶음당 값을 화폐마다 더하고, 값 없는 물건은 따로 센다", () => {
    const totals = totalLines([
      place("3", "warehouse", [line("log", "2500"), line("sword", "1"), line("ore", "10")]),
    ]);
    const value = estimateValue(totals, (item) =>
      item === "log"
        ? { price: 30n, currency: "cur_a", lot: 1000n }
        : item === "ore"
          ? { price: 7n, currency: "cur_b", lot: 1n }
          : null,
    );
    expect([...value.byCurrency]).toEqual([
      ["cur_a", 60n],
      ["cur_b", 70n],
    ]);
    expect(value.priced).toBe(2);
    expect(value.unpriced).toBe(1);
  });
});
