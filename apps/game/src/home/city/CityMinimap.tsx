// 홈 [도시 활동] 카드 [정보] 탭의 2차맵 미니맵 — 사용자 요청 2026-11-25 "정보탭에는 2차맵의 2차원 미니맵". 지형 그림(cityMinimap.ts) 위에
// 보이는 건물(시설 무리 색 네모)·내 유닛(흰 점, 기준 유닛은 고리)·시야 안 남의 유닛(작고 옅은 점)을 그린다.
// - 건물이 유닛보다 잘 보여야 한다(사용자 지적 2026-11-25 "유닛위치보다 건물 위치가 잘보이게"): 처음에는 건물 둘레로 당겨 보이고(buildingsView —
//   [전체 보기]로 2차맵 전체), 건물은 크고 굵은 테두리로 유닛 점 위에 그린다. 남의 유닛 점은 작고 옅게, 테두리 없이 건물 아래에 그린다.
// - 좌표: 보이는 네모(배치 칸) → 캔버스 CANVAS_PX. 지형 칸(128²)은 한 번 작은 캔버스에 넣고 그 네모만 늘려 그린다.
// - 건물 색은 카드 무리 색 토큰(--color-stat-* 등)을 읽어 쓴다(테마를 따른다). 지형·유닛 점은 세계 색이라 고정이다.
// - 캔버스는 그림이라 읽기 프로그램에는 수를 적은 이름(aria-label)을 준다. 범례는 아래 글.
import type { TerrainData } from "@terra/protocol";
import type { NearbyUnit } from "@terra/shared/mapUnits";
import { useEffect, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { formatCount } from "../numbers.ts";
import type { BuildingGroup, Cell, CityBuildingRow } from "./cityCardData.ts";
import {
  MINIMAP_CELLS,
  MINIMAP_FULL,
  type MinimapView,
  buildingsView,
  terrainPixels,
} from "./cityMinimap.ts";

/** 캔버스 한 변(화소) */
const CANVAS_PX = 512;
/** 건물 네모의 가장 작은 한 변(화소) — 2차맵 전체 보기에서도 건물이 점보다 크게 */
const BUILDING_MIN_PX = 9;

/** 무리 → 색 토큰(home/city/cityCard.css·map/mapHud.css의 --group-color 짝과 같다) */
const GROUP_TOKEN: Readonly<Record<BuildingGroup, string>> = {
  administration: "--color-stat-str",
  gathering: "--color-stat-agi",
  processing: "--color-stat-vit",
  storage: "--color-stat-dex",
  housing: "--color-stat-wis",
  public: "--color-stat-int",
  commerce: "--color-warning",
  transport: "--color-market-blue",
  military: "--color-danger",
  other: "--color-text-muted",
};

/** 지도 위 표시 색(세계 색 — 테마와 상관없다) */
const INK = "rgb(18 24 38)";
const OWN_FILL = "rgb(255 255 255)";
/** 남의 유닛 점: 옅게(건물을 가리지 않는다) */
const OTHER_FILL = "rgb(255 170 60 / 65%)";
const NO_TERRAIN = "rgb(60 72 92)";

export interface MinimapProps {
  /** 지형(받기 전·실패면 null — 바탕만 칠하고 표시를 그린다) */
  readonly terrain: TerrainData | null;
  readonly buildings: readonly CityBuildingRow[];
  /** 이 2차맵의 내 유닛 자리(배치 칸) */
  readonly mine: readonly (Cell & { readonly unitId: number })[];
  /** 기준 유닛 */
  readonly selected: number;
  /** 시야 안 남의 유닛(받기 전이면 빈 목록) */
  readonly others: readonly NearbyUnit[];
}

function drawTerrain(
  context: CanvasRenderingContext2D,
  terrain: TerrainData | null,
  view: MinimapView,
): void {
  context.fillStyle = NO_TERRAIN;
  context.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
  if (terrain === null) return;
  const pixels = terrainPixels(terrain);
  if (pixels.length === 0) return;
  const size = terrain.terrainSize;
  const small = document.createElement("canvas");
  small.width = size;
  small.height = size;
  const smallContext = small.getContext("2d");
  if (!smallContext) return;
  const image = smallContext.createImageData(size, size);
  image.data.set(pixels);
  smallContext.putImageData(image, 0, 0);
  // 보이는 네모(배치 칸)를 지형 칸으로 바꿔 그 몫만 늘려 그린다
  const perCell = size / MINIMAP_CELLS;
  context.imageSmoothingEnabled = true;
  context.drawImage(
    small,
    view.x * perCell,
    view.y * perCell,
    view.size * perCell,
    view.size * perCell,
    0,
    0,
    CANVAS_PX,
    CANVAS_PX,
  );
}

export function CityMinimap({ terrain, buildings, mine, selected, others }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 처음에는 건물 둘레(건물 자리가 또렷하게). 건물 칸을 모르면 늘 전체
  const [whole, setWhole] = useState(false);
  const me = mine.find((unit) => unit.unitId === selected) ?? null;
  const meX = me?.x ?? null;
  const meY = me?.y ?? null;
  const hasRects = buildings.some((row) => row.rect !== undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const focus = meX === null || meY === null ? null : { x: meX, y: meY };
    const rects = buildings.flatMap((row) => (row.rect ? [row.rect] : []));
    const view = whole ? MINIMAP_FULL : buildingsView(rects, focus);
    const scale = CANVAS_PX / view.size;
    const px = (cell: number, origin: number): number => (cell - origin) * scale;
    const dot = (at: Cell, radius: number, fill: string, outline: boolean): void => {
      context.beginPath();
      context.arc(px(at.x + 0.5, view.x), px(at.y + 0.5, view.y), radius, 0, Math.PI * 2);
      context.fillStyle = fill;
      context.fill();
      if (!outline) return;
      context.lineWidth = 1.5;
      context.strokeStyle = INK;
      context.stroke();
    };
    drawTerrain(context, terrain, view);
    // 1) 남의 유닛: 작고 옅게, 건물 아래
    for (const unit of others) dot({ x: unit.cellX, y: unit.cellY }, 2.5, OTHER_FILL, false);
    // 2) 건물: 크고 굵은 테두리(어두운 테 + 밝은 속 테), 유닛 점 위
    const tokens = getComputedStyle(canvas);
    for (const row of buildings) {
      if (!row.rect) continue;
      const color = tokens.getPropertyValue(GROUP_TOKEN[row.group]).trim();
      const width = Math.max(row.rect.width * scale, BUILDING_MIN_PX);
      const height = Math.max(row.rect.height * scale, BUILDING_MIN_PX);
      // 가장 작은 크기로 키운 네모는 건물 가운데에 맞춘다
      const x = px(row.rect.x + row.rect.width / 2, view.x) - width / 2;
      const y = px(row.rect.y + row.rect.height / 2, view.y) - height / 2;
      context.fillStyle = color === "" ? OWN_FILL : color;
      context.fillRect(x, y, width, height);
      context.lineWidth = 2.5;
      context.strokeStyle = INK;
      context.strokeRect(x, y, width, height);
      if (row.mine) {
        context.lineWidth = 1.5;
        context.strokeStyle = OWN_FILL;
        context.strokeRect(x + 2.5, y + 2.5, width - 5, height - 5);
      }
    }
    // 3) 내 유닛: 기준 유닛만 고리로 크게, 나머지는 작은 흰 점
    for (const unit of mine) {
      if (unit.unitId !== selected) dot(unit, 3.5, OWN_FILL, true);
    }
    if (focus) {
      dot(focus, 4.5, OWN_FILL, true);
      context.beginPath();
      context.arc(px(focus.x + 0.5, view.x), px(focus.y + 0.5, view.y), 10, 0, Math.PI * 2);
      context.lineWidth = 2;
      context.strokeStyle = OWN_FILL;
      context.stroke();
    }
  }, [terrain, buildings, mine, selected, others, whole, meX, meY]);

  return (
    <figure
      className="city-minimap"
      data-terrain={terrain === null ? "none" : "ready"}
      data-view={whole || !hasRects ? "all" : "buildings"}
    >
      <canvas
        ref={canvasRef}
        className="city-minimap-canvas"
        width={CANVAS_PX}
        height={CANVAS_PX}
        role="img"
        aria-label={m.home_city_minimap_label({
          buildings: formatCount(buildings.length),
          mine: formatCount(mine.length),
          others: formatCount(others.length),
        })}
      />
      {hasRects ? (
        <button
          type="button"
          className="button-small city-minimap-zoom"
          aria-pressed={whole}
          onClick={() => setWhole((value) => !value)}
        >
          {m.home_city_minimap_whole()}
        </button>
      ) : null}
      <figcaption className="city-minimap-legend">
        <span data-mark="building">{m.home_city_minimap_buildings()}</span>
        <span data-mark="mine">{m.home_city_minimap_mine()}</span>
        <span data-mark="others">{m.home_city_minimap_others()}</span>
      </figcaption>
    </figure>
  );
}
