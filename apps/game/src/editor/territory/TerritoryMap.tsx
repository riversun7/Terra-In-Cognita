// 영토 지도(캔버스) — 중심 투영 평면에 세밀 경계(기기가 claimAt으로 다시 셈한 표본 — 1차맵 영토 지도 그대로, D-568), 1차맵 칸 격자, 서버 칸
// 표 테두리, 도시 영토 원(굵은 선)·영향권(점선), 도시·비콘 표시를 그린다. docs/adr/2026-11-03-territory-layer.md 5절. 색은 개발 화면 토큰(세력 = --color-stat-* 돌려 쓰기)을 그때 읽는다
// (테마를 바꾸면 <html> 속성이 바뀌어 다시 그린다). 칸을 누르면 onSelect(칸 키). 키보드는 화면의 칸 고르기 칸이 맡는다.
import type { CellKey } from "@terra/planet";
import { type TerritoryLayout, URBAN_RADIUS_DIVISOR } from "@terra/shared/territory";
import type { TerritoryPlanetView } from "@terra/shared/territoryApi";
import { useEffect, useMemo, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import {
  type MapView,
  cellAt,
  cellOutline,
  cellRows,
  factionColorToken,
  fineSamples,
  mapViewOf,
  project,
  samplePx,
  visibleCells,
} from "./territoryModel.ts";

/** 가운데에서 보이는 칸 수(위아래·좌우) */
export const MAP_RADIUS = 14;
const MIN_SIZE = 240;
const MAX_SIZE = 720;

interface Props {
  readonly data: TerritoryPlanetView;
  readonly layout: TerritoryLayout;
  readonly center: CellKey;
  readonly selected: CellKey | null;
  readonly onSelect: (key: CellKey) => void;
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

function path(ctx: CanvasRenderingContext2D, points: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

function draw(
  ctx: CanvasRenderingContext2D,
  view: MapView,
  props: Props,
  samples: ReturnType<typeof fineSamples>,
): void {
  const { data, layout, selected } = props;
  const colorOf = (factionId: number) => token(factionColorToken(data, factionId));
  ctx.fillStyle = token("--color-surface-2");
  ctx.fillRect(0, 0, view.size, view.size);
  // 세밀 경계: 표본마다 세력 색(옅게)
  const px = Math.ceil(samplePx(view)) + 1;
  ctx.globalAlpha = 0.32;
  for (const sample of samples) {
    ctx.fillStyle = colorOf(sample.claim.faction);
    ctx.fillRect(sample.x - px / 2, sample.y - px / 2, px, px);
  }
  ctx.globalAlpha = 1;
  // 1차맵 칸 격자
  ctx.strokeStyle = token("--color-border");
  ctx.lineWidth = 1;
  for (const key of visibleCells(view)) {
    const outline = cellOutline(view, key);
    if (!outline) continue;
    path(ctx, outline);
    ctx.stroke();
  }
  // 서버 칸 표: 칸 테두리를 세력 색으로
  const rows = cellRows(data);
  ctx.lineWidth = 1.5;
  for (const [key, row] of rows) {
    const outline = cellOutline(view, key);
    if (!outline) continue;
    ctx.strokeStyle = colorOf(row[1]);
    path(ctx, outline);
    ctx.stroke();
  }
  // 도시 영토 원(굵은 선, 1차맵 지도·판정 D-568)과 시가지(점선 원 = 영토 원 ÷ 3, D-146 — 질문 1923): 반지름 = 각 × 평면 배율
  for (const [divisor, dash, width] of [
    [1, [], 2.5],
    [URBAN_RADIUS_DIVISOR, [4, 3], 1],
  ] as const) {
    ctx.setLineDash(dash);
    ctx.lineWidth = width;
    for (const city of layout.cities) {
      const at = project(view, city.point);
      if (!at) continue;
      const radius = (city.territoryMilli / divisor / data.milliPerRadian) * view.pxPerUnit;
      ctx.strokeStyle = colorOf(city.faction);
      ctx.beginPath();
      ctx.arc(at[0], at[1], Math.max(2, radius), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  // 도시(네모)·비콘(마름모)
  const ink = token("--color-text");
  ctx.lineWidth = 1.5;
  for (const city of layout.cities) {
    const at = project(view, city.point);
    if (!at) continue;
    ctx.fillStyle = colorOf(city.faction);
    ctx.strokeStyle = ink;
    ctx.fillRect(at[0] - 5, at[1] - 5, 10, 10);
    ctx.strokeRect(at[0] - 5, at[1] - 5, 10, 10);
  }
  for (const beacon of layout.beacons) {
    const at = project(view, beacon.point);
    if (!at) continue;
    ctx.fillStyle = colorOf(beacon.faction);
    ctx.strokeStyle = ink;
    path(ctx, [
      [at[0], at[1] - 6],
      [at[0] + 6, at[1]],
      [at[0], at[1] + 6],
      [at[0] - 6, at[1]],
    ]);
    ctx.fill();
    ctx.stroke();
  }
  // 고른 칸
  if (selected !== null) {
    const outline = cellOutline(view, selected);
    if (outline) {
      ctx.strokeStyle = token("--color-focus");
      ctx.lineWidth = 3;
      path(ctx, outline);
      ctx.stroke();
    }
  }
}

export function TerritoryMap(props: Props) {
  const { data, layout, center, onSelect } = props;
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(480);
  const [theme, setTheme] = useState(0);

  // 판 폭을 따라 정사각 크기를 정한다(콜백 안에서만 setState)
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? MIN_SIZE;
      setSize(Math.round(Math.max(MIN_SIZE, Math.min(MAX_SIZE, width))));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // 테마(개발 화면 다크·라이트)가 바뀌면 다시 그린다
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme((value) => value + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-dev-theme", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const view = useMemo(() => mapViewOf(center, MAP_RADIUS, size), [center, size]);
  const samples = useMemo(() => fineSamples(view, layout), [view, layout]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(ctx, view, props, samples);
    canvas.dataset.drawn = String(theme);
  });

  return (
    <div className="tl-map" ref={boxRef}>
      <canvas
        ref={canvasRef}
        className="tl-canvas"
        style={{ width: size, height: size }}
        role="img"
        aria-label={m.dev_territory_map_label()}
        data-extended={layout.groups.reduce(
          (sum, group) => sum + group.members.filter((member) => member.kind === "beacon").length,
          0,
        )}
        data-cells={data.cells.length}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onSelect(cellAt(view, event.clientX - rect.left, event.clientY - rect.top));
        }}
      />
    </div>
  );
}
