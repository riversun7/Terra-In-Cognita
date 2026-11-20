// 서버 카드(보유 유닛·세력) 및 공통 대기 상태 — 실제 조회(units.list · faction.overview)가 준비되면
// 프로 터미널 KPI 지표·유닛 활동 요약으로 그리고, 받기 전이거나 본체가 없을 때는 dashboard.cards 기본 상태를 그린다.
import type { CardState, ServerCardId } from "@terra/shared/dashboard";
import { loadFactionOverview } from "../../faction/factionQueries.ts";
import { STAGE_NAMES } from "../../faction/factionText.ts";
import { m } from "../../paraglide/messages.js";
import { localName } from "../../roster/rosterText.ts";
import { loadUnits, useRosterQuery } from "../../roster/useRosterQuery.ts";
import { useScreenQuery } from "../../sections/useScreenQuery.ts";
import type { HomeData } from "../homeData.ts";
import type { CardBodyProps } from "../homeTypes.ts";
import { HomeLoading } from "../InboxBody.tsx";
import { usePreviewOn } from "../inboxParts.ts";
import { formatCount } from "../numbers.ts";

/** 카드마다 "무엇이 언제 보일지". 서버 카드가 늘면 여기서 타입 오류가 난다 */
const HINT = {
  cyborg: m.card_cyborg_empty,
  units: m.card_units_empty,
  assets: m.card_assets_empty,
  faction: m.card_faction_empty,
} satisfies Record<ServerCardId, () => string>;

function stateOf(data: HomeData, id: ServerCardId): CardState | undefined {
  return data.cards.value?.cards.find((card) => card.id === id);
}

export function ServerCardBody({ id, data }: { id: ServerCardId; data: HomeData }) {
  const state = stateOf(data, id);
  if (state === undefined) {
    // 받는 중이면 한 줄, 받지 못했으면 화면 위 알림이 알린다(상태를 모르므로 "준비 중"이라고 하지 않는다)
    return data.cards.status === "loading" ? <HomeLoading /> : <p className="home-card-hint">{HINT[id]()}</p>;
  }
  return (
    <>
      {state.status === "not_ready" ? (
        <span className="home-card-status">{m.home_card_not_ready()}</span>
      ) : null}
      <p className="home-card-hint">{HINT[id]()}</p>
    </>
  );
}

export function UnitsCardBody({ data }: CardBodyProps) {
  const preview = usePreviewOn();
  const query = useRosterQuery(loadUnits, preview);
  if (query.state.status === "ready") {
    const list = query.state.data;
    const active = list.units.filter((u) => u.moving || u.job !== null).length;
    const idle = Math.max(0, list.units.length - active);
    return (
      <div className="dash-ops-body">
        <div className="dash-mini-kpis">
          <div className="dash-mini-kpi">
            <span className="dash-mini-label">{m.units_tab_list()}</span>
            <span className="dash-mini-val" data-accent="cyan">
              {formatCount(list.units.length)}
            </span>
          </div>
          <div className="dash-mini-kpi">
            <span className="dash-mini-label">{m.units_tab_parties()}</span>
            <span className="dash-mini-val" data-accent="cobalt">
              {formatCount(list.parties.length)}
            </span>
          </div>
          <div className="dash-mini-kpi">
            <span className="dash-mini-label">{m.units_tab_managers()}</span>
            <span className="dash-mini-val" data-accent="violet">
              {formatCount(list.bases.length)}
            </span>
          </div>
        </div>
        {list.units.length > 0 ? (
          <div className="dash-ops-foot">
            <span className="dash-status-dot" data-tone="ok" aria-hidden="true" />
            <span>{m.home_units_active_meta({ active: formatCount(active), idle: formatCount(idle) })}</span>
          </div>
        ) : (
          <p className="dash-ops-note">{m.home_units_empty_hint()}</p>
        )}
      </div>
    );
  }
  return <ServerCardBody id="units" data={data} />;
}

export function FactionCardBody({ data }: CardBodyProps) {
  const query = useScreenQuery(loadFactionOverview);
  if (query.state.status === "ready") {
    const view = query.state.data;
    if (view.faction !== null) {
      const factionName = view.faction.label
        ? localName(view.faction.label, view.faction.name)
        : view.faction.name;
      return (
        <div className="dash-ops-body">
          <div className="dash-faction-banner">
            <span className="dash-faction-name" translate="no">
              {factionName}
            </span>
            {view.faction.tag === null ? null : (
              <span className="dash-tag-chip" data-kind="ok" translate="no">
                {view.faction.tag}
              </span>
            )}
          </div>
          <div className="dash-mini-kpis">
            <div className="dash-mini-kpi">
              <span className="dash-mini-label">{m.faction_field_cities()}</span>
              <span className="dash-mini-val" data-accent="amber">
                {formatCount(view.faction.cityCount)}
              </span>
            </div>
            <div className="dash-mini-kpi">
              <span className="dash-mini-label">{m.faction_field_members()}</span>
              <span className="dash-mini-val" data-accent="emerald">
                {formatCount(view.faction.memberCount)}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="dash-ops-body">
        <div className="dash-faction-banner">
          <span className="dash-faction-name">{m.faction_none_title()}</span>
          <span className="dash-tag-chip" data-kind="meta">
            {STAGE_NAMES[view.stage]()}
          </span>
        </div>
        <div className="dash-mini-kpis">
          <div className="dash-mini-kpi">
            <span className="dash-mini-label">{m.faction_me_units()}</span>
            <span className="dash-mini-val" data-accent="cyan">
              {formatCount(view.me.units)}
            </span>
          </div>
          <div className="dash-mini-kpi">
            <span className="dash-mini-label">{m.faction_me_buildings()}</span>
            <span className="dash-mini-val" data-accent="amber">
              {formatCount(view.me.buildings)}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return <ServerCardBody id="faction" data={data} />;
}
