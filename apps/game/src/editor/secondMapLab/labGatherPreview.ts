// 2차맵 시험 화면의 채집 자리(site)·움직이는 어군(school) 즉석 미리 보기 — 서버 apps/server/src/gather/terrainObjects.ts와 같은 결정적 배치 규칙.
// 개발자가 /dev/terrain-objects에서 site 천분율·school 어군 수를 바꾸면 서버 왕복 없이 1~2ms 안에 2차맵 3D 화면에 바로 세운다.
// 또한 현재 열린 2차맵에 실제로 놓인 map_props·site·school 개수와 좌표 표본을 내어, 표에 실시간 개수를 보여 주고 [맵에서 찾기]로 카메라를 옮긴다.
import type { ObjectProp, SchoolInput } from "@terra/engine";
import { TERRAIN_SURFACE } from "@terra/protocol";
import { mapPropArtCode } from "@terra/shared";
import { type SchoolRoute, schoolPeriodMs, schoolRouteLength } from "@terra/shared/fishSchool";
import { ENGINE_PLACEMENT_CELLS, ENGINE_TERRAIN_CELLS } from "../../map/mapWire.ts";
import type { JsonEntry } from "../terrainObjects/terrainObjectsModel.ts";

const PLACEMENT_SIZE = ENGINE_PLACEMENT_CELLS;
const TERRAIN_SIZE = ENGINE_TERRAIN_CELLS;
const PLACEMENT_PER_TERRAIN = PLACEMENT_SIZE / TERRAIN_SIZE;
const SITE_BLOCK_CELLS = 16;
const SITE_SALT = 0x3_0000;
const SCHOOL_SALT = 0x4_0000;
const SCHOOL_ID_BASE = PLACEMENT_SIZE * PLACEMENT_SIZE;
const SCHOOL_ID_STRIDE = 64;
const SCHOOL_POINTS = 5;
const SCHOOL_TRIES = 8;
const SHORE_CAP = 8;
const SEA_BITS = 1 | 8;

const SURFACE_BY_NAME: Readonly<Record<string, number>> = {
  water: TERRAIN_SURFACE.water,
  grass: TERRAIN_SURFACE.grass,
  dirt: TERRAIN_SURFACE.dirt,
  rock: TERRAIN_SURFACE.rock,
  sand: TERRAIN_SURFACE.sand,
  gravel: TERRAIN_SURFACE.gravel,
  snow: TERRAIN_SURFACE.snow,
  ice: TERRAIN_SURFACE.ice,
  mud: TERRAIN_SURFACE.mud,
  ash: TERRAIN_SURFACE.ash,
  shallow_water: TERRAIN_SURFACE.shallowWater,
};

function mix32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** 서버 apps/server/src/gather/objectHash.ts와 같은 32비트 굴림 */
function blockHash(mapKey: number, block: number, kind: number): number {
  const low = mapKey % 0x1_0000_0000;
  const high = Math.floor(mapKey / 0x1_0000_0000);
  const seed = mix32(mix32(low >>> 0) ^ Math.imul(high >>> 0, 0x85eb_ca6b) ^ 0x4f1b_bcdd);
  return mix32(seed ^ Math.imul(block + 1, 0x9e37_79b1) ^ Math.imul(kind + 1, 0xc2b2_ae35)) >>> 0;
}

const isWater = (surface: number | undefined): boolean =>
  surface === TERRAIN_SURFACE.water || surface === TERRAIN_SURFACE.shallowWater;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shoreDistances(surface: Uint8Array): Uint8Array {
  const out = new Uint8Array(TERRAIN_SIZE * TERRAIN_SIZE).fill(SHORE_CAP);
  let frontier: number[] = [];
  for (let cell = 0; cell < out.length; cell++) {
    if (isWater(surface[cell])) {
      out[cell] = 0;
      frontier.push(cell);
    }
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

function waterAt(surface: Uint8Array, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= PLACEMENT_SIZE || y >= PLACEMENT_SIZE) return false;
  return isWater(surface[(y >> 1) * TERRAIN_SIZE + (x >> 1)]);
}

function waterSegment(surface: Uint8Array, ax: number, ay: number, bx: number, by: number): boolean {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  for (let s = 0; s <= steps; s++) {
    const x = steps === 0 ? ax : ax + Math.trunc(((bx - ax) * s) / steps);
    const y = steps === 0 ? ay : ay + Math.trunc(((by - ay) * s) / steps);
    if (!waterAt(surface, x, y)) return false;
  }
  return true;
}

function schoolRoute(
  mapKey: number,
  surface: Uint8Array,
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
      const h = blockHash(mapKey, salt, j * SCHOOL_TRIES + attempt + 1);
      const x = homeX + (h % width) - range;
      const y = homeY + (Math.floor(h / 65_536) % width) - range;
      if (!waterAt(surface, x, y) || !waterSegment(surface, prevX, prevY, x, y)) continue;
      points.push(x, y);
      prevX = x;
      prevY = y;
      break;
    }
  }
  while (points.length > 2) {
    const lx = points[points.length - 2] ?? homeX;
    const ly = points[points.length - 1] ?? homeY;
    if (waterSegment(surface, lx, ly, homeX, homeY)) break;
    points.length -= 2;
  }
  const periodMs = schoolPeriodMs(schoolRouteLength(points), speed);
  return { points, periodMs, phaseMs: blockHash(mapKey, salt, 0) % periodMs };
}

export interface CellSpot {
  readonly x: number;
  readonly y: number;
}

export interface GatherPreviewResult {
  readonly objectProps: readonly ObjectProp[];
  readonly schools: readonly SchoolInput[];
  /** gather_objects 항목 ID → 이 2차맵에 놓인 자리 목록(개수·[맵에서 찾기]용) */
  readonly spotsById: ReadonlyMap<string, readonly CellSpot[]>;
  /** gather_objects 어군 항목 ID → 실시간 위치 계산용 SchoolInput 목록 */
  readonly schoolsById: ReadonlyMap<string, readonly SchoolInput[]>;
}

/** 팩 원본 gather_objects 항목들 + 현재 2차맵 지형 → 엔진에 넘길 site 소품·어군과 항목별 위치 */
export function buildGatherPreview(input: {
  readonly mapKey: number;
  readonly surface: Uint8Array;
  readonly art: Uint8Array | undefined;
  readonly biomeId: string | null;
  readonly waterBits: number;
  readonly gatherObjects: readonly JsonEntry[];
}): GatherPreviewResult {
  const { mapKey, surface, art, biomeId, waterBits, gatherObjects } = input;
  const spotsById = new Map<string, CellSpot[]>();
  const schoolsById = new Map<string, SchoolInput[]>();
  if (!biomeId) return { objectProps: [], schools: [], spotsById, schoolsById };

  const coastal = (waterBits & SEA_BITS) !== 0;
  const siteKinds: {
    readonly index: number;
    readonly id: string;
    readonly artCode: number;
    readonly chancePm: number;
    readonly surfaces: readonly number[];
    readonly shore: number;
  }[] = [];
  const schoolPlan: {
    readonly index: number;
    readonly id: string;
    readonly artCode: number;
    readonly count: number;
    readonly range: number;
    readonly speed: number;
  }[] = [];

  gatherObjects.forEach((entry, index) => {
    const id = typeof entry.id === "string" ? entry.id : "";
    const source = entry.source;
    const artName = typeof entry.art === "string" ? entry.art : "";
    const artCode = mapPropArtCode(artName);
    const biomes = Array.isArray(entry.biomes) ? entry.biomes.filter(isRecord) : [];
    const biomeRow = biomes.find((row) => row.biome === biomeId);
    if (!id || artCode <= 0 || !biomeRow) return;

    if (source === "site") {
      const chancePm = typeof biomeRow.chancePm === "number" ? biomeRow.chancePm : 0;
      if (chancePm <= 0 || (entry.coast === true && !coastal)) return;
      const surfaces = Array.isArray(entry.surfaces)
        ? entry.surfaces
            .map((name) => (typeof name === "string" ? SURFACE_BY_NAME[name] : undefined))
            .filter((code): code is number => code !== undefined)
        : [];
      if (surfaces.length === 0) return;
      const shore = typeof entry.shore === "number" ? entry.shore : 0;
      siteKinds.push({ index, id, artCode, chancePm, surfaces, shore });
    } else if (source === "school") {
      const count = typeof biomeRow.count === "number" ? Math.min(SCHOOL_ID_STRIDE, biomeRow.count) : 0;
      if (count <= 0) return;
      const range = typeof entry.range === "number" ? Math.max(1, entry.range) : 1;
      const speed = typeof entry.speed === "number" ? Math.max(1, entry.speed) : 1;
      schoolPlan.push({ index, id, artCode, count, range, speed });
    }
  });

  // ── 1. 지형별 채집 자리(site) ──
  const objectProps: ObjectProp[] = [];
  if (siteKinds.length > 0) {
    const validArt = art && art.length === PLACEMENT_SIZE * PLACEMENT_SIZE ? art : undefined;
    const shore = siteKinds.some((kind) => kind.shore > 0) ? shoreDistances(surface) : undefined;
    const taken = new Set<number>();
    const span = SITE_BLOCK_CELLS / PLACEMENT_PER_TERRAIN;
    const blocks = PLACEMENT_SIZE / SITE_BLOCK_CELLS;

    for (let by = 0; by < blocks; by++) {
      for (let bx = 0; bx < blocks; bx++) {
        const block = by * blocks + bx;
        const cx = bx * SITE_BLOCK_CELLS * 2 + SITE_BLOCK_CELLS;
        const cy = by * SITE_BLOCK_CELLS * 2 + SITE_BLOCK_CELLS;
        for (const kind of siteKinds) {
          if (blockHash(mapKey, block + SITE_SALT, kind.index) % 1000 >= kind.chancePm) continue;
          let best = -1;
          let bestDistance = 0;
          for (let ty = by * span; ty < (by + 1) * span; ty++) {
            for (let tx = bx * span; tx < (bx + 1) * span; tx++) {
              const terrainCell = ty * TERRAIN_SIZE + tx;
              if (!kind.surfaces.includes(surface[terrainCell] ?? -1)) continue;
              if (kind.shore > 0 && (shore?.[terrainCell] ?? SHORE_CAP) > kind.shore) continue;
              const x = tx * PLACEMENT_PER_TERRAIN + 1;
              const y = ty * PLACEMENT_PER_TERRAIN + 1;
              const cell = y * PLACEMENT_SIZE + x;
              if (taken.has(cell) || (validArt?.[cell] ?? 0) !== 0) continue;
              const dx = x * 2 + 1 - cx;
              const dy = y * 2 + 1 - cy;
              const distance = dx * dx + dy * dy;
              if (best < 0 || distance < bestDistance || (distance === bestDistance && cell < best)) {
                best = cell;
                bestDistance = distance;
              }
            }
          }
          if (best < 0) continue;
          taken.add(best);
          objectProps.push({ cell: best, art: kind.artCode });
          const list = spotsById.get(kind.id) ?? [];
          list.push({ x: best % PLACEMENT_SIZE, y: Math.floor(best / PLACEMENT_SIZE) });
          spotsById.set(kind.id, list);
        }
      }
    }
    objectProps.sort((a, b) => a.cell - b.cell);
  }

  // ── 2. 움직이는 어군(school) ──
  const schools: SchoolInput[] = [];
  if (schoolPlan.length > 0) {
    const water: number[] = [];
    for (let cell = 0; cell < TERRAIN_SIZE * TERRAIN_SIZE; cell++) {
      if (isWater(surface[cell])) water.push(cell);
    }
    if (water.length > 0) {
      for (const kind of schoolPlan) {
        const list = spotsById.get(kind.id) ?? [];
        const schoolList = schoolsById.get(kind.id) ?? [];
        for (let k = 0; k < kind.count; k++) {
          const salt = SCHOOL_SALT + kind.index * SCHOOL_ID_STRIDE + k;
          const home = water[blockHash(mapKey, salt, 0x5c) % water.length] ?? 0;
          const x = (home % TERRAIN_SIZE) * PLACEMENT_PER_TERRAIN + 1;
          const y = Math.floor(home / TERRAIN_SIZE) * PLACEMENT_PER_TERRAIN + 1;
          const route = schoolRoute(mapKey, surface, salt, x, y, kind.range, kind.speed);
          const school: SchoolInput = {
            id: SCHOOL_ID_BASE + kind.index * SCHOOL_ID_STRIDE + k,
            art: kind.artCode,
            ...route,
          };
          schools.push(school);
          schoolList.push(school);
          list.push({ x, y });
        }
        const interiorRank = (spot: CellSpot): number => {
          const margin = Math.min(spot.x, spot.y, PLACEMENT_SIZE - 1 - spot.x, PLACEMENT_SIZE - 1 - spot.y);
          return (
            (margin < 32 ? 1_000_000 : 0) + (spot.x - 128) * (spot.x - 128) + (spot.y - 128) * (spot.y - 128)
          );
        };
        const order = list
          .map((spot, idx) => ({ spot, school: schoolList[idx], score: interiorRank(spot) }))
          .toSorted((a, b) => a.score - b.score);
        spotsById.set(
          kind.id,
          order.map((item) => item.spot),
        );
        schoolsById.set(
          kind.id,
          order.map((item) => item.school).filter((item): item is SchoolInput => item !== undefined),
        );
      }
    }
  }

  return { objectProps, schools, spotsById, schoolsById };
}

export interface ArtPlacementSummary {
  readonly count: number;
  /** 카메라 이동([맵에서 찾기])용 대표 좌표 표본(최대 24개, 안쪽·가운데 가까운 서로 떨어진 자리) */
  readonly samples: readonly CellSpot[];
}

/** 2차맵 소품 그림 층(256²) → 그림 번호별 개수와 안쪽 대표 좌표 표본(가장자리 하늘이 잡히지 않게 안쪽 우선) */
export function summarizeArtLayer(art: Uint8Array | undefined): ReadonlyMap<number, ArtPlacementSummary> {
  const counts = new Map<number, number>();
  // 256×256을 16×16 구역(256구역)으로 나눠 구역마다 가장 가운데 가까운 한 칸만 대표로 뽑는다
  const gridBuckets = new Map<number, Map<number, CellSpot>>();
  if (!art) return new Map();

  const total = Math.min(art.length, PLACEMENT_SIZE * PLACEMENT_SIZE);
  for (let cell = 0; cell < total; cell++) {
    const code = art[cell] ?? 0;
    if (code <= 0) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
    const x = cell % PLACEMENT_SIZE;
    const y = Math.floor(cell / PLACEMENT_SIZE);
    const bucket = (y >> 4) * 16 + (x >> 4);
    let byBucket = gridBuckets.get(code);
    if (!byBucket) {
      byBucket = new Map();
      gridBuckets.set(code, byBucket);
    }
    const prev = byBucket.get(bucket);
    const d2 = (x - 128) * (x - 128) + (y - 128) * (y - 128);
    if (!prev || d2 < (prev.x - 128) * (prev.x - 128) + (prev.y - 128) * (prev.y - 128)) {
      byBucket.set(bucket, { x, y });
    }
  }
  const out = new Map<number, ArtPlacementSummary>();
  for (const [code, count] of counts) {
    const all = [...(gridBuckets.get(code)?.values() ?? [])];
    // 가장자리(0..31, 224..255)보다 안쪽(32..223)을 우선하고, 그 안에서 가운데(128, 128) 가까운 순
    const rank = (spot: CellSpot): number => {
      const margin = Math.min(spot.x, spot.y, PLACEMENT_SIZE - 1 - spot.x, PLACEMENT_SIZE - 1 - spot.y);
      const edgePenalty = margin < 32 ? 1_000_000 : 0;
      return edgePenalty + (spot.x - 128) * (spot.x - 128) + (spot.y - 128) * (spot.y - 128);
    };
    const samples = all.toSorted((a, b) => rank(a) - rank(b)).slice(0, 24);
    out.set(code, { count, samples });
  }
  return out;
}
