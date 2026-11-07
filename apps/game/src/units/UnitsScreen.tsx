// 유닛 화면 — 기획 60 §9 "유닛" 두 줄(D-6016·D-179·D-246 / D-242·D-244·D-269·D-271). ADR 37 "구현하며 정한 것 (유닛·사이보그 화면)".
// 칸(탭) 일곱: 목록(걸러 보기·다중 선택·상세) · 파티(진형) · 직무 프리셋 · 관리인 · 경매소 · 포로 ·
// 융합(사이보그 유닛 융합·유전자 조각, D-470·D-478 — FusionPanel.tsx, 자료는 fusion.overview·명령은 WebSocket 프로토콜 9).
// - 자료는 units.list 하나(실제 세계 유닛 + dev·admin 시안 자료). 바꾸는 명령(직무 배치·장착·편성·입찰·포로 처리)은 아직 없어
//   "곧 열림" 버튼이다(명령은 WebSocket으로 만들 때 켠다, AGENTS 4장).
// - 좁은 폭: 목록 ↔ 상세를 바꿔 보인다(상세 [목록으로]). 넓은 폭(64em 이상): 목록 옆에 상세 판(데스크톱 옆 판, D-6003).
// - 고른 칸·상세·걸러 보기·다중 선택은 화면 안 상태다(주소에 남기지 않는다. [임시] 뒤로는 화면을 떠난다).
// 지연 로딩 조각(routeViews.tsx).
import type { UnitsListResponse } from "@terra/shared/roster";
import { type KeyboardEvent, useCallback, useId, useMemo, useState } from "react";
import { m } from "../paraglide/messages.js";
import { usePreviewOn } from "../inbox/preview.ts";
import { BackButton } from "../shell/BackButton.tsx";
import { LoadState } from "../roster/parts.tsx";
import { PreviewSwitch } from "../roster/PreviewSwitch.tsx";
import { loadUnits, useRosterQuery } from "../roster/useRosterQuery.ts";
import { type VitalsNow, useVitals } from "../roster/useVitals.ts";
import { formatNumber } from "../roster/rosterText.ts";
import { FusionPanel } from "./FusionPanel.tsx";
import { UnitList } from "./UnitList.tsx";
import { AuctionPanel, ManagersPanel, PartiesPanel, PresetsPanel, PrisonersPanel } from "./UnitPanels.tsx";
import "./units.css";

const TABS = ["list", "parties", "presets", "managers", "auction", "prisoners", "fusion"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS = {
  list: m.units_tab_list,
  parties: m.units_tab_parties,
  presets: m.units_tab_presets,
  managers: m.units_tab_managers,
  auction: m.units_tab_auction,
  prisoners: m.units_tab_prisoners,
  fusion: m.units_tab_fusion,
} satisfies Record<Tab, () => string>;

export default function UnitsScreen() {
  const preview = usePreviewOn();
  const query = useRosterQuery(loadUnits, preview);
  // 생명 수치(D-512): 실제 세계 유닛만, 기기가 분 단위로 셈한다
  const vitals = useVitals();
  // 장착·해제·버프 뒤: 생명 수치(최대가 장비를 따른다)와 유닛 목록(스탯에 입은 장비·버프가 든다)을 다시 받는다
  const reloadVitals = vitals.reload;
  const reloadUnits = query.reload;
  const onHoldingsChanged = useCallback(() => {
    reloadVitals();
    reloadUnits();
  }, [reloadVitals, reloadUnits]);
  const [tab, setTab] = useState<Tab>("list");
  const baseId = useId();
  const state = query.state;
  const data = state.status === "ready" ? state.data : null;
  const counts = useMemo(
    () =>
      data
        ? {
            list: data.units.length,
            parties: data.parties.length,
            presets: data.presets.length,
            managers: data.bases.length,
            auction: data.auction.length,
            prisoners: data.prisoners.length,
            // 융합 칸은 자기 자료(fusion.overview)를 따로 받는다
            fusion: 0,
          }
        : null,
    [data],
  );

  /** 칸 줄에서 ←·→·Home·End로 옮긴다(WAI-ARIA 탭 패턴) */
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1;
    const next =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    const target = TABS[next];
    if (!target) return;
    setTab(target);
    document.getElementById(`${baseId}-tab-${target}`)?.focus();
  };

  return (
    <section className="screen screen-wide units" aria-labelledby={`${baseId}-title`} data-density="compact">
      <div className="screen-header">
        <h1 id={`${baseId}-title`} className="screen-title" tabIndex={-1}>
          {m.nav_units()}
        </h1>
        <PreviewSwitch />
        <BackButton />
      </div>
      {data?.preview ? <p className="roster-notice">{m.roster_preview_notice()}</p> : null}
      <div className="units-tabs" role="tablist" aria-label={m.units_tabs_label()}>
        {TABS.map((id, index) => (
          <button
            key={id}
            id={`${baseId}-tab-${id}`}
            type="button"
            role="tab"
            className="units-tab"
            aria-selected={tab === id}
            aria-controls={`${baseId}-panel`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => onTabKey(event, index)}
          >
            <span>{TAB_LABELS[id]()}</span>
            {counts && counts[id] > 0 ? (
              <span className="units-tab-count">{formatNumber(counts[id])}</span>
            ) : null}
          </button>
        ))}
      </div>
      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${tab}`}
        className="units-panel"
      >
        {state.status === "ready" ? (
          <TabBody tab={tab} data={state.data} vitals={vitals} onHoldingsChanged={onHoldingsChanged} />
        ) : (
          <LoadState state={state} onRetry={query.reload} />
        )}
      </div>
    </section>
  );
}

function TabBody({
  tab,
  data,
  vitals,
  onHoldingsChanged,
}: {
  tab: Tab;
  data: UnitsListResponse;
  vitals: VitalsNow;
  onHoldingsChanged: () => void;
}) {
  switch (tab) {
    case "list":
      return <UnitList data={data} vitals={vitals} onHoldingsChanged={onHoldingsChanged} />;
    case "parties":
      return <PartiesPanel data={data} />;
    case "presets":
      return <PresetsPanel data={data} />;
    case "managers":
      return <ManagersPanel data={data} />;
    case "auction":
      return <AuctionPanel data={data} />;
    case "prisoners":
      return <PrisonersPanel data={data} />;
    case "fusion":
      return <FusionPanel onChanged={onHoldingsChanged} />;
    default: {
      const unknown: never = tab;
      return unknown;
    }
  }
}
