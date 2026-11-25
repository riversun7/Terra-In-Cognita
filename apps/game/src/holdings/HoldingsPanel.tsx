// 보유 물건 판(유닛 하나) — 옛 LocationInventory의 사이보그 묶음을 우리 디자인 시스템으로: 머리 줄(물건 수·장착 수) + 걸러 보기
// (전체·장비·소모품, 옛 분류 거르기) + 걸린 효과·쓰기 쿨 + 물건 카드(장비 → 소모품 → 그 밖, 이름 차례) + 결과 알림.
// 칸 고르기 창이 열려 있으면 알림은 창 안에서 보인다(두 번 읽히지 않게).
// docs/adr/2026-11-03-item-holdings.md "바뀜 (화면)".
import { isOrganSlot } from "@terra/shared/roster";
import type { RosterNames } from "@terra/shared/roster";
import { useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { formatNumber } from "../roster/rosterText.ts";
import { EffectsAndCooldowns, HoldingCard, NoticeLine } from "./HoldingParts.tsx";
import { HOLDING_FILTERS, type HoldingFilter, type UnitHoldings, filterHoldings } from "./holdingsModel.ts";
import type { HoldingsController } from "./useHoldings.ts";

const FILTER_LABELS = {
  all: () => m.holdings_filter_all(),
  equipment: () => m.holdings_filter_equipment(),
  consumable: () => m.holdings_filter_consumable(),
} satisfies Record<HoldingFilter, () => string>;

export function HoldingsPanel({
  view,
  controller,
  names,
  includeOrgans = true,
}: {
  view: UnitHoldings;
  controller: HoldingsController;
  names: RosterNames;
  /** false이면 인공장기 칸에 이식된 아이템은 소지품 목록에서 뺀다(인공장기는 유닛 정보·스탯창에서 본다) */
  includeOrgans?: boolean;
}) {
  const id = useId();
  const [filter, setFilter] = useState<HoldingFilter>("all");
  const equipped = view.slots.filter(
    (cell) => cell.holding !== null && (includeOrgans || !isOrganSlot(cell.kind)),
  );
  // 입은 것(칸 차례) + 든 것: 옛 화면처럼 한 목록에 착용 표를 붙여 보인다
  const all = [...equipped.flatMap((cell) => (cell.holding ? [cell.holding] : [])), ...view.carried];
  const shown = filterHoldings(all, filter);
  return (
    <div className="holdings" data-unit={view.unit}>
      {controller.sheet === null ? <NoticeLine notice={controller.notice} /> : null}
      <EffectsAndCooldowns view={view} now={controller.now} />
      <div className="holdings-head">
        <p className="roster-meta" id={`${id}-summary`}>
          {m.holdings_summary({
            count: formatNumber(all.length),
            equipped: formatNumber(equipped.length),
          })}
        </p>
        <div className="holdings-filters" role="group" aria-label={m.holdings_filter_label()}>
          {HOLDING_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className="button-small holdings-filter"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {FILTER_LABELS[value]()}
            </button>
          ))}
        </div>
      </div>
      {all.length === 0 ? (
        <p className="roster-empty">{m.cyborg_inventory_empty()}</p>
      ) : shown.length === 0 ? (
        <p className="roster-empty">{m.holdings_filter_empty()}</p>
      ) : (
        <ul className="holding-list" aria-describedby={`${id}-summary`}>
          {shown.map((holding) => (
            <HoldingCard
              key={holding.id}
              holding={holding}
              view={view}
              controller={controller}
              names={names}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
