// 운영자 콘솔(/ops) — 지연 로딩 조각. 모든 유저·NPC·유닛을 감시하고 통제한다(docs/adr/2026-11-08-operator-console.md).
// 탭은 내 운영 권한(api.ops.me)으로 고른다. 화면에서 가리는 것은 편의일 뿐이고, 서버가 요청마다 권한을 본다.
// 유저와 NPC를 탭으로 나눈다. 방대한 자료(스탯·스킬·보유 물건)는 목록에서 줄을 눌러 상세(오른쪽·아래 판)로 옮겨 본다.
// 주소 검색어 ?tab=·?user=·?faction=·?unit=은 처음 열 때만 읽는다(바로 연 링크). 그 뒤 탭·상세는 화면 안 상태다.
import type { AccountView, RouteMatch } from "@terra/shared";
import { OPS_PERMISSIONS, type OpsPermission } from "@terra/shared/ops";
import { type ReactNode, useCallback, useId, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { useMountFocus } from "../ui/useMountFocus.ts";
import { AuditTab } from "./AuditTab.tsx";
import { EconomyTab } from "./EconomyTab.tsx";
import { EmblemsTab } from "./EmblemsTab.tsx";
import { FactionDetail } from "./FactionDetail.tsx";
import { CurrenciesTab } from "./CurrenciesTab.tsx";
import { FactionsTab } from "./FactionsTab.tsx";
import { CitiesTab } from "./NpcTabs.tsx";
import { LoadState, PERMISSION_LABELS, useOpsLoad } from "./opsUi.tsx";
import { OverviewTab } from "./OverviewTab.tsx";
import { PlayerDetail } from "./PlayerDetail.tsx";
import { PlayersTab } from "./PlayersTab.tsx";
import { UnitDetail } from "./UnitDetail.tsx";
import { UnitsTab } from "./UnitsTab.tsx";
import "./ops.css";

// 권한 부여는 개발자 영역(/dev/ops-grants)으로 옮겼다(사용자 결정 2026-11-08 "권한부여는 개발자가하는 기능이다")
const TABS = [
  "overview",
  "players",
  "npcs",
  "cities",
  "currencies",
  "units",
  "economy",
  "audit",
  // 마크 관리(docs/adr/2026-11-11-faction-identity.md 5절)는 맨 끝에 둔다(앞 탭의 차례를 바꾸지 않는다)
  "emblems",
] as const;
type Tab = (typeof TABS)[number];

/** 탭마다 필요한 권한(하나라도 있으면 보인다) */
const TAB_NEEDS: { readonly [T in Tab]: readonly OpsPermission[] } = {
  overview: ["view_server"],
  players: ["view_players"],
  npcs: ["view_npcs"],
  cities: ["view_npcs"],
  currencies: ["view_npcs"],
  emblems: ["emblem_moderate"],
  units: ["view_players", "view_npcs"],
  economy: ["view_economy"],
  audit: ["view_audit"],
};

const TAB_LABELS: { readonly [T in Tab]: () => string } = {
  overview: m.ops_tab_overview,
  players: m.ops_tab_players,
  npcs: m.ops_tab_npcs,
  cities: m.ops_tab_cities,
  currencies: m.ops_tab_currencies,
  emblems: m.ops_tab_emblems,
  units: m.ops_tab_units,
  economy: m.ops_tab_economy,
  audit: m.ops_tab_audit,
};

const isTab = (value: string | undefined): value is Tab =>
  value !== undefined && (TABS as readonly string[]).includes(value);

/** 지금 보는 상세 */
export type OpsDetail =
  | { kind: "user"; id: string }
  | { kind: "faction"; id: number }
  | { kind: "unit"; id: number }
  | null;

/** 목록·상세가 다른 대상을 열 때 쓴다 */
export type OpenDetail = (detail: OpsDetail) => void;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const positiveId = (value: string | undefined): number | null => {
  if (value === undefined || !/^[1-9][0-9]{0,15}$/.test(value)) return null;
  return Number(value);
};

function initialDetail(search: {
  readonly user?: string | undefined;
  readonly faction?: string | undefined;
  readonly unit?: string | undefined;
}): OpsDetail {
  if (search.user !== undefined && UUID_PATTERN.test(search.user)) return { kind: "user", id: search.user };
  const faction = positiveId(search.faction);
  if (faction !== null) return { kind: "faction", id: faction };
  const unit = positiveId(search.unit);
  return unit === null ? null : { kind: "unit", id: unit };
}

interface OpsConsoleProps {
  viewer: AccountView;
  match: RouteMatch;
}

export default function OpsConsole({ viewer, match }: OpsConsoleProps) {
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const tabsId = useId();
  const search = match.id === "ops" ? match.search : {};
  const [tab, setTab] = useState<Tab | null>(isTab(search.tab) ? search.tab : null);
  const [detail, setDetail] = useState<OpsDetail>(() => initialDetail(search));
  const access = useOpsLoad(
    useCallback((signal: AbortSignal) => api.ops.me.query(undefined, { signal }), []),
  );
  const permissions = access.data?.permissions ?? [];
  const can = (permission: OpsPermission): boolean => permissions.includes(permission);
  const visibleTabs = TABS.filter((value) => TAB_NEEDS[value].some(can));
  const shownTab = tab !== null && visibleTabs.includes(tab) ? tab : (visibleTabs[0] ?? null);
  const open: OpenDetail = setDetail;

  let body: ReactNode = null;
  switch (shownTab) {
    case "overview":
      body = <OverviewTab />;
      break;
    case "players":
      body = <PlayersTab open={open} />;
      break;
    case "npcs":
      body = <FactionsTab open={open} />;
      break;
    case "cities":
      body = <CitiesTab open={open} />;
      break;
    case "currencies":
      body = <CurrenciesTab open={open} canEdit={can("faction_edit")} />;
      break;
    case "emblems":
      body = <EmblemsTab open={open} canSwitch={can("faction_edit")} />;
      break;
    case "units":
      body = <UnitsTab open={open} canUsers={can("view_players")} canNpcs={can("view_npcs")} />;
      break;
    case "economy":
      body = <EconomyTab />;
      break;
    case "audit":
      body = <AuditTab />;
      break;
    case null:
      body = null;
  }

  let side: ReactNode = null;
  if (detail?.kind === "user")
    side = <PlayerDetail key={detail.id} userId={detail.id} viewerId={viewer.id} can={can} open={open} />;
  else if (detail?.kind === "faction")
    side = <FactionDetail key={detail.id} factionId={detail.id} can={can} open={open} />;
  else if (detail?.kind === "unit") side = <UnitDetail key={detail.id} unitId={detail.id} can={can} />;

  return (
    <section className="screen ops" data-density="compact" aria-labelledby="ops-title">
      <div className="screen-header">
        <h1 id="ops-title" className="screen-title" ref={headingRef} tabIndex={-1}>
          {m.ops_title()}
        </h1>
      </div>
      <LoadState loaded={access} />
      {access.data && permissions.length === 0 ? <p className="message">{m.ops_no_access()}</p> : null}
      {permissions.length > 0 ? (
        <p className="dev-muted ops-access">
          {m.ops_my_access({
            list: OPS_PERMISSIONS.filter(can)
              .map((permission) => PERMISSION_LABELS[permission]())
              .join(", "),
          })}
        </p>
      ) : null}
      {visibleTabs.length > 0 ? (
        <div className="ops-tabs" role="tablist" aria-label={m.ops_title()}>
          {visibleTabs.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`${tabsId}-${value}`}
              aria-selected={shownTab === value}
              aria-controls={`${tabsId}-panel`}
              className="ops-tab"
              onClick={() => setTab(value)}
            >
              {TAB_LABELS[value]()}
            </button>
          ))}
        </div>
      ) : null}
      <div className={side ? "ops-split ops-split-open" : "ops-split"}>
        <div
          className="ops-main"
          role="tabpanel"
          id={`${tabsId}-panel`}
          aria-labelledby={shownTab ? `${tabsId}-${shownTab}` : undefined}
        >
          {body}
        </div>
        {side ? (
          <aside
            className="ops-side panel"
            aria-label={
              detail?.kind === "faction"
                ? m.ops_detail_faction()
                : detail?.kind === "unit"
                  ? m.ops_detail_unit()
                  : m.ops_detail_player()
            }
          >
            <div className="ops-side-head">
              <button type="button" className="button-small" onClick={() => setDetail(null)}>
                {m.ops_close()}
              </button>
            </div>
            {side}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
