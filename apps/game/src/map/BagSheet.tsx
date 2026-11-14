// 2차맵 아래 탭 [가방] 판 — 사용자 요청 2026-11-14 "하단 메뉴에도 유닛이 보유한 아이템 리스트 볼수있는 버튼"(고른 유닛의 물건 — 사용자 답).
// docs/adr/2026-11-14-inventory-screen.md. 고른 유닛(기본 내 사이보그)의 화물(원장 cargo 자리)과 장비·지닌 물건(holdings/UnitHoldings.tsx —
// 칸 고르기·장착·해제·사용)을 보인다. 내 유닛이 아니면 안내만. [인벤토리에서 보기]는 그 유닛을 펼친 인벤토리 [유닛별] 칸을 연다.
import type { RosterUnit } from "@terra/shared/roster";
import { useEffect } from "react";
import { fmt } from "../economy/economyText.ts";
import { NO_ARGS, useHoldings } from "../economy/queries.ts";
import { UnitHoldings } from "../holdings/UnitHoldings.tsx";
import { usePreviewOn } from "../inbox/preview.ts";
import { m } from "../paraglide/messages.js";
import { LoadState } from "../roster/parts.tsx";
import { assetLabel, unitLabel } from "../roster/rosterText.ts";
import { loadUnits, useRosterQuery } from "../roster/useRosterQuery.ts";
import { AppLink } from "../shell/AppLink.tsx";
import "./bag.css";

export function BagSheet({
  unitId,
  mine,
  onClose,
}: {
  /** 고른 유닛(없으면 null) */
  readonly unitId: number | null;
  /** 고른 유닛이 내 유닛인가(물건은 내 것만 보인다) */
  readonly mine: boolean;
  readonly onClose: () => void;
}) {
  const preview = usePreviewOn();
  const roster = useRosterQuery(loadUnits, preview);
  const holdings = useHoldings(NO_ARGS);
  const refresh = holdings.refresh;
  // 판을 열 때 화물 잔고를 새로 받는다(채집으로 바뀌었을 수 있다)
  useEffect(() => {
    refresh();
  }, [refresh]);
  const unit: RosterUnit | undefined =
    roster.state.status === "ready" && unitId !== null
      ? roster.state.data.units.find((entry) => entry.id === `w${unitId}`)
      : undefined;
  const cargo = holdings.data?.places.find((place) => place.id === `cargo_${unitId}`);
  const title = unit ? unitLabel(unit) : unitId === null ? m.map_bag_title() : `#${unitId}`;
  return (
    <section
      className="map-panel map-units map-bag"
      aria-labelledby="map-bag-title"
      data-unit={unitId ?? undefined}
    >
      <div className="map-units-head">
        <h2 id="map-bag-title" className="map-units-title">
          {m.map_bag_heading({ unit: title })}
        </h2>
        <button type="button" className="button-small map-units-close" onClick={onClose}>
          {m.map_bag_close()}
        </button>
      </div>
      {unitId === null || !mine ? (
        <p className="map-units-note">{m.map_bag_not_mine()}</p>
      ) : (
        <div className="map-bag-body">
          <h3 className="map-bag-subtitle">{m.inventory_cargo_title()}</h3>
          {cargo && cargo.lines.length > 0 ? (
            <ul className="map-bag-list" data-part="cargo">
              {cargo.lines.map((line) => (
                <li key={line.asset} className="map-bag-row" data-asset={line.asset}>
                  <span className="map-bag-name">
                    {roster.state.status === "ready"
                      ? assetLabel(line.asset, roster.state.data.names)
                      : line.asset}
                  </span>
                  <span className="map-bag-qty">{fmt(line.qty)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="map-units-note">{holdings.data ? m.inventory_cargo_none() : m.shell_loading()}</p>
          )}
          <h3 className="map-bag-subtitle">{m.holdings_unit_title()}</h3>
          {roster.state.status !== "ready" ? (
            <LoadState state={roster.state} onRetry={roster.reload} />
          ) : unit ? (
            <UnitHoldings
              unit={unitId}
              fallbackLayout={unit.slots.map((slot) => slot.slot)}
              names={roster.state.data.names}
              onChanged={refresh}
            />
          ) : (
            <p className="map-units-note">{m.map_bag_not_mine()}</p>
          )}
          <AppLink
            className="button-small map-bag-more"
            to={{ route: "inventory", search: { tab: "units", unit: String(unitId) } }}
          >
            {m.map_bag_more()}
          </AppLink>
        </div>
      )}
    </section>
  );
}
