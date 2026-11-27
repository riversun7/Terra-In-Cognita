// 경제 흐름 모식도 화면(/dev/economy-flow) — 보기 전용 개발자 도구.
// 조각 이름 EconomyFlowScreen-*([Ee]conomyFlow, 미리 캐시 제외).
// - 8대 경제 주체의 거시 흐름 SVG 모식도, 주체별 손익 수식 카드(매출 − 비용 = 수익 − 세금 → 배당), 전체 기본값 검색 표를 한 화면에 둔다.
// - 서버가 열려 있으면 api.tuning.list로 현재 라이브 덮어쓰기 값을 읽어 기본값 옆에 나란히 보인다(실패해도 기본값 화면은 그대로 열린다).
import { useEffect, useMemo, useState } from "react";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { BackButton } from "../../shell/BackButton.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { EconomyFlowDiagram } from "./EconomyFlowDiagram.tsx";
import {
  type ActorId,
  ECONOMY_ACTORS,
  ECONOMY_FLOW_EDGES,
  type EconomyActor,
  type EconomyLineItem,
  FLOW_CATEGORIES,
  type FlowCategory,
  type ImplStatus,
  flattenEconomyItems,
  formatEconomyValue,
} from "./economyFlowData.ts";
import "./economyFlow.css";

interface LiveTuningMap {
  readonly loaded: boolean;
  /** tuningId → { effective, pack, overridden } */
  readonly byId: ReadonlyMap<
    string,
    { readonly effective: number; readonly pack: number; readonly overridden: boolean }
  >;
}

const EMPTY_LIVE: LiveTuningMap = { loaded: false, byId: new Map() };

const CATEGORY_LABELS: Readonly<Record<FlowCategory | "all", () => string>> = {
  all: m.dev_econ_flow_filter_all,
  tax: m.dev_econ_flow_filter_tax,
  labor: m.dev_econ_flow_filter_labor,
  trade: m.dev_econ_flow_filter_trade,
  consume: m.dev_econ_flow_filter_consume,
  invest: m.dev_econ_flow_filter_invest,
  monetary: m.dev_econ_flow_filter_monetary,
};

const STATUS_LABELS: Readonly<Record<ImplStatus, () => string>> = {
  live: m.dev_econ_flow_status_live,
  partial: m.dev_econ_flow_status_partial,
  planned: m.dev_econ_flow_status_planned,
};

function categoryLabel(cat: FlowCategory | "all"): string {
  return CATEGORY_LABELS[cat]();
}

function statusLabel(status: ImplStatus): string {
  return STATUS_LABELS[status]();
}

function liveOverrideOf(
  item: EconomyLineItem,
  live: LiveTuningMap,
  ko: boolean,
): { readonly text: string; readonly overridden: boolean } | null {
  if (!item.tuningId || !live.loaded) return null;
  const found = live.byId.get(item.tuningId);
  if (!found) return null;
  return {
    text: formatEconomyValue(found.effective, item.unit, ko),
    overridden: found.overridden,
  };
}

function ActorEquationCard({
  actor,
  ko,
  selected,
  live,
  activeCategory,
  onSelect,
}: {
  readonly actor: EconomyActor;
  readonly ko: boolean;
  readonly selected: boolean;
  readonly live: LiveTuningMap;
  readonly activeCategory: FlowCategory | "all";
  readonly onSelect: (id: ActorId) => void;
}) {
  const visibleItems =
    activeCategory === "all" ? actor.items : actor.items.filter((item) => item.category === activeCategory);
  const itemsToShow = visibleItems.length > 0 ? visibleItems : actor.items;

  return (
    <article
      id={`econ-actor-${actor.id}`}
      className={`econ-card econ-cat-${actor.accent}${selected ? " is-selected" : ""}${actor.status === "planned" ? " is-planned" : ""}`}
    >
      <div className="econ-card-head">
        <div>
          <h3 className="econ-card-title">
            <button
              type="button"
              className="btn-link"
              style={{
                all: "unset",
                cursor: "pointer",
              }}
              onClick={() => onSelect(actor.id)}
            >
              {ko ? actor.titleKo : actor.titleEn}
            </button>
          </h3>
          <p className="econ-card-sub">{ko ? actor.subtitleKo : actor.subtitleEn}</p>
        </div>
        <span className={`econ-status-badge is-${actor.status}`}>{statusLabel(actor.status)}</span>
      </div>

      {/* 손익 등식 마디 (매출 − 비용 = 수익 − 세금 → 정산) */}
      <div className="econ-eq-strip">
        {actor.equation.map((step, index) => (
          <div key={`${actor.id}-eq-${index}`} className={`econ-eq-step sign-${step.sign}`}>
            <span className="econ-eq-label">{ko ? step.labelKo : step.labelEn}</span>
            <span className="econ-eq-detail">{ko ? step.detailKo : step.detailEn}</span>
          </div>
        ))}
      </div>

      {/* 세부 항목과 기본값 */}
      <ul className="econ-item-list">
        {itemsToShow.map((item) => {
          const liveInfo = liveOverrideOf(item, live, ko);
          return (
            <li key={item.id} className="econ-item-row">
              <div className="econ-item-top">
                <span className="econ-item-name">{ko ? item.nameKo : item.nameEn}</span>
                {item.status !== actor.status ? (
                  <span className={`econ-status-badge is-${item.status}`}>{statusLabel(item.status)}</span>
                ) : null}
              </div>
              <span className="econ-item-flow">{ko ? item.flowKo : item.flowEn}</span>
              <div className="econ-item-values">
                <span className="econ-item-default">
                  {m.dev_econ_flow_default_val()}: {ko ? item.defaultKo : item.defaultEn}
                </span>
                {liveInfo?.overridden ? (
                  <span className="econ-item-override">
                    {m.dev_econ_flow_overridden()}: {liveInfo.text}
                  </span>
                ) : null}
                {item.tuningId ? (
                  <span className="econ-item-key">{item.tuningId}</span>
                ) : item.sourceLabel ? (
                  <span className="econ-item-key">{item.sourceLabel}</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

export default function EconomyFlowScreen() {
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const ko = getLocale() !== "en";
  const [selectedActor, setSelectedActor] = useState<ActorId | null>(null);
  const [activeCategory, setActiveCategory] = useState<FlowCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [live, setLive] = useState<LiveTuningMap>(EMPTY_LIVE);

  useEffect(() => {
    let alive = true;
    api.tuning.list
      .query()
      .then((res) => {
        if (!alive) return;
        const map = new Map<
          string,
          { readonly effective: number; readonly pack: number; readonly overridden: boolean }
        >();
        for (const entry of res.entries) {
          map.set(entry.id, {
            effective: entry.value,
            pack: entry.packValue,
            overridden: entry.override !== null && entry.value !== entry.packValue,
          });
        }
        setLive({ loaded: true, byId: map });
      })
      .catch(() => {
        // 비로그인·오프라인·권한 없음이어도 팩·코드 기본값 모식도는 그대로 보여 준다
      });
    return () => {
      alive = false;
    };
  }, []);

  const allRows = useMemo(() => flattenEconomyItems(), []);

  const overrideCount = useMemo(() => {
    if (!live.loaded) return 0;
    let count = 0;
    for (const row of allRows) {
      if (row.item.tuningId && live.byId.get(row.item.tuningId)?.overridden) count += 1;
    }
    return count;
  }, [allRows, live]);

  const selectedObj = useMemo(
    () => (selectedActor ? (ECONOMY_ACTORS.find((a) => a.id === selectedActor) ?? null) : null),
    [selectedActor],
  );

  const selectedFlows = useMemo(() => {
    if (!selectedActor) return null;
    const incoming = ECONOMY_FLOW_EDGES.filter(
      (e) => e.to === selectedActor && (activeCategory === "all" || e.category === activeCategory),
    );
    const outgoing = ECONOMY_FLOW_EDGES.filter(
      (e) => e.from === selectedActor && (activeCategory === "all" || e.category === activeCategory),
    );
    return { incoming, outgoing };
  }, [selectedActor, activeCategory]);

  const actorTitleById = useMemo(
    () => new Map(ECONOMY_ACTORS.map((a) => [a.id, ko ? a.titleKo : a.titleEn])),
    [ko],
  );

  const filteredTableRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((row) => {
      if (selectedActor !== null && row.actorId !== selectedActor) return false;
      if (activeCategory !== "all" && row.item.category !== activeCategory) return false;
      if (!q) return true;
      const haystack = [
        row.actorTitleKo,
        row.actorTitleEn,
        row.item.nameKo,
        row.item.nameEn,
        row.item.flowKo,
        row.item.flowEn,
        row.item.defaultKo,
        row.item.defaultEn,
        row.item.tuningId ?? "",
        row.item.sourceLabel ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allRows, selectedActor, activeCategory, query]);

  return (
    <section className="screen econ-flow-screen" aria-labelledby="dev-econ-flow-title">
      <div className="screen-header">
        <h1 id="dev-econ-flow-title" ref={headingRef} className="screen-title" tabIndex={-1}>
          {m.shell_route_dev_economy_flow()}
        </h1>
        <div className="econ-flow-header-actions">
          <AppLink to={{ route: "dev_tuning" }} className="econ-flow-tuning-link">
            {m.dev_econ_flow_open_tuning()}
          </AppLink>
          <BackButton />
        </div>
      </div>

      <div className="econ-flow-lead-row">
        <p className="econ-flow-lead">{m.dev_econ_flow_lead()}</p>
        <span className={`econ-flow-sync-pill${live.loaded ? " is-synced" : ""}`}>
          {live.loaded
            ? m.dev_econ_flow_live_synced({ count: String(overrideCount) })
            : m.dev_econ_flow_live_default()}
        </span>
      </div>

      {/* 상단 요약 KPI */}
      <div className="econ-flow-kpis">
        <div className="econ-flow-kpi">
          <span className="econ-flow-kpi-label">{m.dev_econ_flow_kpi_actors()}</span>
          <span className="econ-flow-kpi-value is-accent">{ECONOMY_ACTORS.length}</span>
        </div>
        <div className="econ-flow-kpi">
          <span className="econ-flow-kpi-label">{m.dev_econ_flow_kpi_edges()}</span>
          <span className="econ-flow-kpi-value">{ECONOMY_FLOW_EDGES.length}</span>
        </div>
        <div className="econ-flow-kpi">
          <span className="econ-flow-kpi-label">{m.dev_econ_flow_kpi_defaults()}</span>
          <span className="econ-flow-kpi-value">{allRows.length}</span>
        </div>
        <div className="econ-flow-kpi">
          <span className="econ-flow-kpi-label">{m.dev_econ_flow_kpi_overrides()}</span>
          <span className={`econ-flow-kpi-value${overrideCount > 0 ? " is-warn" : ""}`}>{overrideCount}</span>
        </div>
      </div>

      {/* 1. 거시 경제 흐름 모식도 */}
      <section className="econ-flow-panel" aria-labelledby="econ-diagram-heading">
        <div className="econ-flow-panel-head">
          <div>
            <h2 id="econ-diagram-heading" className="econ-flow-panel-title">
              {m.dev_econ_flow_diagram_title()}
            </h2>
            <p className="econ-flow-panel-hint">{m.dev_econ_flow_diagram_hint()}</p>
          </div>
          <div className="econ-flow-filters" role="group" aria-label={m.dev_econ_flow_diagram_title()}>
            <button
              type="button"
              className={`econ-flow-chip${activeCategory === "all" ? " is-active" : ""}`}
              onClick={() => setActiveCategory("all")}
            >
              {categoryLabel("all")}
            </button>
            {FLOW_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`econ-flow-chip${activeCategory === cat ? " is-active" : ""}`}
                onClick={() => setActiveCategory(activeCategory === cat ? "all" : cat)}
              >
                <span className={`econ-flow-dot econ-cat-${cat}`} aria-hidden="true" />
                {categoryLabel(cat)}
              </button>
            ))}
            {selectedActor !== null ? (
              <button type="button" className="econ-flow-chip" onClick={() => setSelectedActor(null)}>
                {m.dev_econ_flow_clear_select()}
              </button>
            ) : null}
          </div>
        </div>

        <EconomyFlowDiagram
          ko={ko}
          selectedActor={selectedActor}
          activeCategory={activeCategory}
          onSelectActor={setSelectedActor}
        />

        {selectedObj && selectedFlows ? (
          <div className="econ-selected-bar">
            <div className="econ-selected-head">
              <span className="econ-selected-name">
                {m.dev_econ_flow_selected_label()}: {ko ? selectedObj.titleKo : selectedObj.titleEn}
              </span>
              <button type="button" className="econ-flow-chip" onClick={() => setSelectedActor(null)}>
                {m.dev_econ_flow_clear_select()}
              </button>
            </div>
            <div className="econ-selected-col">
              <h4>
                {m.dev_econ_flow_incoming()} ({selectedFlows.incoming.length})
              </h4>
              <ul className="econ-selected-list">
                {selectedFlows.incoming.map((e) => (
                  <li key={e.id}>
                    <span>
                      {actorTitleById.get(e.from)} → {ko ? e.labelKo : e.labelEn}
                    </span>
                    <span className="econ-selected-tag">{ko ? e.defaultTagKo : e.defaultTagEn}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="econ-selected-col">
              <h4>
                {m.dev_econ_flow_outgoing()} ({selectedFlows.outgoing.length})
              </h4>
              <ul className="econ-selected-list">
                {selectedFlows.outgoing.map((e) => (
                  <li key={e.id}>
                    <span>
                      {ko ? e.labelKo : e.labelEn} → {actorTitleById.get(e.to)}
                    </span>
                    <span className="econ-selected-tag">{ko ? e.defaultTagKo : e.defaultTagEn}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </section>

      {/* 2. 주체별 손익 구조 & 기본값 카드 */}
      <section className="econ-flow-panel" aria-labelledby="econ-equations-heading">
        <div className="econ-flow-panel-head">
          <div>
            <h2 id="econ-equations-heading" className="econ-flow-panel-title">
              {m.dev_econ_flow_equations_title()}
            </h2>
            <p className="econ-flow-panel-hint">{m.dev_econ_flow_equations_hint()}</p>
          </div>
        </div>
        <div className="econ-cards">
          {ECONOMY_ACTORS.filter((actor) => selectedActor === null || actor.id === selectedActor).map(
            (actor) => (
              <ActorEquationCard
                key={actor.id}
                actor={actor}
                ko={ko}
                selected={selectedActor === actor.id}
                live={live}
                activeCategory={activeCategory}
                onSelect={(id) => setSelectedActor(selectedActor === id ? null : id)}
              />
            ),
          )}
        </div>
      </section>

      {/* 3. 전체 경제 기본값 일람 표 */}
      <section className="econ-flow-panel" aria-labelledby="econ-table-heading">
        <div className="econ-table-toolbar">
          <div>
            <h2 id="econ-table-heading" className="econ-flow-panel-title">
              {m.dev_econ_flow_table_title()} ({filteredTableRows.length})
            </h2>
            <p className="econ-unit-note">{m.dev_econ_flow_unit_note()}</p>
          </div>
          <input
            type="search"
            className="econ-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={m.dev_econ_flow_table_search()}
            aria-label={m.dev_econ_flow_table_search()}
          />
        </div>

        {filteredTableRows.length === 0 ? (
          <p className="econ-table-empty">{m.dev_econ_flow_table_empty()}</p>
        ) : (
          <div className="econ-table-wrap">
            <table className="econ-table">
              <thead>
                <tr>
                  <th>{m.dev_econ_flow_col_actor()}</th>
                  <th>{m.dev_econ_flow_col_item()}</th>
                  <th>{m.dev_econ_flow_col_flow()}</th>
                  <th>{m.dev_econ_flow_col_default()}</th>
                  <th>{m.dev_econ_flow_col_live()}</th>
                  <th>{m.dev_econ_flow_col_key()}</th>
                  <th>{m.dev_econ_flow_col_status()}</th>
                </tr>
              </thead>
              <tbody>
                {filteredTableRows.map(({ actorId, actorTitleKo, actorTitleEn, item }) => {
                  const liveInfo = liveOverrideOf(item, live, ko);
                  return (
                    <tr key={`${actorId}-${item.id}`}>
                      <td>{ko ? actorTitleKo : actorTitleEn}</td>
                      <td>{ko ? item.nameKo : item.nameEn}</td>
                      <td>{ko ? item.flowKo : item.flowEn}</td>
                      <td className="econ-table-mono">{ko ? item.defaultKo : item.defaultEn}</td>
                      <td className="econ-table-mono">
                        {liveInfo ? (
                          liveInfo.overridden ? (
                            <span className="econ-item-override">{liveInfo.text}</span>
                          ) : (
                            liveInfo.text
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="econ-table-mono">{item.tuningId ?? item.sourceLabel ?? "—"}</td>
                      <td>
                        <span className={`econ-status-badge is-${item.status}`}>
                          {statusLabel(item.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
