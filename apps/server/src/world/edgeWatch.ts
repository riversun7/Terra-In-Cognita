// 변 가까운 플레이어 유닛 살피기 — 옆 2차맵 미리 띄우기와 경계 너머 시야(docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-12)").
// 사용자 요구(map-seamless-2, 2026-11-11 "근처에서 미리 불러와 완전히 자연스럽게"): 도시가 떨어져 서면서(도시 배후지 간격) 시작 도시 옆 2차맵은
// 대개 띄우지 않은 들판이라, 기기가 이웃을 구독하면 unknown_map으로 거절되고 넘는 순간까지 온통 어두웠다.
// - 색인: 2차맵마다 "변 가까이 서거나 변 가까이까지 걷는" 플레이어 유닛(사용자 유닛 — 봇·NPC 휴먼·지도자는 빼고). 2차맵이 유닛의 움직임이
//   바뀔 때(setMotion — 명령·2차맵 사이 이동 구간·멈춤·새로 섬)만 부른다(moved). 그 움직임의 꺾이는 점들이 든 네모가 변에서 얼마나 먼지로
//   본다(곧은 선 경로라 네모 = 경로가 닿는 가장 바깥). 틱마다 모든 유닛을 훑지 않는다. 다른 2차맵으로 넘거나 사라진 유닛은 읽을 때 지운다.
// - 미리 띄우기: 그 네모가 변에서 설정 칸 map_preopen_cells(배치 칸) 안이면 그 변 너머 2차맵을 그때 띄우기(mapSpawn.ts openEarly)로 띄운다 —
//   변을 넘으러 가는 길(2차맵 사이 이동 구간의 끝은 변 끝 칸, 더 먼 목적지도 같다)과 변 가까이 서는 것을 함께 잡는다. 1분마다(그때 띄우기의
//   살피기) 색인을 다시 보아 못 띄웠던 것(상한·부팅 중)을 다시 해 본다. 변 이웃 넷만(대각선은 시야도 넘기도 변을 거친다).
// - 붙잡기: 플레이어 유닛이 지금(또는 걷는 길의 끝이) 그 변에서 map_preopen_cells 안에 있는 동안 그 이웃은 내리지 않는다(holds).
// - 바뀜(기획 D-559 1619, docs/adr/2026-11-15-unloaded-second-maps.md 2절): 미리 띄우기·붙잡기는 그 유닛의 주인이 지금 그 2차맵을 볼 때만
//   (watching). 보지 않으면 변을 넘을 때 좌표 유닛이 된다(아무도 보지 않는 2차맵은 띄우지 않는다). 경계 너머 시야는 그대로.
// - 경계 너머 시야(sight): 이웃 B를 볼 때, B의 변 이웃 A에 선 색인 유닛 가운데 시야 원이 B에 닿는 것(변에서 BORDER_SIGHT_UNITS 안)의 지금
//   자리를 B의 늘인 틀(travel/frame.ts neighbourFrame — 면 경계의 돌림·뒤집힘 포함)로 옮겨 준다. 시야 판정(vision.ts)이 그 원을 B의 덮개에
//   더한다. 시야 틱(1초) 안에서는 센 것을 다시 쓴다.
// 판정 규칙이 아니라 서버가 2차맵을 언제 띄우는지와 시야 원을 어디에 찍는지다. 값은 정수(단위·칸)만 쓴다.
import { PLACEMENT_SUBLEVELS } from "@terra/planet";
import { stepMapCell } from "@terra/planet/secondMap";
import { CELL_UNITS, type Motion, PLACEMENT_SIZE, type Point, positionAt } from "@terra/sim";
import { type Frame, MAP_UNITS, SIDES, applyFrame, neighbourFrame } from "../travel/frame.ts";
import type { SecondMap } from "./secondMap.ts";
import { BORDER_SIGHT_UNITS, type BorderSight } from "./borderSight.ts";

/** 경계 너머 시야를 센 것을 다시 쓰는 시간(ms, 시야 틱 안) */
const SIGHT_REUSE_MS = 250;
/** 이웃 키·틀 기억 상한(넘으면 비운다 — 다시 센다) */
const CACHE_LIMIT = 4_096;

/** 2차맵이 알리는 봇 아닌 유닛 */
export interface EdgeUnit {
  readonly id: number;
  readonly ownerId: number;
  readonly motion: Motion;
}

/** 2차맵(secondMap.ts)이 부르는 고리 */
export interface EdgeHooks {
  /** 봇 아닌 유닛의 움직임이 바뀌었다(새로 섰다·넘어왔다 포함) */
  moved(mapKey: number, unit: EdgeUnit): void;
  /** 옆 2차맵에 선 플레이어 유닛 가운데 시야가 이 2차맵에 닿는 것(이 2차맵 늘인 틀의 자리) */
  sight(mapKey: number, at: number): readonly BorderSight[];
}

export interface EdgeWatch extends EdgeHooks {
  /** 내리면 안 되나: 플레이어 유닛이 지금(또는 길 끝이) 이 2차맵과 나눈 변에서 미리 띄우기 거리 안 */
  holds(mapKey: number, at: number): boolean;
  /** 색인을 다시 보아 띄워야 할 이웃을 띄운다(1분마다·부팅 뒤). mapKey가 있으면 그 2차맵만(누가 그 2차맵을 보기 시작함). 띄우기를 부른 수 */
  reconcile(at: number, mapKey?: number): number;
  /** 이미 띄운 2차맵들의 봇 아닌 유닛을 색인에 넣는다(부팅 — 2차맵이 고리보다 먼저 만들어졌다) */
  seed(maps: Iterable<SecondMap>): void;
  takeMetrics(): Record<string, number>;
}

export interface EdgeWatchDeps {
  readonly maps: ReadonlyMap<number, SecondMap>;
  /** 플레이어(사용자) 소유 주체인가 */
  isPlayer(ownerId: number): boolean;
  /** 미리 띄우기 거리(배치 칸, 설정 칸 map_preopen_cells — 실효 값). 0이면 미리 띄우지 않는다(시야는 그대로) */
  preopenCells(): number;
  /** 그때 띄울 수 있나(이 행성의 2차맵 키이고 아직 띄우지 않음) */
  canOpen(mapKey: number): boolean;
  /** 미리 띄운다(mapSpawn.ts openEarly — 같은 2차맵을 함께 불러도 한 번) */
  openEarly(mapKey: number): void;
  /** 그 주인이 지금 그 2차맵을 보고 있나. 없으면 늘 본다고 친다(옛 규칙) */
  readonly watching?: ((mapKey: number, ownerId: number) => boolean) | undefined;
}

/** 그 변(SIDES 차례) 너머 2차맵 키: 변 가운데 칸에서 한 걸음(면 경계 포함, stepMapCell). 없으면 null */
export function sideNeighbour(mapKey: number, side: number): number | null {
  const step = SIDES[side];
  if (!step) return null;
  const last = PLACEMENT_SIZE - 1;
  const middle = PLACEMENT_SIZE >> 1;
  const x = step.dx > 0 ? last : step.dx < 0 ? 0 : middle;
  const y = step.dy > 0 ? last : step.dy < 0 ? 0 : middle;
  return stepMapCell(mapKey, PLACEMENT_SUBLEVELS, x, y, step.dx, step.dy)?.mapKey ?? null;
}

/** 변 넷(SIDES 차례: +x, −x, +y, −y)마다 점들이 변에서 가장 가까운 거리(단위) */
function sideGaps(points: readonly Point[]): [number, number, number, number] {
  let minX = MAP_UNITS;
  let maxX = 0;
  let minY = MAP_UNITS;
  let maxY = 0;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return [MAP_UNITS - maxX, minX, MAP_UNITS - maxY, minY];
}

/** 점 하나가 그 변(SIDES 차례)에서 먼 거리(단위) */
function sideGap(point: Point, side: number): number {
  return sideGaps([point])[side] ?? MAP_UNITS;
}

export function createEdgeWatch(deps: EdgeWatchDeps): EdgeWatch {
  const { maps } = deps;
  /** 2차맵 → 유닛 ID → (주인, 가까운 변 비트) */
  const index = new Map<number, Map<number, { ownerId: number; sides: number }>>();
  /** 2차맵 → 변 넷 너머 2차맵 키(없으면 null) */
  const across = new Map<number, (number | null)[]>();
  /** "B,A" → A 틀 점을 B 늘인 틀로(neighbourFrame(B, A)) */
  const frames = new Map<string, Frame | null>();
  const sightMemo = new Map<number, { at: number; list: readonly BorderSight[] }>();
  let counts = { preopens: 0 };

  const preopenUnits = (): number => Math.max(0, Math.trunc(deps.preopenCells())) * CELL_UNITS;
  /** 색인에 넣는 거리: 미리 띄우기 거리와 시야가 넘는 거리 가운데 먼 것 */
  const watchUnits = (): number => Math.max(preopenUnits(), BORDER_SIGHT_UNITS);

  const neighbours = (mapKey: number): (number | null)[] => {
    let known = across.get(mapKey);
    if (!known) {
      known = SIDES.map((_, side) => sideNeighbour(mapKey, side));
      if (across.size >= CACHE_LIMIT) across.clear();
      across.set(mapKey, known);
    }
    return known;
  };

  const frameOf = (to: number, from: number): Frame | null => {
    const key = `${to},${from}`;
    if (frames.has(key)) return frames.get(key) ?? null;
    const frame = neighbourFrame(to, from);
    if (frames.size >= CACHE_LIMIT) frames.clear();
    frames.set(key, frame);
    return frame;
  };

  const watched = (mapKey: number, ownerId: number): boolean => deps.watching?.(mapKey, ownerId) ?? true;

  const open = (from: number, side: number): void => {
    const next = neighbours(from)[side];
    if (next === null || next === undefined || maps.has(next) || !deps.canOpen(next)) return;
    counts.preopens += 1;
    deps.openEarly(next);
  };

  /** 그 유닛이 지금 가까운 변(미리 띄우기 거리): 지금 자리와 길 끝 */
  const nearSides = (motion: Motion, at: number): number[] => {
    const reach = preopenUnits();
    if (reach <= 0) return [];
    const gaps = sideGaps([positionAt(motion, at), motion.waypoints.at(-1) ?? positionAt(motion, at)]);
    return gaps.flatMap((gap, side) => (gap <= reach ? [side] : []));
  };

  /** A에 선 색인 유닛 가운데 B 쪽 변 비트가 선 것(사라진 것은 지운다) */
  const facing = function* (from: number, to: number) {
    const units = index.get(from);
    const map = maps.get(from);
    if (!units || !map) return;
    const side = neighbours(from).indexOf(to);
    if (side < 0) return;
    for (const [id, entry] of units) {
      if ((entry.sides & (1 << side)) === 0) continue;
      const info = map.unitInfo(id);
      if (!info) {
        units.delete(id);
        continue;
      }
      yield { side, motion: info.motion, ownerId: info.ownerId };
    }
  };

  /** 색인에 넣거나 뺀다. openNow면 가까운 변 너머를 띄운다(부팅 색인은 띄우지 않는다 — 첫 reconcile이 띄운다) */
  const note = (mapKey: number, unit: EdgeUnit, openNow: boolean): void => {
    const units = index.get(mapKey);
    if (!deps.isPlayer(unit.ownerId)) {
      units?.delete(unit.id);
      return;
    }
    const gaps = sideGaps(unit.motion.waypoints);
    const watch = watchUnits();
    let sides = 0;
    for (const [side, gap] of gaps.entries()) if (gap <= watch) sides |= 1 << side;
    if (sides === 0) {
      units?.delete(unit.id);
      return;
    }
    if (units) units.set(unit.id, { ownerId: unit.ownerId, sides });
    else index.set(mapKey, new Map([[unit.id, { ownerId: unit.ownerId, sides }]]));
    sightMemo.clear();
    const reach = preopenUnits();
    if (reach <= 0 || !openNow || !watched(mapKey, unit.ownerId)) return;
    for (const [side, gap] of gaps.entries()) if (gap <= reach) open(mapKey, side);
  };

  return {
    moved: (mapKey, unit) => note(mapKey, unit, true),
    sight(mapKey, at) {
      const memo = sightMemo.get(mapKey);
      if (memo && at >= memo.at && at - memo.at < SIGHT_REUSE_MS) return memo.list;
      const list: BorderSight[] = [];
      for (const from of neighbours(mapKey)) {
        if (from === null || !maps.has(from)) continue;
        const frame = frameOf(mapKey, from);
        if (!frame) continue;
        for (const unit of facing(from, mapKey)) {
          const here = positionAt(unit.motion, at);
          if (sideGap(here, unit.side) > BORDER_SIGHT_UNITS) continue;
          const there = applyFrame(frame, here);
          list.push({ ownerId: unit.ownerId, x: there.x, y: there.y });
        }
      }
      if (sightMemo.size >= CACHE_LIMIT) sightMemo.clear();
      sightMemo.set(mapKey, { at, list });
      return list;
    },
    holds(mapKey, at) {
      for (const from of neighbours(mapKey)) {
        if (from === null) continue;
        for (const unit of facing(from, mapKey))
          if (nearSides(unit.motion, at).includes(unit.side) && watched(from, unit.ownerId)) return true;
      }
      return false;
    },
    reconcile(at, only) {
      const before = counts.preopens;
      for (const [mapKey, units] of index) {
        if (only !== undefined && mapKey !== only) continue;
        const map = maps.get(mapKey);
        if (!map) {
          index.delete(mapKey);
          continue;
        }
        for (const id of units.keys()) {
          const info = map.unitInfo(id);
          if (!info) {
            units.delete(id);
            continue;
          }
          if (watched(mapKey, info.ownerId))
            for (const side of nearSides(info.motion, at)) open(mapKey, side);
        }
        if (units.size === 0) index.delete(mapKey);
      }
      return counts.preopens - before;
    },
    seed(list) {
      for (const map of list) map.forEachUnit((unit) => note(map.mapKey, unit, false));
    },
    takeMetrics() {
      let indexed = 0;
      for (const units of index.values()) indexed += units.size;
      const out = { edgeUnits: indexed, mapPreopenAsks: counts.preopens };
      counts = { preopens: 0 };
      return out;
    },
  };
}
