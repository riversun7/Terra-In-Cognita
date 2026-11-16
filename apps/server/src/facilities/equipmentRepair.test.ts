// 외주 수리 시간당 재료비 시험 — 적정가에 공방이 내는 재료비를 넣는다(기획 대조 2167 — D-570 1822·D-573 2048)
import { OLD_FACILITY_RUNTIME_RULES, equipmentRepairMs } from "@terra/shared/facilityRuntime";
import { describe, expect, it } from "vitest";
import { hourlyFair } from "../business/fairPrice.ts";
import type { FacilityDef } from "./catalog.ts";
import { type EquipmentRepairDeps, repairMaterialsHourly } from "./equipmentRepair.ts";
import type { FacilityRecord } from "./state.ts";

const SHOP = 5;
const price = (item: string): bigint => (item === "iron" ? 10n : 50n);

/* oxlint-disable typescript/no-unsafe-type-assertion -- 시험: 수리 줄·시설 찾기만 쓰는 가짜 고리 */
function deps(repair: FacilityDef["repair"]): EquipmentRepairDeps {
  const def = { id: "smithy", repair } as unknown as FacilityDef;
  const record = { buildingId: SHOP } as unknown as FacilityRecord;
  return {
    runtime: () => OLD_FACILITY_RUNTIME_RULES,
    shopFacility: (buildingId: number) => (buildingId === SHOP ? { record, def } : "unknown_building"),
    workersAt: () => [],
    unitTaken: () => false,
    craftScoreOf: () => 0,
  } as unknown as EquipmentRepairDeps;
}
/* oxlint-enable typescript/no-unsafe-type-assertion */

describe("외주 수리 시간당 재료비(2167)", () => {
  it("수리 줄마다 기본 재료 기준 값 × 한 시간 ÷ 티어 1 가득 수리 시간의 가장 큰 값", () => {
    const d = deps([
      { slots: ["body"], weaponTypes: [], materials: [{ item: "iron", qty: 2 }] },
      { slots: ["head"], weaponTypes: [], materials: [{ item: "leather", qty: 1 }] },
    ]);
    const ms = BigInt(
      equipmentRepairMs(
        { tier: 1, lost: 1000, maxDurability: 1000, avgScore: 0, units: 1 },
        OLD_FACILITY_RUNTIME_RULES,
      ),
    );
    const want = (50n * 3_600_000n + ms - 1n) / ms;
    expect(repairMaterialsHourly(d, SHOP, price)).toBe(want);
    // 공방이 아니면 0
    expect(repairMaterialsHourly(d, 99, price)).toBe(0n);
  });

  it("시간당 적정가 재료비 칸에 들어간다", () => {
    const fair = hourlyFair(100n, { feePm: 0, taxBp: 0, materials: 40n });
    expect(fair).toMatchObject({ materials: 40n, labor: 100n, price: 140n });
  });
});
