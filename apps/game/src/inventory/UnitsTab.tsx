// 인벤토리 [유닛별] 칸 — 내 사이보그(먼저)와 세계 유닛마다 화물(원장 cargo 자리)과 장비·지닌 물건(holdings/UnitHoldings.tsx: 칸 고르기·장착·해제·사용).
// docs/adr/2026-11-14-inventory-screen.md. 펼친 유닛 하나만 보유 물건 판을 연다(유닛마다 holdings.list를 따로 받지 않게) — 펼친 유닛은
// 주소 search unit(2차맵 [가방] 판의 [자세히]가 그 유닛을 펼친 채 연다).
import type { HoldingPlace } from "@terra/shared/economy";
import type { CatalogIndex } from "../economy/economyText.ts";
import { UnitHoldings } from "../holdings/UnitHoldings.tsx";
import { m } from "../paraglide/messages.js";
import { LoadState } from "../roster/parts.tsx";
import { navigate } from "../shell/routerStore.ts";
import { PlaceCard } from "./PlaceCard.tsx";
import type { GearQuery } from "./unitGear.ts";

export function UnitsTab({
  gear,
  cargo,
  index,
  now,
  open,
}: {
  /** 장비 판을 그릴 내 유닛(사이보그 먼저, unitGear.ts) */
  gear: GearQuery;
  cargo: ReadonlyMap<number, HoldingPlace>;
  index: CatalogIndex;
  now: number;
  /** 펼친 유닛(세계 유닛 ID, 없으면 null) */
  open: number | null;
}) {
  if (gear.state.status !== "ready") return <LoadState state={gear.state} onRetry={gear.reload} />;
  const units = gear.state.data;
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
        const place = cargo.get(unit.unitId);
        const expanded = open === unit.unitId;
        const kinds = place?.lines.length ?? 0;
        return (
          <li
            key={unit.unitId}
            className="panel inventory-unit"
            data-unit={unit.unitId}
            data-cyborg={unit.cyborg || undefined}
            data-open={expanded}
          >
            <button
              type="button"
              className="inventory-unit-head"
              aria-expanded={expanded}
              onClick={() => toggle(unit.unitId)}
            >
              <span className="inventory-unit-name">{unit.label}</span>
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
                <h3 className="eco-section-title">{m.holdings_carried_title()}</h3>
                <UnitHoldings
                  unit={unit.unitId}
                  fallbackLayout={unit.layout}
                  names={unit.names}
                  mode="inventory"
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
