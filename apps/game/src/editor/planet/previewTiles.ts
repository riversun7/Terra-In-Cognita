// 미리보기 결과 → 1차맵 엔진 타일 원천·행성 설명 — ADR 38 5절, 설계 D.4
// 워커가 넘긴 단계 값(맵 레벨 F−4~F)과 꼭짓점 높이에서 요청마다 타일 하나를 자른다(buildPlanetTile, 서버 굽기와 같은 코드).
// 그래서 미리보기 타일은 같은 결과로 서버가 만드는 타일과 같다(시험: previewTiles.test.ts, 측정: 작업 기록).
// 엔진은 받은 타일을 메시 워커에 복사해 보내므로(넘기지 않는다) 결과 배열은 그대로 남는다. 타일 배열은 요청마다 새로 만든다.
import type { DecodedTile, PlanetDescription, TileSource } from "@terra/engine/planet";
import { type PlanetLevel, buildPlanetTile, planetTileIdFromKey, planetTileKey } from "@terra/planet";
import { planetRadiusMeters } from "@terra/planet/projection";
import type { PreviewResultData } from "./previewProtocol.ts";

const abortError = (): Error => new DOMException("tile request aborted", "AbortError");

/** 결과 하나의 타일 원천. 이 결과의 타일이 아닌 요청(다른 레벨·크기·첫 칸)은 RangeError로 거절한다 */
export function previewTileSource(
  result: Pick<PreviewResultData, "fields" | "levels" | "corners">,
): TileSource {
  const faceLevel = result.fields.meta.faceLevel;
  const byLevel = new Map<number, { level: PlanetLevel; corners: Int16Array }>();
  result.levels.forEach((level, index) => {
    const corners = result.corners[index];
    if (corners) byLevel.set(level.level, { level, corners });
  });
  return (request, signal) => {
    if (signal.aborted) return Promise.reject(abortError());
    try {
      const found = byLevel.get(request.mapLevel);
      if (!found) throw new RangeError(`map level ${request.mapLevel} is not in this preview`);
      const id = planetTileIdFromKey(
        faceLevel,
        planetTileKey(request.mapLevel, request.face, request.i0, request.j0),
      );
      if (!id || id.size !== request.size) throw new RangeError("tile request does not match a tile");
      const tile: DecodedTile = buildPlanetTile(faceLevel, found.level, found.corners, id);
      return Promise.resolve(tile);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

/** 색 "#rrggbb" → 0xRRGGBB (틀리면 null) */
export function parseColour(value: unknown): number | null {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) return null;
  return Number.parseInt(value.slice(1), 16);
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

/**
 * 행성 바이옴 번호별 색: 행성 항목의 biomes 순서(= 결과 바이옴 번호)대로 팩 바이옴 항목의 color.
 * 바이옴 참조는 ID 문자열 또는 참조 객체({ id }). 찾지 못하거나 색이 틀린 번호는 비워 둔다(엔진이 회색으로 그린다)
 */
export function biomeColoursOf(entry: unknown, biomeEntries: readonly unknown[]): number[] {
  const colours = new Map<string, number>();
  for (const biome of biomeEntries) {
    const id = field(biome, "id");
    const colour = parseColour(field(biome, "color"));
    if (typeof id === "string" && colour !== null) colours.set(id, colour);
  }
  const refs = field(entry, "biomes");
  const result: number[] = [];
  if (!Array.isArray(refs)) return result;
  const list: readonly unknown[] = refs;
  list.forEach((reference, index) => {
    const id = typeof reference === "string" ? reference : field(reference, "id");
    const colour = typeof id === "string" ? colours.get(id) : undefined;
    if (colour !== undefined) result[index] = colour;
  });
  return result;
}

/**
 * 엔진 행성 설명: 면 레벨 = 미리보기 레벨(타일 면 레벨과 같아야 한다), 반지름 = 정의 면 레벨의 반지름,
 * 가장 높은 땅 = 결과의 최댓값(0 이상). 메모리 상한은 넘기지 않는다(엔진 기본값, ADR 38 5절)
 */
export function previewPlanetDescription(
  result: Pick<PreviewResultData, "fields" | "maxElevationM">,
  definitionFaceLevel: number,
  biomeColors: readonly number[],
): PlanetDescription {
  return {
    faceLevel: result.fields.meta.faceLevel,
    radiusM: planetRadiusMeters(definitionFaceLevel),
    biomeColors,
    maxElevationM: Math.max(0, result.maxElevationM),
  };
}
