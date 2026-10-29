// 1차맵 타일 나무 — 순수 계산(시험 대상). ADR 2026-10-29-s2-planet-lod "타일"
// - 1차맵 5단계 = 맵 레벨 F−4 ~ F(면 레벨 F). 단계마다 면을 쿼드트리로 나누고, 타일 하나 = 그 맵 레벨의 32×32칸이다.
//   면이 32칸보다 작은 레벨(맵 레벨 5 미만)은 면 전체가 타일 하나다(한 변 2^L칸). 그 아래 레벨도 면 전체면 자식이 1개다.
// - 지구 크기(F = 9): 맵 레벨 5~9 = 깊이 0~4, 면당 1 + 4 + 16 + 64 + 256 = 341개.
// - 큰 행성(F − 4 > 5)은 가장 거친 1차맵 단계도 면당 타일이 여러 개다. 그 위에 자료 없는 단계(맵 레벨 5 ~ F−5)를 두어
//   나무 꼭대기는 늘 면 하나 = 타일 하나다. 자료 없는 마디는 그리거나 받지 않고 나누기만 한다(시야 거르기용).
import { type Face, FACES, MAX_FACE_LEVEL, MIN_FACE_LEVEL } from "@terra/planet";
import type { TileRequest } from "./planetTypes.ts";

/** 타일 한 변의 칸 수(면이 이보다 작으면 면 전체) */
export const TILE_CELLS = 32;
/** 타일 한 변 칸 수가 TILE_CELLS가 되는 맵 레벨(2^5 = 32) */
const FULL_TILE_LEVEL = 5;
/** 1차맵 단계 수 */
export const PRIMARY_LEVELS = 5;

/** 나무 마디 하나: 면, 맵 레벨, 그 레벨의 타일 번호(tx, ty) */
export interface TileNode {
  readonly face: Face;
  readonly mapLevel: number;
  readonly tx: number;
  readonly ty: number;
}

/** 행성 하나의 타일 나무 범위 */
export interface TileLayout {
  readonly faceLevel: number;
  /** 1차맵 가장 거친 단계(맵 레벨 F − 4)와 가장 고운 단계(F) */
  readonly firstLevel: number;
  readonly lastLevel: number;
  /** 나무 꼭대기 맵 레벨(면 하나 = 타일 하나) */
  readonly topLevel: number;
}

export function tileLayout(faceLevel: number): TileLayout {
  if (!(Number.isInteger(faceLevel) && faceLevel >= MIN_FACE_LEVEL && faceLevel <= MAX_FACE_LEVEL)) {
    throw new RangeError(
      `face level must be an integer in [${MIN_FACE_LEVEL}, ${MAX_FACE_LEVEL}]: ${faceLevel}`,
    );
  }
  const firstLevel = faceLevel - (PRIMARY_LEVELS - 1);
  return { faceLevel, firstLevel, lastLevel: faceLevel, topLevel: Math.min(firstLevel, FULL_TILE_LEVEL) };
}

/** 맵 레벨 L에서 타일 한 변의 칸 수 = min(32, 2^L) */
export function tileCellsPerSide(mapLevel: number): number {
  return 1 << Math.min(mapLevel, FULL_TILE_LEVEL);
}

/** 맵 레벨 L에서 면 한 변의 타일 수 = 2^max(0, L − 5) */
export function tilesPerSide(mapLevel: number): number {
  return 1 << Math.max(0, mapLevel - FULL_TILE_LEVEL);
}

/** 1차맵 단계인지(자료가 있는 마디) */
export function isDataLevel(layout: TileLayout, mapLevel: number): boolean {
  return mapLevel >= layout.firstLevel && mapLevel <= layout.lastLevel;
}

/** 맵 레벨 → 1차맵 단계 번호(1 = 가장 거침 ~ 5 = 가장 고움). 1차맵 단계가 아니면 0 */
export function primaryLevelOf(layout: TileLayout, mapLevel: number): number {
  return isDataLevel(layout, mapLevel) ? mapLevel - layout.firstLevel + 1 : 0;
}

/**
 * 마디 키(정수): ((면 × 16 + 맵 레벨) × 512 + ty) × 512 + tx.
 * 맵 레벨 ≤ 14(면 레벨 상한)라 타일 번호는 2^9 미만이고 키는 2^25 미만이다.
 */
export function tileKey(node: TileNode): number {
  return ((node.face * 16 + node.mapLevel) * 512 + node.ty) * 512 + node.tx;
}

export function nodeOfKey(key: number): TileNode {
  const tx = key % 512;
  const rest = (key - tx) / 512;
  const ty = rest % 512;
  const faceLevel = (rest - ty) / 512;
  const mapLevel = faceLevel % 16;
  const face = FACES[(faceLevel - mapLevel) / 16];
  if (face === undefined) throw new RangeError(`not a tile key: ${key}`);
  return { face, mapLevel, tx, ty };
}

/** 면 하나의 꼭대기 마디들(면마다 하나) */
export function rootNodes(layout: TileLayout): TileNode[] {
  return FACES.map((face) => ({ face, mapLevel: layout.topLevel, tx: 0, ty: 0 }));
}

/** 자식 마디: 가장 고운 단계면 없음, 다음 레벨도 면 전체면 1개, 아니면 4개(ty, tx 순서) */
export function childNodes(layout: TileLayout, node: TileNode): TileNode[] {
  if (node.mapLevel >= layout.lastLevel) return [];
  const next = node.mapLevel + 1;
  if (tilesPerSide(next) === tilesPerSide(node.mapLevel)) {
    return [{ face: node.face, mapLevel: next, tx: node.tx, ty: node.ty }];
  }
  const children: TileNode[] = [];
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      children.push({ face: node.face, mapLevel: next, tx: node.tx * 2 + dx, ty: node.ty * 2 + dy });
    }
  }
  return children;
}

/** 부모 마디. 꼭대기면 null */
export function parentNode(layout: TileLayout, node: TileNode): TileNode | null {
  if (node.mapLevel <= layout.topLevel) return null;
  const previous = node.mapLevel - 1;
  if (tilesPerSide(previous) === tilesPerSide(node.mapLevel)) {
    return { face: node.face, mapLevel: previous, tx: node.tx, ty: node.ty };
  }
  return { face: node.face, mapLevel: previous, tx: node.tx >> 1, ty: node.ty >> 1 };
}

/** 마디가 덮는 칸 범위 = 타일 요청 */
export function tileRequestOf(node: TileNode): TileRequest {
  const size = tileCellsPerSide(node.mapLevel);
  return { face: node.face, mapLevel: node.mapLevel, i0: node.tx * size, j0: node.ty * size, size };
}

/** 면 칸 좌표(정규화) (s, t)가 든 맵 레벨 L의 마디 */
export function nodeAt(face: Face, s: number, t: number, mapLevel: number): TileNode {
  const n = tilesPerSide(mapLevel);
  const tx = Math.min(n - 1, Math.max(0, Math.floor(s * n)));
  const ty = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
  return { face, mapLevel, tx, ty };
}

/** 마디가 면 칸 좌표 (s, t) 범위를 덮는지: [s0, s0 + span) × [t0, t0 + span) */
export function nodeSTRange(node: TileNode): { s0: number; t0: number; span: number } {
  const n = tilesPerSide(node.mapLevel);
  return { s0: node.tx / n, t0: node.ty / n, span: 1 / n };
}
