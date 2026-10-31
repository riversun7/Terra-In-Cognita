// 1차맵 구름 기후 큐브 — 순수 함수(시험 대상, three.js를 쓰지 않는다). ADR 2026-10-29-primary-map-sky 6절 "기후 치우침".
// - 구름 덮임은 바다에서 위도 띠, 땅에서 습도를 따른다. 땅·습도는 첫 단계 타일(맵 레벨 F−4)로 만든 RG8 큐브에서 읽는다
//   (면당 2^(F−4)칸, 64칸 상한. F9는 32칸 × 6면 × 2바이트 = 12KB).
// - GL 큐브 면 번호(0 +X, 1 −X, 2 +Y, 3 −Y, 4 +Z, 5 −Z)와 면 안 (s, t)는 OpenGL ES 3.0 표 3.21을 따른다. 굽기 셰이더의
//   faceDir와 이 파일의 glCubeDirection은 같은 식(표를 거꾸로 푼 것)이다. 행성 투영의 면(@terra/planet)과는 다른 번호다.
// - 받지 않은 타일은 바다로 본다(위도 띠만). 그래서 첫 단계 타일을 다 받은 뒤에 구우면 모든 기기에서 같은 구름이다.
import { FACES, WATER_LAKE, WATER_OCEAN } from "@terra/planet";
import type { DecodedTile } from "./planetTypes.ts";
import { directionToFaceST } from "./tileShape.ts";
import { type TileLayout, type TileNode, nodeAt, nodeSTRange, tileKey, tilesPerSide } from "./tileTree.ts";
import { type Vec3, normalize } from "./vec3.ts";

/** 기후 큐브 한 변 칸 수 상한 */
const MAX_CLIMATE_CELLS = 64;

/** GL 큐브 면 + 면 안 (s, t)(0~1) → 방향(단위 벡터). 표 3.21의 sc = 2s − 1, tc = 2t − 1을 거꾸로 푼 식 */
export function glCubeDirection(face: number, s: number, t: number): Vec3 {
  const sc = 2 * s - 1;
  const tc = 2 * t - 1;
  switch (face) {
    case 0:
      return normalize([1, -tc, -sc]);
    case 1:
      return normalize([-1, -tc, sc]);
    case 2:
      return normalize([sc, 1, tc]);
    case 3:
      return normalize([sc, -1, -tc]);
    case 4:
      return normalize([sc, -tc, 1]);
    default:
      return normalize([-sc, -tc, -1]);
  }
}

/** 방향 → GL 큐브 면과 (s, t)(표 3.21, GPU가 큐브를 읽는 식). 시험이 glCubeDirection과 왕복을 본다 */
export function glCubeFaceST(direction: Vec3): { face: number; s: number; t: number } {
  const [x, y, z] = direction;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  let face: number;
  let sc: number;
  let tc: number;
  let ma: number;
  if (ax >= ay && ax >= az) {
    face = x >= 0 ? 0 : 1;
    sc = x >= 0 ? -z : z;
    tc = -y;
    ma = ax;
  } else if (ay >= az) {
    face = y >= 0 ? 2 : 3;
    sc = x;
    tc = y >= 0 ? z : -z;
    ma = ay;
  } else {
    face = z >= 0 ? 4 : 5;
    sc = z >= 0 ? x : -x;
    tc = -y;
    ma = az;
  }
  return { face, s: (sc / ma + 1) / 2, t: (tc / ma + 1) / 2 };
}

/** 기후 큐브 한 면 칸 수 = 첫 단계 타일 한 면의 칸 수(2^(F−4)), 64 상한 */
export function climateCubeSize(layout: TileLayout): number {
  return Math.min(MAX_CLIMATE_CELLS, 2 ** layout.firstLevel);
}

/** 첫 단계(맵 레벨 F−4)의 모든 마디(면마다 tilesPerSide² 개). F9면 6개, F10이면 24개 */
export function firstLevelNodes(layout: TileLayout): TileNode[] {
  const n = tilesPerSide(layout.firstLevel);
  const nodes: TileNode[] = [];
  for (const face of FACES) {
    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) nodes.push({ face, mapLevel: layout.firstLevel, tx, ty });
    }
  }
  return nodes;
}

/** 방향의 기후: [습도 0~1, 땅 0 또는 1]. 첫 단계 타일이 없으면 바다([0, 0]) */
export function climateAt(
  direction: Vec3,
  layout: TileLayout,
  decoded: (key: number) => DecodedTile | null,
): readonly [number, number] {
  const { face, s, t } = directionToFaceST(direction);
  const node = nodeAt(face, s, t, layout.firstLevel);
  const tile = decoded(tileKey(node));
  if (!tile) return [0, 0];
  const range = nodeSTRange(node);
  const size = tile.size;
  const i = Math.min(size - 1, Math.max(0, Math.floor(((s - range.s0) / range.span) * size)));
  const j = Math.min(size - 1, Math.max(0, Math.floor(((t - range.t0) / range.span) * size)));
  const index = j * size + i;
  const water = tile.water[index] ?? 0;
  const wet = (water & (WATER_OCEAN | WATER_LAKE)) !== 0;
  return [(tile.humidity[index] ?? 0) / 255, wet ? 0 : 1];
}

/** RG8 면 6장(GL 큐브 면 순서, 행 우선): 텍셀 가운데 방향마다 sample(방향) = [습도, 땅] */
export function climateFaces(
  size: number,
  sample: (direction: Vec3) => readonly [number, number],
): Uint8Array[] {
  return [0, 1, 2, 3, 4, 5].map((face) => {
    const data = new Uint8Array(size * size * 2);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [humidity, land] = sample(glCubeDirection(face, (x + 0.5) / size, (y + 0.5) / size));
        data[(y * size + x) * 2] = Math.round(humidity * 255);
        data[(y * size + x) * 2 + 1] = Math.round(land * 255);
      }
    }
    return data;
  });
}
