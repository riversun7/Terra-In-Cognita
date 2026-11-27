// 전체 경제 흐름 SVG 모식도 — 주체 박스(8개)와 돈 흐름 화살표(20개)를 그린다.
// - 주체 박스를 누르면 해당 주체와 직접 이어진 화살표·상대 노드만 선명하게 강조한다.
// - 카테고리 필터(세금·임금·거래·소비·배당·발행/소각)로 원하는 돈 흐름만 추려 볼 수 있다.
import { m } from "../../paraglide/messages.js";
import {
  type ActorId,
  DIAGRAM_VIEWBOX,
  ECONOMY_ACTORS,
  ECONOMY_FLOW_EDGES,
  type EconomyActor,
  type EconomyFlowEdge,
  type FlowCategory,
} from "./economyFlowData.ts";

interface Point {
  readonly x: number;
  readonly y: number;
}

const ACTOR_BY_ID: ReadonlyMap<ActorId, EconomyActor> = new Map(ECONOMY_ACTORS.map((a) => [a.id, a]));

/** 사각형 중심에서 목표점 방향의 테두리 교점(약간 바깥 여유 pad) */
function rectAnchor(actor: EconomyActor, target: Point, pad = 4): Point {
  const cx = actor.x + actor.w / 2;
  const cy = actor.y + actor.h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = actor.w / 2 + pad;
  const hh = actor.h / 2 + pad;
  const tx = dx !== 0 ? hw / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const scale = Math.min(tx, ty);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

interface EdgeGeometry {
  readonly d: string;
  readonly labelX: number;
  readonly labelY: number;
}

/** 두 주체 사이 이차 베지어 곡선 경로와 라벨 중심 좌표 */
function edgeGeometry(edge: EconomyFlowEdge): EdgeGeometry {
  const from = ACTOR_BY_ID.get(edge.from);
  const to = ACTOR_BY_ID.get(edge.to);
  if (!from || !to) return { d: "", labelX: 0, labelY: 0 };
  const c1: Point = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const c2: Point = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const mx = (c1.x + c2.x) / 2;
  const my = (c1.y + c2.y) / 2;
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const len = Math.hypot(dx, dy) || 1;
  // 방향 벡터의 왼쪽 법선으로 bend만큼 휘어 양방향 화살표를 분리한다
  const nx = -dy / len;
  const ny = dx / len;
  const ctrl: Point = { x: mx + nx * edge.bend, y: my + ny * edge.bend };
  const start = rectAnchor(from, ctrl, 3);
  const end = rectAnchor(to, ctrl, 7);
  const t = edge.labelT ?? 0.5;
  const omt = 1 - t;
  const labelX = omt * omt * start.x + 2 * omt * t * ctrl.x + t * t * end.x;
  const labelY = omt * omt * start.y + 2 * omt * t * ctrl.y + t * t * end.y;
  return {
    d: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
    labelX,
    labelY,
  };
}

/** 긴 글자를 박스 너비에 맞게 말줄임 */
function clipText(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

const MARKER_CATS: readonly { readonly id: FlowCategory; readonly colorVar: string }[] = [
  { id: "tax", colorVar: "var(--color-warning)" },
  { id: "labor", colorVar: "var(--color-success)" },
  { id: "trade", colorVar: "var(--color-stat-int)" },
  { id: "consume", colorVar: "var(--color-stat-vit)" },
  { id: "invest", colorVar: "var(--color-primary)" },
  { id: "monetary", colorVar: "var(--color-danger)" },
];

export interface EconomyFlowDiagramProps {
  readonly ko: boolean;
  readonly selectedActor: ActorId | null;
  readonly activeCategory: FlowCategory | "all";
  readonly onSelectActor: (id: ActorId | null) => void;
}

export function EconomyFlowDiagram({
  ko,
  selectedActor,
  activeCategory,
  onSelectActor,
}: EconomyFlowDiagramProps) {
  const connectedActors = new Set<ActorId>();
  if (selectedActor !== null) {
    connectedActors.add(selectedActor);
    for (const edge of ECONOMY_FLOW_EDGES) {
      if (activeCategory !== "all" && edge.category !== activeCategory) continue;
      if (edge.from === selectedActor) connectedActors.add(edge.to);
      if (edge.to === selectedActor) connectedActors.add(edge.from);
    }
  }

  const edgeMatches = (edge: EconomyFlowEdge): boolean => {
    const catOk = activeCategory === "all" || edge.category === activeCategory;
    const actorOk = selectedActor === null || edge.from === selectedActor || edge.to === selectedActor;
    return catOk && actorOk;
  };

  // 흐린 화살표를 먼저, 강조된 화살표를 뒤에 그려 라벨이 가리지 않게 한다
  const orderedEdges = ECONOMY_FLOW_EDGES.toSorted((a, b) => Number(edgeMatches(a)) - Number(edgeMatches(b)));

  return (
    <div className="econ-diagram-wrap">
      <svg
        className="econ-diagram-svg"
        viewBox={`0 0 ${DIAGRAM_VIEWBOX.width} ${DIAGRAM_VIEWBOX.height}`}
        role="img"
        aria-label={m.dev_econ_flow_diagram_aria()}
      >
        <defs>
          {MARKER_CATS.map((cat) => (
            <marker
              key={cat.id}
              id={`econ-arrow-${cat.id}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.2 L 9 5 L 0 8.8 z" fill={cat.colorVar} />
            </marker>
          ))}
        </defs>

        {/* 주체 박스 층 */}
        {ECONOMY_ACTORS.map((actor) => {
          const isSelected = selectedActor === actor.id;
          const isDim = selectedActor !== null && !connectedActors.has(actor.id);
          const title = ko ? actor.titleKo : actor.titleEn;
          const sub = ko ? actor.subtitleKo : actor.subtitleEn;
          const eq = ko ? actor.formulaSummaryKo : actor.formulaSummaryEn;
          const badge = ko ? actor.badgeKo : actor.badgeEn;
          const maxEq = Math.floor((actor.w - 24) / 6.3);
          const maxSub = Math.floor((actor.w - 24) / 7.2);

          return (
            <g
              key={actor.id}
              className={`econ-svg-node econ-cat-${actor.accent}${isSelected ? " is-selected" : ""}${isDim ? " is-dim" : ""}${actor.status === "planned" ? " is-planned" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={title}
              onClick={() => onSelectActor(isSelected ? null : actor.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectActor(isSelected ? null : actor.id);
                }
              }}
            >
              <rect className="econ-svg-node-box" x={actor.x} y={actor.y} width={actor.w} height={actor.h} />
              <rect className="econ-svg-node-bar" x={actor.x} y={actor.y} width={actor.w} height={4} rx={2} />
              <text className="econ-svg-node-badge" fontSize={9.5} x={actor.x + 12} y={actor.y + 22}>
                {badge}
              </text>
              <text className="econ-svg-node-title" fontSize={13.5} x={actor.x + 12} y={actor.y + 44}>
                {clipText(title, Math.floor((actor.w - 20) / 10))}
              </text>
              <text className="econ-svg-node-sub" fontSize={10.5} x={actor.x + 12} y={actor.y + 64}>
                {clipText(sub, maxSub)}
              </text>
              <line
                x1={actor.x + 12}
                y1={actor.y + 78}
                x2={actor.x + actor.w - 12}
                y2={actor.y + 78}
                stroke="var(--color-border)"
                strokeWidth="1"
              />
              <text className="econ-svg-node-eq" fontSize={10} x={actor.x + 12} y={actor.y + 98}>
                {clipText(eq, maxEq)}
              </text>
              {eq.length > maxEq ? (
                <text className="econ-svg-node-eq" fontSize={10} x={actor.x + 12} y={actor.y + 114}>
                  {clipText(eq.slice(maxEq - 1), maxEq)}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* 흐름 화살표 + 라벨 필 층 */}
        {orderedEdges.map((edge) => {
          const active = edgeMatches(edge);
          const geo = edgeGeometry(edge);
          const label = ko ? edge.labelKo : edge.labelEn;
          const tag = ko ? edge.defaultTagKo : edge.defaultTagEn;
          const pillW = Math.max(label.length * 7.6, tag.length * 6.4) + 16;
          const pillH = 30;
          const showLabel = active || (selectedActor === null && activeCategory === "all");

          return (
            <g
              key={edge.id}
              className={`econ-svg-edge econ-cat-${edge.category}${active && (selectedActor !== null || activeCategory !== "all") ? " is-selected" : ""}${active ? "" : " is-dim"}${edge.status === "planned" ? " is-planned" : ""}`}
            >
              <path
                className="econ-svg-edge-path"
                d={geo.d}
                markerEnd={`url(#econ-arrow-${edge.category})`}
              />
              {showLabel ? (
                <g transform={`translate(${geo.labelX.toFixed(1)}, ${geo.labelY.toFixed(1)})`}>
                  <rect
                    className="econ-svg-edge-pill"
                    x={-pillW / 2}
                    y={-pillH / 2}
                    width={pillW}
                    height={pillH}
                  />
                  <text className="econ-svg-edge-label" fontSize={10} x={0} y={-2}>
                    {label}
                  </text>
                  <text className="econ-svg-edge-tag" fontSize={9} x={0} y={10}>
                    {tag}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
