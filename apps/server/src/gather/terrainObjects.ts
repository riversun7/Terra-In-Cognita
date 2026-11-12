// 지형별 2차맵 오브젝트(site)와 움직이는 어군(school) 자리 — 기획 D-536("각각의 지형에는 최소 5가지 이상의 2차맵 오브젝트", "연안까지는
// 모래사장등", "심해는 배로 이동하여 어군같이 물고기떼"), 42 §5 표. 생성기 판·지형 캐시는 그대로다: 자원이 나오는 오브젝트는 서버가 지형
// 파일(지표 층·소품 그림 층)과 그 2차맵(1차맵 칸) 행성 값(바이옴·물 비트)으로 결정적으로 놓고, 기기가 그 자리에 그림을 덮어 세운다.
// - site: 노두 뒤에 16×16 배치 칸 묶음(256개)마다 종류마다 많아야 하나. 굴림(2차맵 키, 묶음, 종류) < 그 바이옴 천분율이면, surfaces 지표
//   지형 칸 가운데 묶음 가운데에 가장 가까운 빈 칸(소품 그림·앞 오브젝트가 없는 칸)의 배치 칸(오른쪽 아래 — 홀수 좌표)에 둔다. shore면 물
//   (물·얕은 물 지표)까지 지형 칸 거리 ≤ shore인 칸만, coast면 그 2차맵 칸 물 비트에 바다(1)나 해안(8)이 있을 때만.
// - school: 그 바이옴 어군 수만큼. 집 자리 = 물 지형 칸 가운데 굴림으로 고른 칸, 길 = 집 둘레 range 배치 칸 안 물 칸 점 다섯까지(구간도 모두
//   물 위, 닫는 구간까지). 번호 = SCHOOL_ID_BASE + 종류 차례 × 64 + k(배치 칸 번호 0 ~ 65,535와 겹치지 않는다). 자리는 시각의 함수
//   (@terra/shared/fishSchool schoolPosition).
// 정수 연산만 쓴다(판정 코드 규칙).
import { TERRAIN_SURFACE } from "@terra/protocol";
import { type SchoolRoute, schoolPeriodMs, schoolRouteLength } from "@terra/shared/fishSchool";
import { PLACEMENT_SIZE, TERRAIN_SIZE } from "@terra/sim";
import type { GatherKind } from "./kinds.ts";
import { blockHash } from "./objectHash.ts";
import type { GatherObject, ObjectLayers } from "./objects.ts";

/** 지형별 오브젝트 묶음 한 변(배치 칸) — 밭·노두 묶음과 같다 */
const SITE_BLOCK_CELLS = 16;
/** site 굴림 소금(소품·바위·밭·노두 굴림과 겹치지 않게) */
const SITE_SALT = 0x3_0000;
/** 어군 굴림 소금 */
const SCHOOL_SALT = 0x4_0000;
/** 어군 번호 시작(배치 칸 번호 256² 다음) */
export const SCHOOL_ID_BASE = PLACEMENT_SIZE * PLACEMENT_SIZE;
/** 종류 하나의 어군 번호 칸(스키마 count 상한 32보다 넉넉히) */
export const SCHOOL_ID_STRIDE = 64;
/** 어군 길 점 수(집 포함)·점마다 시도 수 */
const SCHOOL_POINTS = 5;
const SCHOOL_TRIES = 8;
/** 물가 거리를 셀 때 자르는 값(지형 칸) */
const SHORE_CAP = 8;
/** 바다·해안 물 비트 */
const SEA_BITS = 1 | 8;

const PLACEMENT_PER_TERRAIN = PLACEMENT_SIZE / TERRAIN_SIZE;

/** 물 지표(물·얕은 물) */
const isWater = (surface: number | undefined): boolean =>
  surface === TERRAIN_SURFACE.water || surface === TERRAIN_SURFACE.shallowWater;

/** 지형 칸마다 물까지 거리(4방향, SHORE_CAP에서 자름. 물 칸 = 0) */
function shoreDistances(surface: Uint8Array): Uint8Array {
  const out = new Uint8Array(TERRAIN_SIZE * TERRAIN_SIZE).fill(SHORE_CAP);
  let frontier: number[] = [];
  for (let cell = 0; cell < out.length; cell++)
    if (isWater(surface[cell])) {
      out[cell] = 0;
      frontier.push(cell);
    }
  for (let step = 1; step < SHORE_CAP && frontier.length > 0; step++) {
    const next: number[] = [];
    for (const cell of frontier) {
      const x = cell % TERRAIN_SIZE;
      const y = Math.floor(cell / TERRAIN_SIZE);
      const around = [
        x > 0 ? cell - 1 : -1,
        x < TERRAIN_SIZE - 1 ? cell + 1 : -1,
        y > 0 ? cell - TERRAIN_SIZE : -1,
        y < TERRAIN_SIZE - 1 ? cell + TERRAIN_SIZE : -1,
      ];
      for (const other of around) {
        if (other < 0 || (out[other] ?? 0) <= step) continue;
        out[other] = step;
        next.push(other);
      }
    }
    frontier = next;
  }
  return out;
}

/** 지형별 오브젝트(머리 주석). taken = 이미 놓인 오브젝트 번호(놓은 자리를 더한다) */
export function siteObjects(
  layers: ObjectLayers,
  kinds: readonly GatherKind[],
  taken: Set<number>,
): GatherObject[] {
  const biome = layers.biomeId;
  if (!biome) return [];
  const coastal = ((layers.waterBits ?? 0) & SEA_BITS) !== 0;
  const siteKinds: { index: number; chancePm: number }[] = [];
  kinds.forEach((kind, index) => {
    if (kind.source !== "site" || kind.surfaces.length === 0) return;
    const chancePm = kind.biomes?.get(biome) ?? 0;
    if (chancePm <= 0 || (kind.coast === true && !coastal)) return;
    siteKinds.push({ index, chancePm });
  });
  if (siteKinds.length === 0) return [];
  const art = layers.art && layers.art.length === PLACEMENT_SIZE * PLACEMENT_SIZE ? layers.art : undefined;
  const shore = siteKinds.some(({ index }) => (kinds[index]?.shore ?? 0) > 0)
    ? shoreDistances(layers.surface)
    : undefined;
  const span = SITE_BLOCK_CELLS / PLACEMENT_PER_TERRAIN;
  const blocks = PLACEMENT_SIZE / SITE_BLOCK_CELLS;
  const out: GatherObject[] = [];
  for (let by = 0; by < blocks; by++)
    for (let bx = 0; bx < blocks; bx++) {
      const block = by * blocks + bx;
      const cx = bx * SITE_BLOCK_CELLS * 2 + SITE_BLOCK_CELLS;
      const cy = by * SITE_BLOCK_CELLS * 2 + SITE_BLOCK_CELLS;
      for (const { index, chancePm } of siteKinds) {
        const kind = kinds[index];
        if (!kind || blockHash(layers.mapKey, block + SITE_SALT, index) % 1000 >= chancePm) continue;
        const limit = kind.shore ?? 0;
        let best = -1;
        let bestDistance = 0;
        for (let ty = by * span; ty < (by + 1) * span; ty++)
          for (let tx = bx * span; tx < (bx + 1) * span; tx++) {
            const terrainCell = ty * TERRAIN_SIZE + tx;
            if (!kind.surfaces.includes(layers.surface[terrainCell] ?? -1)) continue;
            if (limit > 0 && (shore?.[terrainCell] ?? SHORE_CAP) > limit) continue;
            const x = tx * PLACEMENT_PER_TERRAIN + 1;
            const y = ty * PLACEMENT_PER_TERRAIN + 1;
            const cell = y * PLACEMENT_SIZE + x;
            // 소품(나무·바위·물 위 장식 등)이 선 칸은 건너뛴다(기기가 그림을 덮어 세운다 — 소품을 지우지 않게)
            if (taken.has(cell) || (art?.[cell] ?? 0) !== 0) continue;
            const dx = x * 2 + 1 - cx;
            const dy = y * 2 + 1 - cy;
            const distance = dx * dx + dy * dy;
            if (best < 0 || distance < bestDistance || (distance === bestDistance && cell < best)) {
              best = cell;
              bestDistance = distance;
            }
          }
        if (best < 0) continue;
        taken.add(best);
        out.push({ id: best, kind: index, x: best % PLACEMENT_SIZE, y: Math.floor(best / PLACEMENT_SIZE) });
      }
    }
  return out;
}

/** 배치 칸 (x, y)가 물 지형 칸인가(2차맵 밖이면 false) */
function waterAt(surface: Uint8Array, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= PLACEMENT_SIZE || y >= PLACEMENT_SIZE) return false;
  return isWater(surface[(y >> 1) * TERRAIN_SIZE + (x >> 1)]);
}

/** 두 배치 칸을 잇는 곧은 구간이 모두 물 위인가(배치 칸 걸음으로 본다) */
function waterSegment(surface: Uint8Array, ax: number, ay: number, bx: number, by: number): boolean {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  for (let s = 0; s <= steps; s++) {
    const x = steps === 0 ? ax : ax + Math.trunc(((bx - ax) * s) / steps);
    const y = steps === 0 ? ay : ay + Math.trunc(((by - ay) * s) / steps);
    if (!waterAt(surface, x, y)) return false;
  }
  return true;
}

/** 어군 하나의 길(집 자리 home에서 시작, 머리 주석) */
function schoolRoute(
  layers: ObjectLayers,
  salt: number,
  homeX: number,
  homeY: number,
  range: number,
  speed: number,
): SchoolRoute {
  const points = [homeX, homeY];
  let prevX = homeX;
  let prevY = homeY;
  const width = range * 2 + 1;
  for (let j = 1; j < SCHOOL_POINTS; j++) {
    for (let attempt = 0; attempt < SCHOOL_TRIES; attempt++) {
      const h = blockHash(layers.mapKey, salt, j * SCHOOL_TRIES + attempt + 1);
      const x = homeX + (h % width) - range;
      const y = homeY + (Math.floor(h / 65_536) % width) - range;
      if (!waterAt(layers.surface, x, y) || !waterSegment(layers.surface, prevX, prevY, x, y)) continue;
      points.push(x, y);
      prevX = x;
      prevY = y;
      break;
    }
  }
  // 닫는 구간(마지막 → 집)이 물 위가 될 때까지 끝 점을 뺀다(점 하나면 제자리)
  while (points.length > 2) {
    const lx = points[points.length - 2] ?? homeX;
    const ly = points[points.length - 1] ?? homeY;
    if (waterSegment(layers.surface, lx, ly, homeX, homeY)) break;
    points.length -= 2;
  }
  const periodMs = schoolPeriodMs(schoolRouteLength(points), speed);
  return { points, periodMs, phaseMs: blockHash(layers.mapKey, salt, 0) % periodMs };
}

/** 움직이는 어군(머리 주석). 물 칸이 없으면 없다 */
export function schoolObjects(layers: ObjectLayers, kinds: readonly GatherKind[]): GatherObject[] {
  const biome = layers.biomeId;
  if (!biome) return [];
  const plan: { index: number; count: number }[] = [];
  kinds.forEach((kind, index) => {
    if (kind.source !== "school") return;
    const count = Math.min(SCHOOL_ID_STRIDE, kind.biomes?.get(biome) ?? 0);
    if (count > 0) plan.push({ index, count });
  });
  if (plan.length === 0) return [];
  const water: number[] = [];
  for (let cell = 0; cell < TERRAIN_SIZE * TERRAIN_SIZE; cell++)
    if (isWater(layers.surface[cell])) water.push(cell);
  if (water.length === 0) return [];
  const out: GatherObject[] = [];
  for (const { index, count } of plan) {
    const kind = kinds[index];
    if (!kind) continue;
    for (let k = 0; k < count; k++) {
      const salt = SCHOOL_SALT + index * SCHOOL_ID_STRIDE + k;
      const home = water[blockHash(layers.mapKey, salt, 0x5c) % water.length] ?? 0;
      const x = (home % TERRAIN_SIZE) * PLACEMENT_PER_TERRAIN + 1;
      const y = Math.floor(home / TERRAIN_SIZE) * PLACEMENT_PER_TERRAIN + 1;
      const route = schoolRoute(
        layers,
        salt,
        x,
        y,
        Math.max(1, kind.range ?? 1),
        Math.max(1, kind.speed ?? 1),
      );
      out.push({ id: SCHOOL_ID_BASE + index * SCHOOL_ID_STRIDE + k, kind: index, x, y, route });
    }
  }
  return out;
}
