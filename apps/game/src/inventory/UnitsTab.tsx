// 인벤토리 [유닛별] 칸 — 내 세계 유닛마다 화물(원장 cargo 자리)과 장비·지닌 물건(holdings/UnitHoldings.tsx: 칸 고르기·장착·해제·사용).
// docs/adr/2026-11-14-inventory-screen.md. 펼친 유닛 하나만 보유 물건 판을 연다(유닛마다 holdings.list를 따로 받지 않게) — 펼친 유닛은
// 주소 search unit(2차맵 [가방] 판의 [자세히]가 그 유닛을 펼친 채 연다).
import type { HoldingPlace } from "@terra/shared/economy";
import type { RosterUnit, UnitsListResponse } from "@terra/shared/roster";
import type { CatalogIndex } from "../economy/economyText.ts";
import { UnitHoldings } from "../holdings/UnitHoldings.tsx";
import { m } from "../paraglide/messages.js";
import { LoadState } from "../roster/parts.tsx";
import { unitLabel } from "../roster/rosterText.ts";
import { worldUnitId } from "../roster/useVitals.ts";
import type { RosterQuery } from "../roster/useRosterQuery.ts";
import { navigate } from "../shell/routerStore.ts";
import { PlaceCard } from "./PlaceCard.tsx";

/** 세계 유닛(w…)만, 화물이 있는 유닛 먼저 → 이름 차례 */
function worldUnits(data: UnitsListResponse, cargo: ReadonlyMap<number, HoldingPlace>): RosterUnit[] {
  return data.units
    .filter((unit) => !unit.preview && worldUnitId(unit.id) !== null)
    .toSorted((a, b) => {
      const ca = cargo.has(worldUnitId(a.id) ?? 0) ? 0 : 1;
      const cb = cargo.has(worldUnitId(b.id) ?? 0) ? 0 : 1;
      return ca - cb || unitLabel(a).localeCompare(unitLabel(b));
    });
}

export function UnitsTab({
  roster,
  cargo,
  index,
  now,
  open,
}: {
  roster: RosterQuery<UnitsListResponse>;
  cargo: ReadonlyMap<number, HoldingPlace>;
  index: CatalogIndex;
  now: number;
  /** 펼친 유닛(세계 유닛 ID, 없으면 null) */
  open: number | null;
}) {
  if (roster.state.status !== "ready") return <LoadState state={roster.state} onRetry={roster.reload} />;
  const data = roster.state.data;
  const units = worldUnits(data, cargo);
  if (units.length === 0) return <p className="panel eco-empty">{m.inventory_units_empty()}</p>;
  const toggle = (unitId: number): void => {
    navigate(
      { route: "inventory", search: { tab: "units", ...(open === unitId ? {} : { unit: String(unitId) }) } },
      { replace: true },
    );
  };
  return (
    <ul className="inventory-units">
      {units.map((unit) => {
        const unitId = worldUnitId(unit.id) ?? 0;
        const place = cargo.get(unitId);
        const expanded = open === unitId;
        const kinds = place?.lines.length ?? 0;
        return (
          <li key={unit.id} className="panel inventory-unit" data-unit={unitId} data-open={expanded}>
            <button
              type="button"
              className="inventory-unit-head"
              aria-expanded={expanded}
              onClick={() => toggle(unitId)}
            >
              <span className="inventory-unit-name">{unitLabel(unit)}</span>
              <span className="inventory-unit-meta">
                {kinds === 0 ? m.inventory_cargo_none() : m.inventory_cargo_kinds({ kinds })}
              </span>
            </button>
            {expanded ? (
              <div className="inventory-unit-body">
                {place ? (
                  <PlaceCard place={place} index={index} now={now} title={m.inventory_cargo_title()} />
                ) : (
                  <p className="eco-empty">{m.inventory_cargo_none()}</p>
                )}
                <h3 className="eco-section-title">{m.holdings_unit_title()}</h3>
                <UnitHoldings
                  unit={unitId}
                  fallbackLayout={unit.slots.map((slot) => slot.slot)}
                  names={data.names}
                  onChanged={roster.reload}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
