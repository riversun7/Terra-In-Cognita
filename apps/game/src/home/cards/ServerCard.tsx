// 서버 카드(내 사이보그·보유 유닛·세력) — 실제 조회(cyborg.get · units.list · faction.overview)가 준비되면
// 요약 지표를 타일로 그리고, 받기 전이거나 본체가 없을 때는 dashboard.cards의 기본 상태를 그린다.
import type { CardState, ServerCardId } from "@terra/shared/dashboard";
import { PRIMARY_STATS } from "@terra/shared/roster";
import { loadFactionOverview } from "../../faction/factionQueries.ts";
import { STAGE_NAMES } from "../../faction/factionText.ts";
import { m } from "../../paraglide/messages.js";
import { localName } from "../../roster/rosterText.ts";
import { loadCyborg, loadUnits, useRosterQuery } from "../../roster/useRosterQuery.ts";
import { useScreenQuery } from "../../sections/useScreenQuery.ts";
import { AppLink } from "../../shell/AppLink.tsx";
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

function ServerCardBody({ id, data }: { id: ServerCardId; data: HomeData }) {
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

export function CyborgCardBody({ data }: CardBodyProps) {
  const preview = usePreviewOn();
  const query = useRosterQuery(loadCyborg, preview);
  if (query.state.status === "ready" && query.state.data.body !== null) {
    const { name, body } = query.state.data;
    return (
      <>
        <div className="home-cyborg-head">
          <span className="home-cyborg-name" translate="no">
            {name}
          </span>
          <span className="home-cyborg-lv">
            Lv.{formatCount(body.level)} / {formatCount(body.maxLevel)}
          </span>
        </div>
        <div className="home-primaries">
          {PRIMARY_STATS.map((stat) => {
            const pair = body.stats.primaries[stat];
            return (
              <div key={stat} className="home-primary-chip" data-stat={stat}>
                <span className="home-primary-code" translate="no">
                  {stat.toUpperCase()}
                </span>
                <span>{formatCount(pair.base + pair.bonus)}</span>
              </div>
            );
          })}
        </div>
        <AppLink className="home-link-button" to={{ route: "cyborg" }}>
          {m.nav_cyborg()}
        </AppLink>
      </>
    );
  }
  return <ServerCardBody id="cyborg" data={data} />;
}

export function UnitsCardBody({ data }: CardBodyProps) {
  const preview = usePreviewOn();
  const query = useRosterQuery(loadUnits, preview);
  if (query.state.status === "ready") {
    const list = query.state.data;
    return (
      <>
        <div className="home-stat-grid">
          <div className="home-stat-tile">
            <span className="home-stat-label">{m.units_tab_list()}</span>
            <span className="home-stat-value">{formatCount(list.units.length)}</span>
          </div>
          <div className="home-stat-tile">
            <span className="home-stat-label">{m.units_tab_parties()}</span>
            <span className="home-stat-value">{formatCount(list.parties.length)}</span>
          </div>
          <div className="home-stat-tile">
            <span className="home-stat-label">{m.units_tab_managers()}</span>
            <span className="home-stat-value">{formatCount(list.bases.length)}</span>
          </div>
        </div>
        <AppLink className="home-link-button" to={{ route: "units" }}>
          {m.nav_units()}
        </AppLink>
      </>
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
        <>
          <div className="home-cyborg-head">
            <span className="home-cyborg-name" translate="no">
              {factionName}
            </span>
            {view.faction.tag === null ? null : (
              <span className="home-cyborg-lv" translate="no">
                {view.faction.tag}
              </span>
            )}
          </div>
          <div className="home-stat-grid">
            <div className="home-stat-tile">
              <span className="home-stat-label">{m.faction_field_cities()}</span>
              <span className="home-stat-value">{formatCount(view.faction.cityCount)}</span>
            </div>
            <div className="home-stat-tile">
              <span className="home-stat-label">{m.faction_field_members()}</span>
              <span className="home-stat-value">{formatCount(view.faction.memberCount)}</span>
            </div>
          </div>
          <AppLink className="home-link-button" to={{ route: "faction" }}>
            {m.nav_faction()}
          </AppLink>
        </>
      );
    }
    return (
      <>
        <div className="home-cyborg-head">
          <span className="home-cyborg-name">{m.faction_none_title()}</span>
          <span className="home-cyborg-lv">{STAGE_NAMES[view.stage]()}</span>
        </div>
        <div className="home-stat-grid">
          <div className="home-stat-tile">
            <span className="home-stat-label">{m.faction_me_units()}</span>
            <span className="home-stat-value">{formatCount(view.me.units)}</span>
          </div>
          <div className="home-stat-tile">
            <span className="home-stat-label">{m.faction_me_buildings()}</span>
            <span className="home-stat-value">{formatCount(view.me.buildings)}</span>
          </div>
        </div>
        <AppLink className="home-link-button" to={{ route: "faction" }}>
          {m.nav_faction()}
        </AppLink>
      </>
    );
  }
  return <ServerCardBody id="faction" data={data} />;
}
