// 세계 배치 화면 모형(DOM 없음) — 기획 D-528, docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)".
// - 행성 평면 지도 자료: 1차맵 타일(맵 레벨 F−3, 면마다 2×2 = 24장)을 이어 붙여 행성 편집기 평면 미니맵(FlatMap)이 받는 결과 모양으로 만든다
//   (칸 고도 = 꼭짓점 넷 평균). 1차맵과 같은 타일·같은 바이옴 색이라 다른 지도 그리기를 새로 만들지 않는다.
// - 칸 키 ↔ 위도·경도(지도 위 표시 자리), 국가 상태(자동·대기·적용·막힘).
import { cellsPerSide, isCellKey } from "@terra/planet";
import { cellCenter } from "@terra/planet/projection";
import type { PlanetTileData } from "@terra/protocol/planetTile";
import type { WorldPlacementNationView } from "@terra/shared/worldPlacementApi";
import { type FlatMapFields, type LatLon, flatMapFraction } from "../planet/flatMapRender.ts";

/** 평면 지도에 쓰는 맵 레벨 = 면 레벨 − 이 값(F9 → 레벨 6, 면마다 64 × 64칸) */
export const MAP_LEVEL_DROP = 3;

/** 칸 키 가운데의 위도·경도(°). 칸 키가 아니면 null */
export function latLonOfKey(key: number): LatLon | null {
  if (!isCellKey(key)) return null;
  const [x, y, z] = cellCenter(key);
  const length = Math.hypot(x, y, z) || 1;
  return {
    latDeg: (Math.asin(Math.max(-1, Math.min(1, z / length))) * 180) / Math.PI,
    lonDeg: (Math.atan2(y, x) * 180) / Math.PI,
  };
}

/** 10진 글자 칸 키 → 위도·경도(형식이 틀리면 null) */
export function latLonOfText(text: string): LatLon | null {
  return /^\d{1,19}$/.test(text) ? latLonOfKey(Number(text)) : null;
}

/**
 * 맵 레벨 mapLevel의 타일들(면 6 × 덮는 타일)을 이어 붙인 평면 지도 결과. 칸 번호 = 면 × n² + j × n + i(생성기 출력 차례).
 * 빠진 타일 자리는 바이옴 0·물 0·고도 0으로 남는다
 */
export function assembleFlatFields(tiles: readonly PlanetTileData[], mapLevel: number): FlatMapFields {
  const n = cellsPerSide(mapLevel);
  const biome = new Uint8Array(6 * n * n);
  const water = new Uint8Array(6 * n * n);
  const elevationM = new Int16Array(6 * n * n);
  for (const tile of tiles) {
    if (tile.mapLevel !== mapLevel) continue;
    const side = tile.size + 1;
    for (let cj = 0; cj < tile.size; cj++)
      for (let ci = 0; ci < tile.size; ci++) {
        const at = tile.face * n * n + (tile.j0 + cj) * n + (tile.i0 + ci);
        const src = cj * tile.size + ci;
        biome[at] = tile.biome[src] ?? 0;
        water[at] = tile.water[src] ?? 0;
        const corners =
          (tile.heightsM[cj * side + ci] ?? 0) +
          (tile.heightsM[cj * side + ci + 1] ?? 0) +
          (tile.heightsM[(cj + 1) * side + ci] ?? 0) +
          (tile.heightsM[(cj + 1) * side + ci + 1] ?? 0);
        elevationM[at] = Math.round(corners / 4);
      }
  }
  return { biome, water, elevationM, meta: { faceLevel: mapLevel } };
}

/** 맵 레벨 mapLevel을 덮는 타일 자리(면 × i0 × j0, 타일 한 변 = min(32, 2^L)) */
export function tileSlots(
  mapLevel: number,
): { readonly face: 0 | 1 | 2 | 3 | 4 | 5; readonly i0: number; readonly j0: number }[] {
  const n = cellsPerSide(mapLevel);
  const size = Math.min(32, n);
  const out: { face: 0 | 1 | 2 | 3 | 4 | 5; i0: number; j0: number }[] = [];
  for (const face of [0, 1, 2, 3, 4, 5] as const)
    for (let j0 = 0; j0 < n; j0 += size) for (let i0 = 0; i0 < n; i0 += size) out.push({ face, i0, j0 });
  return out;
}

export type NationStatus = "auto" | "pending" | "applied" | "blocked";

/** 국가 자리 상태: 놓지 않음 = 자동, 든 시각 있음 = 적용됨, 까닭 있음 = 막힘, 그 밖 = 다음 시작 때 듦 */
export function nationStatus(nation: WorldPlacementNationView): NationStatus {
  const placement = nation.placement;
  if (!placement) return "auto";
  if (placement.appliedAtMs !== null) return "applied";
  return placement.blocked.length > 0 ? "blocked" : "pending";
}

/** 국가 수도 도시(없으면 undefined) */
export function capitalCity(
  nation: WorldPlacementNationView,
): WorldPlacementNationView["cities"][number] | undefined {
  return nation.cities.find((city) => city.capital);
}

/** 지도 위 표시 하나(위치 = 평면 지도 비율 0~1, flatMapFraction) */
export interface MapMark {
  readonly id: string;
  readonly kind: "city" | "capital" | "placed" | "suggested";
  /** 국가 차례(색 돌려 쓰기) */
  readonly nation: number;
  /** 국가 세력 코드 */
  readonly code: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

/** 국가마다 도시·수도·놓은 자리·제안 표시(국가 차례 = 목록 차례) */
export function marksOf(
  nations: readonly WorldPlacementNationView[],
  suggested: ReadonlyMap<string, string>,
  nameOf: (nation: WorldPlacementNationView) => string,
): MapMark[] {
  const out: MapMark[] = [];
  nations.forEach((nation, index) => {
    const add = (id: string, kind: MapMark["kind"], key: string, label: string): void => {
      const point = latLonOfText(key);
      if (!point) return;
      const at = flatMapFraction(point);
      out.push({ id, kind, nation: index, code: nation.code, x: at.x, y: at.y, label });
    };
    for (const city of nation.cities)
      add(`c${city.id}`, city.capital ? "capital" : "city", city.mapKey, city.name ?? nameOf(nation));
    if (nation.placement) add(`p${nation.code}`, "placed", nation.placement.mapKey, nameOf(nation));
    const idea = suggested.get(nation.code);
    if (idea !== undefined) add(`s${nation.code}`, "suggested", idea, nameOf(nation));
  });
  return out;
}
