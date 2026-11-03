// 영토 화면 모형 — 서버 자료(tRPC territory.planet)로 배치를 다시 만들고, 지도 투영(중심 투영 평면)·칸 고르기·세밀 표본을 셈한다.
// docs/adr/2026-11-03-territory-layer.md 5절. 서버와 같은 함수(@terra/shared/territory buildTerritory·claimAt)·같은 입력이라 같은 답이다.
// 중심 투영은 대원을 직선으로 보내서 껍질 가장자리(대원)가 화면에서 곧은 선이다.
import { type CellKey, cellKey, decodeCellKey, descendantAt, isCellKey } from "@terra/planet";
import { type Vec3, cellCenter, cellCorners, xyzToCell } from "@terra/planet/projection";
import { territoryPoint } from "@terra/planet/territory";
import {
  type TerritoryClaim,
  type TerritoryLayout,
  type TerritoryVec,
  buildTerritory,
  claimAt,
} from "@terra/shared/territory";
import type { TerritoryPlanetView } from "@terra/shared/territoryApi";

/** 서버 자료 → 배치(서버와 같은 입력) */
export function layoutOf(view: TerritoryPlanetView): TerritoryLayout {
  return buildTerritory(
    view.cities.map((city) => ({
      id: city.id,
      faction: city.factionId,
      point: city.point,
      grade: city.grade,
    })),
    view.beacons.map((beacon) => ({
      id: beacon.id,
      faction: beacon.factionId,
      point: beacon.point,
      anchorCity: beacon.cityId,
    })),
    view.rules,
    { milliPerRadian: view.milliPerRadian },
  );
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.sqrt(dot(a, a)));

/** 지도 보기: 가운데 1차맵 칸, 반폭(칸), 화면 크기(px) → 투영 */
export interface MapView {
  readonly center: CellKey;
  readonly faceLevel: number;
  /** 가운데에서 위아래·좌우로 보이는 칸 수 */
  readonly radius: number;
  /** 화면 한 변(px) */
  readonly size: number;
  readonly c: Vec3;
  readonly e1: Vec3;
  readonly e2: Vec3;
  /** 평면 1 = 몇 px */
  readonly pxPerUnit: number;
}

/** 가운데 칸의 면 축으로 평면 축을 잡는다(i → 오른쪽, j → 위) */
export function mapViewOf(center: CellKey, radius: number, size: number): MapView {
  const { face, level, i, j } = decodeCellKey(center);
  const n = 1 << level;
  const c = unit(cellCenter(center));
  const right = cellCenter(cellKey(face, level, Math.min(n - 1, i + 1), j));
  const left = cellCenter(cellKey(face, level, Math.max(0, i - 1), j));
  const along = sub(right, left);
  const e1 = unit(sub(along, scale(c, dot(along, c))));
  const e2 = cross(c, e1);
  // 칸 하나의 평면 길이 ≈ 이웃 칸 중심 사이 ÷ 2 칸
  const cellUnits = Math.sqrt(dot(along, along)) / 2;
  return { center, faceLevel: level, radius, size, c, e1, e2, pxPerUnit: size / 2 / (radius * cellUnits) };
}

/** 방향(길이 무관) → 화면 좌표(px). 뒤쪽 반구면 null */
export function project(view: MapView, p: Vec3 | TerritoryVec): readonly [number, number] | null {
  const depth = dot(p, view.c);
  if (depth <= 0) return null;
  const x = dot(p, view.e1) / depth;
  const y = dot(p, view.e2) / depth;
  return [view.size / 2 + x * view.pxPerUnit, view.size / 2 - y * view.pxPerUnit];
}

/** 화면 좌표 → 그 자리의 1차맵 칸 */
export function cellAt(view: MapView, px: number, py: number): CellKey {
  const x = (px - view.size / 2) / view.pxPerUnit;
  const y = (view.size / 2 - py) / view.pxPerUnit;
  const direction: Vec3 = [
    view.c[0] + x * view.e1[0] + y * view.e2[0],
    view.c[1] + x * view.e1[1] + y * view.e2[1],
    view.c[2] + x * view.e1[2] + y * view.e2[2],
  ];
  return xyzToCell(direction, view.faceLevel);
}

/** 보이는 1차맵 칸(가운데 면 안, 칸 키 차례) */
export function visibleCells(view: MapView): CellKey[] {
  const { face, level, i, j } = decodeCellKey(view.center);
  const n = 1 << level;
  const out: CellKey[] = [];
  for (let di = -view.radius; di <= view.radius; di++)
    for (let dj = -view.radius; dj <= view.radius; dj++) {
      const ci = i + di;
      const cj = j + dj;
      if (ci >= 0 && cj >= 0 && ci < n && cj < n) out.push(cellKey(face, level, ci, cj));
    }
  return out;
}

/** 칸 테두리(화면 좌표 넷). 뒤쪽이면 null */
export function cellOutline(view: MapView, key: CellKey): (readonly [number, number])[] | null {
  const out: (readonly [number, number])[] = [];
  for (const corner of cellCorners(key)) {
    const point = project(view, corner);
    if (!point) return null;
    out.push(point);
  }
  return out;
}

export interface FineSample {
  readonly x: number;
  readonly y: number;
  readonly claim: TerritoryClaim;
}

/** 세밀 경계 표본: 보이는 칸마다 하위 depth단계 칸 중심의 소속(소속 없는 곳은 뺀다) */
export function fineSamples(view: MapView, layout: TerritoryLayout, depth = 3): FineSample[] {
  const side = 1 << depth;
  const out: FineSample[] = [];
  for (const key of visibleCells(view))
    for (let x = 0; x < side; x++)
      for (let y = 0; y < side; y++) {
        const sample = descendantAt(key, depth, x, y);
        const point = territoryPoint(sample);
        const claim = claimAt(layout, point);
        if (!claim) continue;
        const at = project(view, point);
        if (at) out.push({ x: at[0], y: at[1], claim });
      }
  return out;
}

/** 표본 하나의 화면 크기(px) */
export function samplePx(view: MapView, depth = 3): number {
  return view.size / (2 * view.radius + 1) / (1 << depth);
}

/** 서버 칸 표 줄을 칸 키 → 줄로 */
export function cellRows(view: TerritoryPlanetView): Map<CellKey, TerritoryPlanetView["cells"][number]> {
  const out = new Map<CellKey, TerritoryPlanetView["cells"][number]>();
  for (const row of view.cells) {
    const key = row[0];
    if (isCellKey(key)) out.set(key, row);
  }
  return out;
}

/** 세력 색 차례(개발 화면 토큰 --color-stat-* 여섯을 돌려 쓴다) */
export const FACTION_COLOR_TOKENS = [
  "--color-stat-int",
  "--color-stat-str",
  "--color-stat-agi",
  "--color-stat-wis",
  "--color-stat-dex",
  "--color-stat-vit",
] as const;

/** 세력 ID → 색 토큰(보기 차례대로) */
export function factionColorToken(view: TerritoryPlanetView, factionId: number): string {
  const index = view.factions.findIndex((faction) => faction.id === factionId);
  return FACTION_COLOR_TOKENS[(index < 0 ? 0 : index) % FACTION_COLOR_TOKENS.length] ?? "--color-primary";
}
