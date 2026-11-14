// 장비 판을 그릴 수 있는 내 유닛 목록 — 인벤토리 [유닛별]·2차맵 [가방]이 같이 쓴다(docs/adr/2026-11-14-inventory-screen.md).
// 유닛 목록(units.list)에는 내 사이보그 본체가 없다(본체는 사이보그 화면, cyborg.get). 그래서 사이보그 유닛 ID(holdings.list cyborgUnit)와
// 본체 칸(cyborg.get body.slots)·이름표(cyborg.get names)로 사이보그 줄을 따로 만들어 앞에 둔다. 나머지는 세계 유닛(w…)이다.
import type { HoldingsListResponse } from "@terra/shared/holdings";
import type { RosterNames, RosterUnit } from "@terra/shared/roster";
import { loadHoldings } from "../holdings/useHoldings.ts";
import { usePreviewOn } from "../inbox/preview.ts";
import { unitLabel } from "../roster/rosterText.ts";
import { loadCyborg, loadUnits, type RosterState, useRosterQuery } from "../roster/useRosterQuery.ts";
import { worldUnitId } from "../roster/useVitals.ts";

export interface GearSource {
  /** 세계 유닛 ID */
  readonly unitId: number;
  readonly label: string;
  /** 칸 배치(보유 물건이 없을 때 쓰는 칸 차례) */
  readonly layout: readonly string[];
  readonly names: RosterNames;
  readonly cyborg: boolean;
}

/** 사이보그(있으면) → 세계 유닛 차례(이름 차례). 같은 ID는 한 번만 */
/** 계산에 쓰는 유닛 목록 몫(units.list) */
export interface GearUnits {
  readonly units: readonly Pick<RosterUnit, "id" | "name" | "type" | "preview" | "slots">[];
  readonly names: RosterNames;
}
/** 계산에 쓰는 사이보그 몫(cyborg.get) */
export interface GearCyborg {
  readonly name: string;
  readonly names: RosterNames;
  readonly body: { readonly slots: readonly { readonly slot: string }[] } | null;
}

export function gearSources(
  units: GearUnits | null,
  cyborg: GearCyborg | null,
  cyborgUnit: number | null,
): GearSource[] {
  const list: GearSource[] = [];
  if (cyborg?.body && cyborgUnit !== null)
    list.push({
      unitId: cyborgUnit,
      label: cyborg.name,
      layout: cyborg.body.slots.map((slot) => slot.slot),
      names: cyborg.names,
      cyborg: true,
    });
  const rest: GearSource[] = [];
  for (const unit of units?.units ?? []) {
    const id = unit.preview ? null : worldUnitId(unit.id);
    if (id === null || id === cyborgUnit) continue;
    rest.push({
      unitId: id,
      label: unitLabel(unit),
      layout: unit.slots.map((slot) => slot.slot),
      names: units?.names ?? cyborg?.names ?? EMPTY_NAMES,
      cyborg: false,
    });
  }
  rest.sort((a, b) => a.label.localeCompare(b.label));
  return [...list, ...rest];
}

const EMPTY_NAMES: RosterNames = { stats: {}, items: {}, skills: {}, facilities: {}, planets: {} };

export interface GearQuery {
  /** 셋 다 받았으면 ready, 하나라도 실패면 그 실패, 아니면 받는 중 */
  readonly state: RosterState<readonly GearSource[]>;
  readonly reload: () => void;
}

/** 유닛 목록·사이보그·보유 물건을 받아 장비 판 목록을 만든다 */
export function useGearSources(): GearQuery {
  const preview = usePreviewOn();
  const units = useRosterQuery(loadUnits, preview);
  const cyborg = useRosterQuery(loadCyborg, preview);
  const holdings = useRosterQuery(loadHoldings, false);
  const reload = (): void => {
    units.reload();
    cyborg.reload();
    holdings.reload();
  };
  for (const query of [units, cyborg, holdings])
    if (query.state.status === "error") return { state: query.state, reload };
  if (units.state.status !== "ready" || cyborg.state.status !== "ready" || holdings.state.status !== "ready")
    return { state: { status: "loading" }, reload };
  const data: HoldingsListResponse = holdings.state.data;
  return {
    state: {
      status: "ready",
      data: gearSources(units.state.data, cyborg.state.data, data.cyborgUnit ?? null),
    },
    reload,
  };
}
