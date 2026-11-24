// 건물 테크트리 시각화 탭(/dev/buildings [테크트리]) — 어두운 유리 전략 UI(시안 반영):
// 상단 분류 알약·검색·스위치, 중앙 목적별 열 × 티어 행 보드 + 둥근 직각 회로 연결선 + 슬림 세로 레벨 알약 체인,
// 우측 실제 3D 미리보기 상세 패널, 하단 범례 상태 줄. 시설 편집 탭의 담은 변경(stage)을 실시간 반영한다.
import type { BuildingEditorListResponse } from "@terra/shared/buildingEditor";
import { useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { type BuildingStage, formatDuration } from "./buildingModel.ts";
import {
  type MaterialKind,
  TECH_TREE_COLUMN_IDS,
  type TechTreeColumnId,
  type TechTreeEdge,
  type TechTreeLevelNode,
  type TechTreeNode,
  buildOrthogonalPath,
  buildSideExitPath,
  buildTechTree,
  formatStorageKg,
  matchesTechQuery,
  relatedNodesOf,
} from "./buildingTechTree.ts";
import { BuildingIsoThumb, ClockIcon, ColumnIcon, InfoIcon, SearchIcon } from "./TechTreeIcons.tsx";
import { TechTreeInspector } from "./TechTreeInspector.tsx";
import "./buildingTechTree.css";

type Text = () => string;

const COLUMN_TEXT: Readonly<Record<TechTreeColumnId, Text>> = {
  gathering: m.dev_buildings_tree_col_gathering,
  process: m.dev_buildings_tree_col_process,
  manufacture: m.dev_buildings_tree_col_manufacture,
  storage: m.dev_buildings_tree_col_storage,
  housing: m.dev_buildings_tree_col_housing,
  administration: m.dev_buildings_tree_col_administration,
  commerce: m.dev_buildings_tree_col_commerce,
  public: m.dev_buildings_tree_col_public,
  transport: m.dev_buildings_tree_col_transport,
  military: m.dev_buildings_tree_col_military,
};

function tierLabel(tier: number): string {
  if (tier === 0) return m.dev_buildings_tree_tier_0();
  if (tier === 1) return m.dev_buildings_tree_tier_1();
  if (tier === 2) return m.dev_buildings_tree_tier_2();
  return m.dev_buildings_tree_tier_high();
}

function materialKindLabel(kind: MaterialKind): string | null {
  if (kind === "raw") return m.dev_buildings_tree_mat_raw();
  if (kind === "processed") return m.dev_buildings_tree_mat_processed();
  if (kind === "mixed") return m.dev_buildings_tree_mat_mixed();
  return null;
}

/** 슬림 레벨 알약에 넣을 한 줄 요약(모듈 메모 → 재료 전환 → 핵심 수치 증분) */
function levelPillSummary(lv: TechTreeLevelNode, locale: "ko" | "en"): string {
  const firstNote = lv.notes[0]?.[locale];
  if (firstNote) return firstNote;
  if (lv.bandChanged) return m.dev_buildings_tree_band_switch();
  const parts: string[] = [];
  if (lv.storageKg !== null) parts.push(formatStorageKg(lv.storageKg));
  else if (lv.slots > 0) parts.push(m.dev_buildings_tree_stat_slots({ value: lv.slots }));
  if (lv.gatherBonus !== null && lv.gatherBonus > 0) {
    parts.push(m.dev_buildings_tree_stat_gather({ value: lv.gatherBonus }));
  }
  if (parts.length === 0) parts.push(m.dev_buildings_tree_stat_durability({ value: lv.durability }));
  return parts.join(" · ");
}

interface SvgEdgePath {
  readonly edge: TechTreeEdge;
  readonly d: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly label: string | null;
}

/** 건물 카드 + 아래에 바로 붙는 슬림 세로 레벨 알약 체인 */
function TechTreeNodeBlock({
  node,
  locale,
  relation,
  dimmed,
  expanded,
  activeLevel,
  onSelectCard,
  onSelectLevel,
  onToggleExpand,
  registerRef,
}: {
  node: TechTreeNode;
  locale: "ko" | "en";
  relation: "selected" | "upstream" | "downstream" | null;
  dimmed: boolean;
  expanded: boolean;
  activeLevel: number | null;
  onSelectCard: (id: string) => void;
  onSelectLevel: (id: string, level: number) => void;
  onToggleExpand: (id: string) => void;
  registerRef: (id: string, element: HTMLElement | null) => void;
}) {
  const lv1 = node.levels[0];
  const matKind = materialKindLabel(node.lv1MaterialKind);
  const hasChain = node.maxLevel > 1;
  const showChain = hasChain && expanded;

  return (
    <div
      ref={(el) => registerRef(node.id, el)}
      className="btt-node"
      data-node-id={node.id}
      data-col={node.column}
      data-tier={node.tier}
      data-rel={relation ?? undefined}
      data-dim={dimmed ? "" : undefined}
    >
      <article className="btt-card" data-rel={relation ?? undefined}>
        <button
          type="button"
          className="btt-card-main"
          aria-pressed={relation === "selected"}
          onClick={() => onSelectCard(node.id)}
        >
          <span className="btt-card-thumb" data-col={node.column}>
            <BuildingIsoThumb entry={node.entry} column={node.column} />
          </span>
          <span className="btt-card-body">
            <span className="btt-card-top">
              <strong className="btt-card-name">{node.entry.name[locale]}</strong>
              {node.staged ? (
                <span className="btt-dot btt-dot-staged" title={m.dev_buildings_state_staged()} />
              ) : node.edited ? (
                <span className="btt-dot btt-dot-edited" title={m.dev_buildings_origin_edited()} />
              ) : null}
            </span>
            <span className="btt-card-sub">{node.summary[locale]}</span>
            <span className="btt-card-meta">
              {lv1 ? (
                <span className="btt-meta-time">
                  <ClockIcon />
                  {formatDuration(lv1.timeMs)}
                </span>
              ) : null}
              {matKind ? (
                <span className="btt-meta-mat" data-mat-kind={node.lv1MaterialKind}>
                  {matKind}
                </span>
              ) : null}
            </span>
          </span>
        </button>

        {hasChain ? (
          <button
            type="button"
            className="btt-lv-badge-btn"
            aria-expanded={showChain}
            title={showChain ? m.dev_buildings_tree_collapse_all() : m.dev_buildings_tree_expand_all()}
            onClick={() => onToggleExpand(node.id)}
          >
            {m.dev_buildings_tree_levels_toggle({ max: node.maxLevel })}
            <span aria-hidden="true">{showChain ? " ▾" : " ▸"}</span>
          </button>
        ) : (
          <span className="btt-lv-badge-static">Lv1</span>
        )}
      </article>

      {showChain ? (
        <ol className="btt-chain" aria-label={m.dev_buildings_tree_levels_toggle({ max: node.maxLevel })}>
          {node.levels.map((lv) => {
            const isActiveLv = relation === "selected" && activeLevel === lv.level;
            return (
              <li key={lv.level} className="btt-chain-item" data-level={lv.level}>
                <button
                  type="button"
                  className="btt-chain-pill"
                  data-level={lv.level}
                  data-band-changed={lv.bandChanged ? "" : undefined}
                  data-has-note={lv.notes.length > 0 ? "" : undefined}
                  aria-current={isActiveLv ? "true" : undefined}
                  onClick={() => onSelectLevel(node.id, lv.level)}
                >
                  <span className="btt-chain-lv">
                    {m.dev_buildings_tree_level_badge({ level: lv.level })}
                  </span>
                  <span className="btt-chain-text">{levelPillSummary(lv, locale)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

export function BuildingTechTree({
  list,
  stage,
  locale,
  selectedId,
  onSelectId,
  onOpenEdit,
}: {
  list: BuildingEditorListResponse;
  stage: BuildingStage;
  locale: "ko" | "en";
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  onOpenEdit: (id: string) => void;
}) {
  const [showMaterialEdges, setShowMaterialEdges] = useState(true);
  const [visibleCols, setVisibleCols] = useState<ReadonlySet<TechTreeColumnId>>(
    () => new Set(TECH_TREE_COLUMN_IDS),
  );
  // 기본 전체 펼침(사용자 결정 A4). 접은 건물 ID만 집합에 기록한다
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [searchText, setSearchText] = useState("");
  const deferredSearch = useDeferredValue(searchText);
  const [inspectorLevel, setInspectorLevel] = useState(1);

  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });
  const [svgPaths, setSvgPaths] = useState<readonly SvgEdgePath[]>([]);

  const graph = useMemo(
    () => buildTechTree(list, stage, { includeMaterialEdges: showMaterialEdges }),
    [list, stage, showMaterialEdges],
  );

  const itemNames = useMemo(
    () => new Map(list.items.map((item) => [item.id, item.name[locale]])),
    [list.items, locale],
  );
  const facilityNames = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.entry.name[locale]])),
    [graph.nodes, locale],
  );

  const colCounts = useMemo(() => {
    const counts = new Map<TechTreeColumnId, number>();
    for (const col of TECH_TREE_COLUMN_IDS) counts.set(col, 0);
    for (const node of graph.nodes) counts.set(node.column, (counts.get(node.column) ?? 0) + 1);
    return counts;
  }, [graph.nodes]);

  const activeColumns = useMemo(
    () => TECH_TREE_COLUMN_IDS.filter((col) => visibleCols.has(col)),
    [visibleCols],
  );

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const node of graph.nodes) {
      if (visibleCols.has(node.column)) ids.add(node.id);
    }
    return ids;
  }, [graph.nodes, visibleCols]);

  const matchingIds = useMemo(() => {
    const q = deferredSearch.trim();
    if (q === "") return null;
    const set = new Set<string>();
    for (const node of graph.nodes) {
      if (matchesTechQuery(node, q, itemNames, locale)) set.add(node.id);
    }
    return set;
  }, [graph.nodes, deferredSearch, itemNames, locale]);

  const activeEdges = useMemo(
    () =>
      graph.edges.filter(
        (edge) =>
          (edge.kind === "explicit" || showMaterialEdges) &&
          visibleNodeIds.has(edge.from) &&
          visibleNodeIds.has(edge.to),
      ),
    [graph.edges, showMaterialEdges, visibleNodeIds],
  );

  const focusedId = selectedId && graph.byId.has(selectedId) ? selectedId : null;
  const related = useMemo(
    () => relatedNodesOf(focusedId, graph.edges, showMaterialEdges),
    [focusedId, graph.edges, showMaterialEdges],
  );

  // 우측 상세 패널은 선택된 건물을 보이고, 선택 전에도 대표 건물(중앙창고 → 첫 건물)을 미리 띄워 빈 벽을 없앤다
  const inspectorNode =
    (focusedId ? graph.byId.get(focusedId) : null) ??
    graph.byId.get("warehouse") ??
    graph.byId.get("government_hall") ??
    graph.nodes[0] ??
    null;

  const clampedLevel = inspectorNode ? Math.max(1, Math.min(inspectorLevel, inspectorNode.maxLevel)) : 1;

  const directUnlocks = useMemo(() => {
    if (!inspectorNode) return [];
    const ids = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.from !== inspectorNode.id) continue;
      if (edge.kind === "material" && !showMaterialEdges) continue;
      ids.add(edge.to);
    }
    return [...ids];
  }, [inspectorNode, graph.edges, showMaterialEdges]);

  const expandableIds = useMemo(
    () => graph.nodes.filter((node) => node.maxLevel > 1).map((node) => node.id),
    [graph.nodes],
  );
  const levelsShown = expandableIds.some((id) => !collapsed.has(id));
  const toggleAllLevels = (): void => {
    if (levelsShown) setCollapsed(new Set(expandableIds));
    else setCollapsed(new Set());
  };
  const toggleOneLevel = (id: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleColumn = (col: TechTreeColumnId): void => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(col)) {
        if (next.size > 1) next.delete(col);
      } else {
        next.add(col);
      }
      return next;
    });
  };
  const resetColumns = (): void => setVisibleCols(new Set(TECH_TREE_COLUMN_IDS));

  const onSelectCard = (id: string): void => {
    if (focusedId === id) {
      onSelectId(null);
      return;
    }
    onSelectId(id);
    setInspectorLevel(1);
  };
  const onSelectLevel = (id: string, level: number): void => {
    onSelectId(id);
    setInspectorLevel(level);
  };
  const onJumpNode = (id: string): void => {
    const target = graph.byId.get(id);
    if (target && !visibleCols.has(target.column)) {
      setVisibleCols((prev) => new Set([...prev, target.column]));
    }
    onSelectId(id);
    setInspectorLevel(1);
  };

  const registerRef = useCallback((id: string, element: HTMLElement | null): void => {
    if (element) nodeRefs.current.set(id, element);
    else nodeRefs.current.delete(id);
  }, []);

  // 카드·레벨 알약의 실제 DOM 좌표를 읽어 둥근 직각 회로선(SVG)을 계산한다
  const measureEdges = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const base = canvas.getBoundingClientRect();
    const width = Math.ceil(canvas.scrollWidth);
    const height = Math.ceil(canvas.scrollHeight);
    setSvgSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));

    const outGroups = new Map<string, string[]>();
    const inGroups = new Map<string, string[]>();
    for (const edge of activeEdges) {
      const og = outGroups.get(edge.from) ?? [];
      og.push(edge.id);
      outGroups.set(edge.from, og);
      const ig = inGroups.get(edge.to) ?? [];
      ig.push(edge.id);
      inGroups.set(edge.to, ig);
    }

    const nextPaths: SvgEdgePath[] = [];
    activeEdges.forEach((edge, edgeIdx) => {
      const fromWrap = nodeRefs.current.get(edge.from);
      const toWrap = nodeRefs.current.get(edge.to);
      if (!fromWrap || !toWrap) return;
      const toCard = toWrap.querySelector<HTMLElement>(".btt-card") ?? toWrap;

      const fr = fromWrap.getBoundingClientRect();
      const tr = toCard.getBoundingClientRect();

      const levelPill =
        !collapsed.has(edge.from) && edge.kind === "explicit" && edge.minLevel !== undefined
          ? fromWrap.querySelector<HTMLElement>(`.btt-chain-pill[data-level="${edge.minLevel}"]`)
          : null;

      const og = outGroups.get(edge.from) ?? [edge.id];
      const ig = inGroups.get(edge.to) ?? [edge.id];
      const outIdx = og.indexOf(edge.id);
      const inIdx = ig.indexOf(edge.id);
      const outOffset = og.length > 1 ? (outIdx - (og.length - 1) / 2) * 14 : 0;
      const inOffset = ig.length > 1 ? (inIdx - (ig.length - 1) / 2) * 14 : 0;

      const x2 = tr.left - base.left + tr.width / 2 + inOffset;
      const y2 = tr.top - base.top;

      let d: string;
      let labelX: number;
      let labelY: number;

      if (levelPill && Math.abs(tr.left - fr.left) > 40) {
        // 다른 열의 하위 건물이 Lv1/Lv2/Lv3 조건이면 해당 레벨 알약 옆면에서 둥근 직각으로 뻗는다
        const lr = levelPill.getBoundingClientRect();
        const goRight = tr.left + tr.width / 2 >= fr.left + fr.width / 2;
        const x1 = (goRight ? lr.right : lr.left) - base.left;
        const y1 = lr.top - base.top + lr.height / 2;
        const stub = 18 + (outIdx % 3) * 10;
        d = buildSideExitPath(x1, y1, x2, y2, stub, 10);
        labelX = goRight ? x1 + stub + 12 : x1 - stub - 12;
        labelY = y1 - 6;
      } else {
        const x1 = fr.left - base.left + fr.width / 2 + outOffset;
        const y1 = fr.bottom - base.top;
        const gap = y2 - y1;
        // 수평 버스가 겹치지 않도록 엣지마다 높이를 미세하게 분산한다
        const lane = ((edgeIdx % 5) - 2) * 7;
        const midY = gap > 24 ? y1 + gap * 0.5 + lane : y1 + 14 + lane;
        d = buildOrthogonalPath(x1, y1, x2, y2, midY, 10);
        labelX = Math.abs(x2 - x1) < 2 ? x1 : (x1 + x2) / 2;
        labelY = Math.abs(x2 - x1) < 2 ? (y1 + y2) / 2 : midY;
      }

      const label =
        edge.kind === "material" && edge.items && edge.items.length > 0
          ? edge.items.map((id) => itemNames.get(id) ?? id).join("·")
          : edge.kind === "explicit" && edge.minLevel && edge.minLevel > 1
            ? `Lv${edge.minLevel}`
            : null;

      nextPaths.push({ edge, d, labelX, labelY, label });
    });

    setSvgPaths(nextPaths);
  }, [activeEdges, collapsed, itemNames]);

  useLayoutEffect(() => {
    measureEdges();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measureEdges());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [measureEdges]);

  const explicitCount = activeEdges.filter((edge) => edge.kind === "explicit").length;
  const materialCount = activeEdges.filter((edge) => edge.kind === "material").length;
  const allColsActive = visibleCols.size === TECH_TREE_COLUMN_IDS.length;
  const maxTier = graph.tiers.at(-1)?.tier ?? 0;

  return (
    <section className="btt-shell" aria-label={m.dev_buildings_tree_canvas_label()}>
      {/* ── 상단 필터 알약 + 검색 + 토글 스위치 ── */}
      <div className="btt-topbar">
        <div className="btt-pills" role="group" aria-label={m.dev_buildings_tree_cols_label()}>
          <button
            type="button"
            className="btt-pill btt-pill-all"
            aria-pressed={allColsActive}
            onClick={resetColumns}
          >
            <ColumnIcon col="all" />
            <span>
              {m.dev_buildings_tree_cols_all()} ({graph.nodes.length})
            </span>
          </button>
          {TECH_TREE_COLUMN_IDS.map((col) => (
            <button
              key={col}
              type="button"
              className="btt-pill"
              data-col={col}
              aria-pressed={!allColsActive && visibleCols.has(col)}
              data-on={visibleCols.has(col) ? "" : undefined}
              onClick={() => toggleColumn(col)}
            >
              <ColumnIcon col={col} />
              <span>
                {COLUMN_TEXT[col]()} ({colCounts.get(col) ?? 0})
              </span>
            </button>
          ))}
        </div>

        <div className="btt-topbar-right">
          <label className="btt-search">
            <SearchIcon />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={m.dev_buildings_tree_search_placeholder()}
              aria-label={m.dev_buildings_tree_search_placeholder()}
            />
          </label>
          <button
            type="button"
            className="btt-switch"
            data-tone="material"
            aria-pressed={showMaterialEdges}
            onClick={() => setShowMaterialEdges((prev) => !prev)}
          >
            <span className="btt-switch-track" aria-hidden="true">
              <span className="btt-switch-thumb" />
            </span>
            <span>{m.dev_buildings_tree_toggle_material()}</span>
          </button>
          <button
            type="button"
            className="btt-switch"
            data-tone="levels"
            aria-pressed={levelsShown}
            onClick={toggleAllLevels}
          >
            <span className="btt-switch-track" aria-hidden="true">
              <span className="btt-switch-thumb" />
            </span>
            <span>{m.dev_buildings_tree_toggle_levels()}</span>
          </button>
        </div>
      </div>

      {/* ── 메인 2단 작업영역: 왼쪽 테크트리 보드 + 오른쪽 3D 상세 패널 ── */}
      <div className="btt-workspace">
        <div className="btt-board-frame">
          <div className="btt-viewport">
            <div className="btt-canvas" ref={canvasRef}>
              <svg
                className="btt-svg"
                width={svgSize.width}
                height={svgSize.height}
                viewBox={`0 0 ${Math.max(1, svgSize.width)} ${Math.max(1, svgSize.height)}`}
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="btt-arrow-explicit"
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.2 L 10 5 L 0 8.8 z" className="btt-marker-explicit" />
                  </marker>
                  <marker
                    id="btt-arrow-active"
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.2 L 10 5 L 0 8.8 z" className="btt-marker-active" />
                  </marker>
                  <marker
                    id="btt-arrow-material"
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.2 L 10 5 L 0 8.8 z" className="btt-marker-material" />
                  </marker>
                </defs>
                {svgPaths.map(({ edge, d, labelX, labelY, label }) => {
                  const isActive = focusedId !== null && related.activeEdgeIds.has(edge.id);
                  const isDim = focusedId !== null && !isActive;
                  const markerEnd = isActive
                    ? "url(#btt-arrow-active)"
                    : edge.kind === "explicit"
                      ? "url(#btt-arrow-explicit)"
                      : "url(#btt-arrow-material)";
                  const showLabel = label !== null && (edge.kind === "material" || isActive);
                  return (
                    <g
                      key={edge.id}
                      className="btt-edge"
                      data-kind={edge.kind}
                      data-active={isActive ? "" : undefined}
                      data-dim={isDim ? "" : undefined}
                    >
                      <path d={d} className="btt-edge-path" markerEnd={markerEnd} />
                      {showLabel ? (
                        <g
                          className="btt-edge-tag"
                          transform={`translate(${labelX.toFixed(1)}, ${labelY.toFixed(1)})`}
                        >
                          <rect x="-22" y="-9" width="44" height="18" rx="9" className="btt-edge-tag-bg" />
                          <text x="0" y="3.5" className="btt-edge-tag-text" textAnchor="middle">
                            {label}
                          </text>
                        </g>
                      ) : null}
                    </g>
                  );
                })}
              </svg>

              <div
                className="btt-grid"
                style={{
                  gridTemplateColumns: `5.5rem repeat(${activeColumns.length}, minmax(15.25rem, 1fr))`,
                }}
              >
                <div className="btt-corner">{m.dev_buildings_tree_corner()}</div>
                {activeColumns.map((col) => (
                  <div key={col} className="btt-col-head" data-col={col}>
                    <span className="btt-col-title">{COLUMN_TEXT[col]()}</span>
                  </div>
                ))}

                {graph.tiers.map((tierRow) => (
                  <div key={`tier-${tierRow.tier}`} className="btt-tier-group">
                    <div className="btt-tier-rail" data-tier={tierRow.tier}>
                      <span className="btt-tier-code">
                        {m.dev_buildings_tree_tier_code({ tier: tierRow.tier })}
                      </span>
                      <span className="btt-tier-desc">{tierLabel(tierRow.tier)}</span>
                    </div>
                    {activeColumns.map((col) => {
                      const cellNodes = tierRow.cells[col];
                      return (
                        <div
                          key={`cell-${tierRow.tier}-${col}`}
                          className="btt-cell"
                          data-tier={tierRow.tier}
                          data-col={col}
                        >
                          {cellNodes.map((node) => {
                            const relation =
                              focusedId === node.id
                                ? "selected"
                                : related.upstream.has(node.id)
                                  ? "upstream"
                                  : related.downstream.has(node.id)
                                    ? "downstream"
                                    : null;
                            const dimmedBySelect = focusedId !== null && relation === null;
                            const dimmedBySearch = matchingIds !== null && !matchingIds.has(node.id);
                            return (
                              <TechTreeNodeBlock
                                key={node.id}
                                node={node}
                                locale={locale}
                                relation={relation}
                                dimmed={dimmedBySelect || dimmedBySearch}
                                expanded={!collapsed.has(node.id)}
                                activeLevel={focusedId === node.id ? clampedLevel : null}
                                onSelectCard={onSelectCard}
                                onSelectLevel={onSelectLevel}
                                onToggleExpand={toggleOneLevel}
                                registerRef={registerRef}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <TechTreeInspector
          node={inspectorNode}
          level={clampedLevel}
          onLevel={setInspectorLevel}
          locale={locale}
          columnLabel={(col) => COLUMN_TEXT[col]()}
          itemNames={itemNames}
          facilityNames={facilityNames}
          directUnlocks={directUnlocks}
          showMaterialEdges={showMaterialEdges}
          onSelectId={onJumpNode}
          onOpenEdit={onOpenEdit}
        />
      </div>

      {/* ── 하단 범례 & 상태 막대 ── */}
      <footer className="btt-footer">
        <div className="btt-footer-left">
          <span className="btt-legend-item">
            <span className="btt-swatch btt-swatch-explicit" aria-hidden="true" />
            {m.dev_buildings_tree_legend_explicit()}
          </span>
          <span className="btt-legend-item">
            <span className="btt-swatch btt-swatch-material" aria-hidden="true" />
            {m.dev_buildings_tree_legend_material()}
          </span>
          <span className="btt-footer-sep" aria-hidden="true">
            |
          </span>
          <span className="btt-footer-stat">
            {m.dev_buildings_tree_summary_total({ count: graph.nodes.length, maxTier })}
          </span>
          <span className="btt-footer-stat">
            {m.dev_buildings_tree_edges_count({ explicit: explicitCount, material: materialCount })}
          </span>
          <span className="dev-badge btt-draft-badge" title={m.dev_buildings_tree_draft_hint()}>
            {m.dev_buildings_tree_draft_badge()}
          </span>
        </div>
        <div className="btt-footer-right">
          {focusedId ? (
            <button type="button" className="btt-clear-btn" onClick={() => onSelectId(null)}>
              {m.dev_buildings_tree_clear_selection()}
            </button>
          ) : (
            <span className="btt-footer-tip">
              <InfoIcon />
              {m.dev_buildings_tree_footer_hint()}
            </span>
          )}
        </div>
      </footer>
    </section>
  );
}
