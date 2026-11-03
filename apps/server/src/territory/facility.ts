// 영토 비콘 시설 보기 — 팩 시설 territory_beacon 실효 값(건물 편집기가 덮어쓴다, docs/adr/2026-11-03-territory-layer.md 3절, 49 N51)
// 레벨 1 건설 재료(D-508, @terra/shared/facilityBuild buildCostAt). 시설은 늘 켜져 있다(팩 core@32 켬·끔 없앰, 사용자 답 2026-11-03).
// 시설 항목이 팩에 없을 때만 놓을 수 없다(disabled).
import type { FacilityEntry } from "@terra/content";
import { buildCostAt } from "@terra/shared/facilityBuild";
import { TERRITORY_BEACON_FACILITY, type TerritoryBeaconFacilityView } from "@terra/shared/territoryApi";

export function beaconFacilityView(source: {
  effective(): { readonly facilities: readonly FacilityEntry[] };
}): TerritoryBeaconFacilityView {
  const entry = source.effective().facilities.find((facility) => facility.id === TERRITORY_BEACON_FACILITY);
  if (!entry) return { enabled: false, materials: [] };
  const build = entry.build;
  if (!build) return { enabled: true, materials: [] };
  // 팩 참조(ContentRef)의 ID로 셈 함수의 JSON 모양을 만든다
  const json = {
    mulPm: build.mulPm,
    levels: build.levels.map((level) => ({
      from: level.from,
      materials: level.materials.map((stack) => ({ item: stack.item.id, qty: stack.qty })),
    })),
  };
  return { enabled: true, materials: buildCostAt(json, 1) };
}
