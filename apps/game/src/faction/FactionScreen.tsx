// 세력 화면(/faction) — 기획 46(세력·사회)을 따라 기술이 먼저 만든 초안(D-439). 기획이 46과 맞춰 보고 고친다.
// 지연 로딩 조각이다(default export, shell/routeViews.tsx).
// - 자료: faction.overview 하나. 내 몫·소속 세력은 실제 자료, 도시·외교·전쟁·정권·지분·점령은 규칙(R4b) 전이라 "곧 열림".
//   dev·admin이 시안 자료를 켜면(홈과 같은 스위치) 여섯 칸을 시안 장면으로 채우고 칸마다 "시험 자료"를 붙인다.
// - 배치: 좁으면(모바일) 요약 판 → 탭 → 고른 탭. 넓으면(64em 이상) 왼쪽 옆 판(요약·내 몫·잠긴 메뉴) + 오른쪽 탭.
// - 선전포고·투표·편입 답 같은 명령은 WebSocket으로만 보낸다(AGENTS 4장). 지금은 곧 열림 단추(누르면 알림만).
// - 독재가 아니면 시장 임명·선전포고·조약 제안은 바로 실행이 아니라 [안건 올리기]다(기획 검토 C4, decidesByVote).
// - 제목(h1)은 tabIndex=-1. 앱 안 이동 때 초점은 화면 틀이 옮긴다.
import type { FactionOverviewResponse } from "@terra/shared/faction";
import { useState } from "react";
import { formatCount } from "../home/numbers.ts";
import { m } from "../paraglide/messages.js";
import { BackButton } from "../shell/BackButton.tsx";
import {
  PreviewNotice,
  PreviewSwitch,
  QueryFailure,
  SectionHead,
  SoonButton,
  SoonPanel,
  SoonProvider,
  TabList,
  panelId,
  tabId,
} from "../sections/screenParts.tsx";
import { useScreenQuery } from "../sections/useScreenQuery.ts";
import { FactionCities } from "./FactionCities.tsx";
import { FactionDiplomacy } from "./FactionDiplomacy.tsx";
import { FactionOccupations, FactionShares } from "./FactionShares.tsx";
import { FactionSide } from "./FactionSide.tsx";
import { FactionVotes } from "./FactionVotes.tsx";
import { FactionWars } from "./FactionWars.tsx";
import { loadFactionOverview } from "./factionQueries.ts";
import { TAB_NAMES } from "./factionText.ts";
import { FACTION_TABS, type FactionTab, decidesByVote, sectionKind, tabCount } from "./factionView.ts";
import "../sections/screenParts.css";
import "./faction.css";

const TAB_PREFIX = "faction";

/** 고른 탭의 몸 */
function TabBody({ tab, view }: { tab: FactionTab; view: FactionOverviewResponse }) {
  const now = view.generatedAt;
  const byVote = decidesByVote(view.faction?.regime ?? null);
  switch (tab) {
    case "cities": {
      const section = view.cities;
      return (
        <>
          <SectionHead
            id="faction-cities-title"
            title={m.faction_cities_title()}
            preview={sectionKind(section) === "preview"}
          />
          {section.status === "ready" ? (
            <FactionCities cities={section.data} byVote={byVote} />
          ) : (
            <SoonPanel />
          )}
        </>
      );
    }
    case "diplomacy": {
      const section = view.diplomacy;
      return (
        <>
          <SectionHead
            id="faction-diplomacy-title"
            title={m.faction_diplomacy_title()}
            preview={sectionKind(section) === "preview"}
            end={<SoonButton label={byVote ? m.faction_dip_propose_vote() : m.faction_dip_propose()} />}
          />
          {section.status === "ready" ? <FactionDiplomacy rows={section.data} now={now} /> : <SoonPanel />}
        </>
      );
    }
    case "wars": {
      const section = view.wars;
      return (
        <>
          <SectionHead
            id="faction-wars-title"
            title={m.faction_wars_title()}
            preview={sectionKind(section) === "preview"}
            end={<SoonButton label={byVote ? m.faction_war_declare_vote() : m.faction_war_declare()} />}
          />
          {section.status === "ready" ? <FactionWars wars={section.data} now={now} /> : <SoonPanel />}
        </>
      );
    }
    case "votes": {
      const section = view.regime;
      const canPropose = section.status === "ready" && section.data.rule !== "leader";
      return (
        <>
          <SectionHead
            id="faction-votes-title"
            title={m.faction_votes_title()}
            preview={sectionKind(section) === "preview"}
            end={canPropose ? <SoonButton label={m.faction_vote_propose()} /> : undefined}
          />
          {section.status === "ready" ? <FactionVotes regime={section.data} now={now} /> : <SoonPanel />}
        </>
      );
    }
    case "shares": {
      const shares = view.shares;
      const occupations = view.occupations;
      return (
        <>
          <SectionHead
            id="faction-shares-title"
            title={m.faction_shares_title()}
            preview={sectionKind(shares) === "preview"}
          />
          {shares.status === "ready" ? <FactionShares shares={shares.data} now={now} /> : <SoonPanel />}
          <SectionHead
            id="faction-occupations-title"
            title={m.faction_occupations_title()}
            preview={sectionKind(occupations) === "preview"}
          />
          {occupations.status === "ready" ? (
            <FactionOccupations rows={occupations.data} now={now} />
          ) : (
            <SoonPanel />
          )}
        </>
      );
    }
    default: {
      const unhandled: never = tab;
      return unhandled;
    }
  }
}

function FactionBody({ view }: { view: FactionOverviewResponse }) {
  const [tab, setTab] = useState<FactionTab>("cities");
  const tabs = FACTION_TABS.map((id) => ({ id, name: TAB_NAMES[id](), count: tabCount(view, id) }));
  return (
    <div className="faction-layout">
      <FactionSide view={view} />
      <div className="faction-main">
        <TabList
          label={m.faction_tabs_label()}
          prefix={TAB_PREFIX}
          tabs={tabs}
          selected={tab}
          onSelect={setTab}
          formatCount={formatCount}
        />
        <section
          className="faction-panel"
          role="tabpanel"
          tabIndex={0}
          id={panelId(TAB_PREFIX, tab)}
          aria-labelledby={tabId(TAB_PREFIX, tab)}
        >
          <TabBody tab={tab} view={view} />
        </section>
      </div>
    </div>
  );
}

export default function FactionScreen() {
  const { state, refresh } = useScreenQuery(loadFactionOverview);
  const view = state.data;
  return (
    <section className="screen screen-wide faction" aria-labelledby="faction-title">
      <SoonProvider>
        <div className="screen-header">
          <h1 id="faction-title" className="screen-title" tabIndex={-1}>
            {m.nav_faction()}
          </h1>
          <BackButton />
        </div>
        <PreviewSwitch />
        {view?.preview === true ? <PreviewNotice message={m.faction_preview_notice()} /> : null}
        <QueryFailure
          error={state.status === "failed" ? state.error : null}
          title={m.faction_load_failed()}
          onRetry={refresh}
        />
        {view === null ? (
          state.status === "failed" ? null : (
            <p className="status" role="status">
              {m.faction_loading()}
            </p>
          )
        ) : (
          <FactionBody view={view} />
        )}
      </SoonProvider>
    </section>
  );
}
