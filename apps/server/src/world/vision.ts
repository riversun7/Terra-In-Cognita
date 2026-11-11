// 2차맵 시야 전송 — docs/adr/2026-10-31-s3-server-stage.md 3절 (ADR 7 "시야 판정으로 거른다", ADR 26 "2차맵부터 서버가 확인")
// - 시야 묶음마다 전송(mapStream) 하나를 쓴다. 묶음 = 사용자 한 명(S3, 탐사 기록·내 유닛 표시가 사람마다 다르다). 관리자 전체 보기는
//   2차맵의 원래 전송(거르지 않음)을 쓴다.
// - 같은 나라 시야 공유(기획 정리 질문 746 나 "같은 나라 시민 시야 공유", S3-Q1 기본안 "같은 국가 전체", D-250, docs/adr/2026-11-08-citizenship.md):
//   보는 사람의 나라(viewer.nations)가 있으면 그 나라 소유 주체들(NPC 국가 주체 = 그 나라 휴먼·지도자·시설, 같은 나라 유저 = 그 사람 유닛·건물)이
//   덮는 칸을 내 시야에 더한다. 나라 덮개는 이 2차맵에서 나라 하나에 시야 틱마다 한 번만 센다(그 나라 무리가 몇이든 — 무리마다 세지 않는다).
//   탐사 기록은 그대로 내 유닛·건물의 시야로만 채운다(S3-Q2). 남의 유닛·건물을 보는 판정(전송·sees·sighted)이 공유 시야를 쓴다.
// - 내 유닛은 경로 전체(S1 그대로). 남의 유닛은 지금 내 시야 칸에 들어 있을 때만, 경로를 덮인 칸을 벗어나는 곳 또는
//   CLIP_HORIZON_MS 뒤에서 잘라 보낸다(until). 남은 몫이 RESEND_BELOW_MS보다 적거나 경로가 바뀌면 다음 구간, 안 보이면 hidden.
// - 시야 틱(VISION_TICK_MS)마다 덮인 칸을 다시 계산한다. 남의 유닛 경로가 바뀌면 그 묶음에 보이는 동안은 곧바로 다시 자른다.
// - 탐사 기록(사용자마다 128바이트)은 내 유닛·건물의 시야로만 채운다(기술 기본안, 기획 질문 S3-Q2). 바뀌면 vision 메시지로
//   알리고 EXPLORED_SAVE_MS마다 저장한다. 건물은 탐사한 칸에 있으면 보낸다(마지막 본 모습 D-152는 뒤로 미뤘다).
// - 볼 수 있는지(구독·지형 파일): 전체 보기 권한, 이 2차맵에 내 유닛·건물이 있음, 한 칸이라도 탐사함(사용자 결정 U3), 같은 나라
//   유닛·건물이 있음(같은 나라 시야 공유), 옆 2차맵에 선 내 유닛의 시야가 경계를 넘어 이 2차맵에 닿음(아래).
// - 경계 너머 시야(docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-12)"): 옆 2차맵 변 가까이 선 플레이어 유닛의 시야 원이 이
//   2차맵에 닿으면(source.border — world/edgeWatch.ts가 그 유닛 자리를 이 2차맵의 늘인 틀로 옮겨 준다) 그 몫을 내 덮개에 더한다. 그래서
//   그 몫은 내 유닛이 이 2차맵에 선 것과 같다: 탐사 기록에 남고, 그 안의 남의 유닛·건물이 보이고, 이 2차맵을 볼 수 있다(구독). 같은 나라
//   덮개도 같은 나라 사람 유닛의 경계 너머 시야를 품는다. 원 모양·반지름은 2차맵 안 시야와 같다(경계에서 잘리지 않는다).
import { type BuildingWire, type UnitMotionWire, VISION_BYTES, encodeMessage } from "@terra/protocol";
import {
  BUILDING_VISION_CELLS,
  type BuildingPlacement,
  CELL_UNITS,
  type Motion,
  type Point,
  UNIT_VISION_CELLS,
  VISION_CELLS,
  VISION_CELL,
  VISION_SIDE,
  addCoverBits,
  arrivalAt,
  footprintRect,
  hasBit,
  positionAt,
  stampVision,
  truncateMotion,
  visibleUntil,
  visionCellOf,
  visionRadius,
} from "@terra/sim";
import { type MapStream, type StreamStats, type StreamSubscriber, createMapStream } from "./mapStream.ts";
import { type SizedEntry, motionToWire, sized } from "./wire.ts";

export const VISION_TICK_MS = 1_000;
/** 남의 경로를 앞으로 보내는 상한(ms) */
export const CLIP_HORIZON_MS = 8_000;
/** 보낸 몫이 이보다 적게 남으면 다음 구간을 보낸다 */
export const RESEND_BELOW_MS = 3_000;
const CLIP_STEP_MS = 250;
/** 탐사 기록을 저장하는 간격 */
export const EXPLORED_SAVE_MS = 10_000;

/** 소유 주체 → 나라(세력 행 ID). 나라가 없으면 undefined(같은 나라 시야 공유 없음). nationVision.ts가 월드 저장 층으로 만든다 */
export type NationLookup = (ownerId: number) => number | undefined;

const UNIT_RADIUS = visionRadius(UNIT_VISION_CELLS);
const BUILDING_RADIUS = visionRadius(BUILDING_VISION_CELLS);
/** 시야 칸 한 변(단위) */
const UNITS_PER_VISION_CELL = VISION_CELL * CELL_UNITS;
/** 유닛 시야 원이 2차맵 밖에서 경계 너머에 닿는 가장 먼 거리(단위, 변에서) — edgeWatch.ts가 이 안의 유닛만 준다 */
export const BORDER_SIGHT_UNITS = UNIT_RADIUS * UNITS_PER_VISION_CELL;

/** 옆 2차맵에 선 내 유닛 하나의 시야 자리: 이 2차맵의 늘인 틀(단위, 2차맵 밖) — world/edgeWatch.ts */
export interface BorderSight {
  readonly ownerId: number;
  readonly x: number;
  readonly y: number;
}

/** 2차맵 밖 자리의 유닛 시야 원을 덮개에 더한다(2차맵 안 칸만 — stampVision과 같은 원, 가운데가 밖이어도 된다) */
function stampBorder(cover: Uint16Array, sight: BorderSight): void {
  const cx = Math.floor(sight.x / UNITS_PER_VISION_CELL);
  const cy = Math.floor(sight.y / UNITS_PER_VISION_CELL);
  const limit = UNIT_RADIUS * UNIT_RADIUS + UNIT_RADIUS;
  for (let dy = -UNIT_RADIUS; dy <= UNIT_RADIUS; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= VISION_SIDE) continue;
    for (let dx = -UNIT_RADIUS; dx <= UNIT_RADIUS; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= VISION_SIDE || dx * dx + dy * dy > limit) continue;
      const index = y * VISION_SIDE + x;
      cover[index] = (cover[index] ?? 0) + 1;
    }
  }
}

export interface VisionUnit {
  readonly id: number;
  readonly ownerId: number;
  readonly size: UnitMotionWire["size"];
  readonly motion: Motion;
  readonly entry: SizedEntry<UnitMotionWire>;
}

export interface VisionBuilding {
  readonly id: number;
  readonly ownerId: number | null;
  readonly placement: BuildingPlacement;
  readonly entry: SizedEntry<BuildingWire>;
}

/** 2차맵이 주는 지금 상태 */
export interface VisionSource {
  units(): Iterable<VisionUnit>;
  unit(id: number): VisionUnit | undefined;
  buildings(): Iterable<VisionBuilding>;
  /** 옆 2차맵에 선 플레이어 유닛 가운데 시야가 이 2차맵에 닿는 것(경계 너머 시야, world/edgeWatch.ts). 없으면 없음 */
  border?: ((at: number) => readonly BorderSight[]) | undefined;
}

/** 탐사 기록 저장(월드 쓰기 대기열). 없으면 메모리에만 */
export interface ExploredStore {
  load(userId: string): Promise<Uint8Array | null>;
  save(userId: string, bits: Uint8Array): void;
}

/** 시야로 거를 사람 */
export interface VisionViewer {
  readonly userId: string;
  /** 그 사용자의 소유 주체(없으면 내 유닛 없음) */
  readonly ownerId: number | undefined;
  /** 같은 나라 시야 공유(질문 746 나): 소유 주체 → 나라. 보는 사람의 나라 = nations(ownerId). 없으면 내 시야만 */
  readonly nations?: NationLookup | undefined;
}

export interface MapVision {
  /** 이 사용자가 이 2차맵을 볼 수 있는가(탐사 기록을 먼저 읽는다) */
  canView(viewer: VisionViewer): Promise<boolean>;
  /**
   * 이 사용자가 아는 시야 칸 비트(탐사 기록 ∪ 지금 내 유닛·건물의 시야, VISION_BYTES 사본). 1차맵 도시 안개가 도시 자리를 본다
   * (docs/adr/2026-11-07-play-flow.md "WP7")
   */
  sighted(viewer: VisionViewer): Promise<Uint8Array>;
  /**
   * 이 사람이 지금 이 유닛을 보는가: 내 유닛이거나 지금 내 유닛·건물의 시야 칸 안(시야 전송이 보내는 것과 같은 규칙). 없는 유닛이면 false.
   * 남의 유닛 한눈 정보(질문 636 나, docs/adr/2026-11-07-unit-control.md "바뀜 (기획 답 630~637)")가 묻는다
   */
  sees(viewer: VisionViewer, unitId: number): boolean;
  subscribe(subscriber: StreamSubscriber, viewer: VisionViewer): void;
  unsubscribe(subscriber: StreamSubscriber): void;
  unitChanged(unit: VisionUnit): void;
  /** 유닛이 세계에서 사라졌다(NPC 휴먼 사망): 보던 무리에 숨김으로 보낸다 */
  unitRemoved(unitId: number, ownerId: number): void;
  /**
   * 내 유닛이 지나간 자리(points, 단위)의 시야를 그 사용자 탐사 기록에 더한다 — 구독하지 않아도(2차맵 사이 이동이 지나간 2차맵·정찰이 본
   * 2차맵, docs/adr/2026-11-07-play-flow.md "WP11", 질문 591 나). 바뀌면 바로 저장하고 보던 무리에 알린다. 바뀌었으면 true
   */
  explore(userId: string, points: Iterable<Point>): Promise<boolean>;
  buildingPlaced(building: VisionBuilding): void;
  buildingRemoved(buildingId: number): void;
  /** 시험용: 시야 틱 한 번 */
  tick(): void;
  readonly groupCount: number;
  close(): void;
}

interface SentUnit {
  readonly motion: Motion;
  /** 보낸 경로의 끝 시각. 서 있는 유닛은 무한 */
  readonly until: number;
}

interface Group {
  readonly key: string;
  readonly viewer: VisionViewer;
  readonly stream: MapStream;
  readonly subscribers: Set<StreamSubscriber>;
  rev: number;
  /** 지금 보내 둔 남의 유닛 */
  readonly visible: Map<number, SentUnit>;
  /** 지금 보내 둔 건물 */
  readonly buildings: Set<number>;
  /** 남의 유닛·건물을 보는 시야 칸(같은 나라 공유가 있으면 나라 덮개 — 읽기만) */
  cover: Uint16Array;
  /** 같은 나라 시야 공유(지금 시야 틱의 나라 덮개·소속). 나라가 없으면 undefined */
  share: NationShare | undefined;
  explored: Uint8Array;
  exploredDirty: boolean;
}

/** 나라 하나의 시야 틱 몫: 덮개와 소유 주체 소속(묻은 것만 기억) */
interface NationShare {
  readonly at: number;
  readonly nation: number;
  readonly cover: Uint16Array;
  readonly members: Map<number, boolean>;
  readonly lookup: NationLookup;
}

/** 그 소유 주체가 이 나라 소속인가(시야 틱 하나 동안 주체마다 한 번만 묻는다) */
function isMember(share: NationShare, ownerId: number): boolean {
  let known = share.members.get(ownerId);
  if (known === undefined) {
    known = share.lookup(ownerId) === share.nation;
    share.members.set(ownerId, known);
  }
  return known;
}

/** 내 유닛 항목(own 표시를 붙인다. 기기는 이 유닛에 이동 명령을 보낼 수 있다) */
const ownEntry = (unit: VisionUnit): SizedEntry<UnitMotionWire> => sized({ ...unit.entry.value, own: true });

const encodeBits = (bits: Uint8Array): string =>
  Buffer.from(bits.buffer, bits.byteOffset, bits.byteLength).toString("base64");

/** 묶음 열쇠: 사용자 + 소유 주체(사이보그를 만들어 주체가 생기면 새 묶음이 된다. 기기는 다시 구독한다) */
function groupKeyOf(viewer: VisionViewer): string {
  return `u:${viewer.userId}:${viewer.ownerId ?? "-"}`;
}

/** 보는 사람의 나라(소유 주체가 없거나 나라가 없으면 undefined) */
const nationOf = (viewer: VisionViewer): number | undefined =>
  viewer.ownerId === undefined ? undefined : viewer.nations?.(viewer.ownerId);

/** 그 사람의 소유 주체 것인가 */
const owns = (viewer: VisionViewer, ownerId: number | null): boolean =>
  viewer.ownerId !== undefined && ownerId === viewer.ownerId;

/** 건물이 든 시야 칸(발자국 가운데). 건물 겉모습 조회(facilities/mapLooks.ts)도 같은 규칙으로 거른다 */
export const buildingCell = (placement: BuildingPlacement): number => {
  const rect = footprintRect(placement);
  const cx = Math.min(VISION_SIDE - 1, Math.floor((rect.x + rect.width / 2) / VISION_CELL));
  const cy = Math.min(VISION_SIDE - 1, Math.floor((rect.y + rect.height / 2) / VISION_CELL));
  return cy * VISION_SIDE + cx;
};

export function createMapVision(options: {
  mapKey: number;
  terrain: { url: string; generatorVersion: number };
  source: VisionSource;
  now: () => number;
  stats: StreamStats;
  explored?: ExploredStore | undefined;
}): MapVision {
  const { mapKey, source, now } = options;
  const groups = new Map<string, Group>();
  const bySubscriber = new Map<StreamSubscriber, Group>();
  /** 사용자마다 탐사 기록(이 2차맵) */
  const exploredOf = new Map<string, Uint8Array>();
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let lastSave = now();
  /** 나라 덮개(나라 → 센 시각·덮개·소속). 시야 틱 하나 동안 다시 쓴다(무리마다 다시 세지 않는다) */
  const nationShares = new Map<number, NationShare>();

  const loadExplored = async (userId: string): Promise<Uint8Array> => {
    const known = exploredOf.get(userId);
    if (known) return known;
    const stored = await options.explored?.load(userId);
    const bits =
      exploredOf.get(userId) ??
      (stored && stored.length === VISION_BYTES ? stored : new Uint8Array(VISION_BYTES));
    exploredOf.set(userId, bits);
    return bits;
  };

  /** 보이는 건물: 내 것, 탐사한 칸, 지금 시야(같은 나라 공유 포함) 칸 */
  const buildingVisible = (group: Group, building: VisionBuilding): boolean => {
    if (owns(group.viewer, building.ownerId)) return true;
    const cell = buildingCell(building.placement);
    return hasBit(group.explored, cell) || (group.cover[cell] ?? 0) > 0;
  };

  /** 그 소유 주체의 유닛·건물이 지금 덮는 시야 칸 */
  const coverOf = (ownerId: number | undefined): Uint16Array => {
    const cover = new Uint16Array(VISION_CELLS);
    if (ownerId === undefined) return cover;
    const at = now();
    for (const unit of source.units()) {
      if (unit.ownerId === ownerId)
        stampVision(cover, visionCellOf(positionAt(unit.motion, at)), UNIT_RADIUS);
    }
    for (const building of source.buildings()) {
      if (building.ownerId === ownerId) stampVision(cover, buildingCell(building.placement), BUILDING_RADIUS);
    }
    for (const sight of source.border?.(at) ?? []) if (sight.ownerId === ownerId) stampBorder(cover, sight);
    return cover;
  };
  const computeCover = (group: Group): Uint16Array => coverOf(group.viewer.ownerId);

  /**
   * 그 사람 나라의 시야 틱 몫: 그 나라 소유 주체들의 유닛·건물이 지금 덮는 시야 칸. 시야 틱 하나(VISION_TICK_MS) 안에서는 센 것을 다시
   * 쓴다(같은 나라 무리가 몇이든 2차맵마다 한 번). 소유 주체마다 나라를 한 번만 묻는다(유닛은 많고 주체는 적다). 나라가 없으면 undefined
   */
  const shareFor = (viewer: VisionViewer): NationShare | undefined => {
    const nation = nationOf(viewer);
    const lookup = viewer.nations;
    if (nation === undefined || !lookup) return undefined;
    const at = now();
    const cached = nationShares.get(nation);
    if (cached && at - cached.at < VISION_TICK_MS && at >= cached.at) return cached;
    const share: NationShare = {
      at,
      nation,
      cover: new Uint16Array(VISION_CELLS),
      members: new Map(),
      lookup,
    };
    for (const unit of source.units()) {
      if (isMember(share, unit.ownerId))
        stampVision(share.cover, visionCellOf(positionAt(unit.motion, at)), UNIT_RADIUS);
    }
    for (const building of source.buildings()) {
      if (building.ownerId !== null && isMember(share, building.ownerId))
        stampVision(share.cover, buildingCell(building.placement), BUILDING_RADIUS);
    }
    for (const sight of source.border?.(at) ?? [])
      if (isMember(share, sight.ownerId)) stampBorder(share.cover, sight);
    nationShares.set(nation, share);
    options.stats.visionNationCovers += 1;
    return share;
  };

  /**
   * 남의 유닛·건물을 보는 시야 = 내 덮개 + 같은 나라 덮개. 내 소유 주체도 그 나라라 나라 덮개가 내 덮개를 품는다 → 나라가 있으면 나라
   * 덮개(여러 무리가 같은 배열을 읽기만 한다), 없으면 내 덮개
   */
  const sightOf = (viewer: VisionViewer, own: Uint16Array): Uint16Array => shareFor(viewer)?.cover ?? own;

  /** 남의 유닛 하나를 지금 덮인 칸으로 잘라 본다. 안 보이면 undefined */
  const clip = (
    group: Group,
    unit: VisionUnit,
  ): { sent: SentUnit; entry: SizedEntry<UnitMotionWire> } | undefined => {
    // 같은 나라 유닛은 늘 보인다(제 시야가 제 자리를 덮는다): 내 유닛처럼 경로 전체를 보내고 경로가 바뀔 때만 다시 보낸다(3초마다 자르지 않는다)
    if (group.share && isMember(group.share, unit.ownerId))
      return { sent: { motion: unit.motion, until: Number.POSITIVE_INFINITY }, entry: unit.entry };
    const at = now();
    const covered = (cell: number) => (group.cover[cell] ?? 0) > 0;
    if (at >= arrivalAt(unit.motion)) {
      if (!covered(visionCellOf(positionAt(unit.motion, at)))) return undefined;
      return { sent: { motion: unit.motion, until: Number.POSITIVE_INFINITY }, entry: unit.entry };
    }
    const until = visibleUntil(unit.motion, at, covered, CLIP_HORIZON_MS, CLIP_STEP_MS);
    if (until === undefined) return undefined;
    const cut = truncateMotion(unit.motion, at, Math.max(at, until));
    return {
      sent: { motion: unit.motion, until },
      entry: sized({ ...motionToWire(unit.id, unit.size, cut, unit.entry.value.kind), until }),
    };
  };

  const showUnit = (group: Group, unit: VisionUnit): void => {
    const result = clip(group, unit);
    if (!result) {
      hideUnit(group, unit.id);
      return;
    }
    group.visible.set(unit.id, result.sent);
    group.rev += 1;
    group.stream.unitChanged(group.rev, result.entry);
  };

  const hideUnit = (group: Group, unitId: number): void => {
    if (!group.visible.delete(unitId)) return;
    group.rev += 1;
    group.stream.unitHidden(group.rev, unitId);
  };

  const sendVision = (group: Group): void => {
    const text = encodeMessage({ t: "vision", mapKey, explored: encodeBits(group.explored) });
    for (const subscriber of group.subscribers) subscriber.send(text);
  };

  /** 새로 탐사한 칸의 건물을 그 무리에 보낸다 */
  const revealBuildings = (group: Group): void => {
    for (const building of source.buildings()) {
      if (group.buildings.has(building.id) || !buildingVisible(group, building)) continue;
      group.buildings.add(building.id);
      group.rev += 1;
      group.stream.buildingPlaced(group.rev, building.entry.value);
    }
  };

  const tickGroup = (group: Group): void => {
    options.stats.visionGroupTicks += 1;
    // 탐사 기록은 내 덮개로만, 보는 판정은 공유 시야로
    const own = computeCover(group);
    group.share = shareFor(group.viewer);
    group.cover = group.share?.cover ?? own;
    const explored = addCoverBits(group.explored, own);
    if (explored) {
      group.exploredDirty = true;
      sendVision(group);
    }
    if (explored || group.cover !== own) revealBuildings(group);
    const at = now();
    for (const unit of source.units()) {
      if (owns(group.viewer, unit.ownerId)) continue;
      const sent = group.visible.get(unit.id);
      if (group.share && isMember(group.share, unit.ownerId)) {
        if (!sent || sent.motion !== unit.motion) showUnit(group, unit);
        continue;
      }
      const inSight = (group.cover[visionCellOf(positionAt(unit.motion, at))] ?? 0) > 0;
      if (!inSight) {
        if (sent) hideUnit(group, unit.id);
        continue;
      }
      if (
        sent &&
        sent.motion === unit.motion &&
        (sent.until - at >= RESEND_BELOW_MS || sent.until >= arrivalAt(unit.motion))
      ) {
        continue;
      }
      showUnit(group, unit);
    }
    // 사라진 유닛(2차맵에서 빠짐)
    for (const id of group.visible.keys()) if (!source.unit(id)) hideUnit(group, id);
  };

  const tick = (): void => {
    const started = performance.now();
    for (const group of groups.values()) tickGroup(group);
    const spent = performance.now() - started;
    options.stats.visionTickMs += spent;
    options.stats.visionTickMaxMs = Math.max(options.stats.visionTickMaxMs, spent);
    const at = now();
    if (at - lastSave >= EXPLORED_SAVE_MS) {
      lastSave = at;
      for (const group of groups.values()) {
        if (!group.exploredDirty) continue;
        group.exploredDirty = false;
        options.explored?.save(group.viewer.userId, group.explored);
      }
    }
  };

  const ensureTimer = (): void => {
    if (tickTimer || groups.size === 0) return;
    tickTimer = setInterval(tick, VISION_TICK_MS);
    tickTimer.unref();
  };

  const groupState = (group: Group) => () => {
    const units: SizedEntry<UnitMotionWire>[] = [];
    for (const unit of source.units()) {
      if (owns(group.viewer, unit.ownerId)) {
        units.push(ownEntry(unit));
        continue;
      }
      if (!group.visible.has(unit.id)) continue;
      const result = clip(group, unit);
      if (!result) {
        group.visible.delete(unit.id);
        continue;
      }
      group.visible.set(unit.id, result.sent);
      units.push(result.entry);
    }
    const buildings: SizedEntry<BuildingWire>[] = [];
    for (const building of source.buildings()) {
      if (group.buildings.has(building.id)) buildings.push(building.entry);
    }
    return { rev: group.rev, units, buildings };
  };

  const createGroup = (viewer: VisionViewer, explored: Uint8Array): Group => {
    const holder: { group?: Group } = {};
    const stream = createMapStream({
      mapKey,
      terrain: options.terrain,
      now,
      stats: options.stats,
      state: () => (holder.group ? groupState(holder.group)() : { rev: 0, units: [], buildings: [] }),
    });
    const group: Group = {
      key: groupKeyOf(viewer),
      viewer,
      stream,
      subscribers: new Set(),
      rev: 0,
      visible: new Map(),
      buildings: new Set(),
      cover: new Uint16Array(VISION_CELLS),
      share: undefined,
      explored,
      exploredDirty: false,
    };
    holder.group = group;
    // 처음 상태: 덮인 칸(같은 나라 공유 포함)·탐사(내 덮개만)·보이는 남의 유닛·건물
    const own = computeCover(group);
    group.share = shareFor(viewer);
    group.cover = group.share?.cover ?? own;
    if (addCoverBits(group.explored, own)) group.exploredDirty = true;
    for (const building of source.buildings())
      if (buildingVisible(group, building)) group.buildings.add(building.id);
    for (const unit of source.units()) {
      if (owns(viewer, unit.ownerId)) continue;
      const result = clip(group, unit);
      if (result) group.visible.set(unit.id, result.sent);
    }
    return group;
  };

  return {
    async canView(viewer) {
      if (viewer.ownerId !== undefined) {
        for (const unit of source.units()) if (unit.ownerId === viewer.ownerId) return true;
        for (const building of source.buildings()) if (building.ownerId === viewer.ownerId) return true;
        // 옆 2차맵에 선 내 유닛의 시야가 경계를 넘어 닿는다(그 몫만 보인다 — 나머지는 탐사 기록대로 어둡다)
        for (const sight of source.border?.(now()) ?? []) if (sight.ownerId === viewer.ownerId) return true;
      }
      // 같은 나라 유닛·건물이 있는 2차맵도 볼 수 있다(같은 나라 시야 공유 — 내 나라 다른 도시를 들어가 본다, 질문 746 나)
      if (shareFor(viewer)?.cover.some((count) => count > 0)) return true;
      const bits = await loadExplored(viewer.userId);
      return bits.some((byte) => byte !== 0);
    },
    async sighted(viewer) {
      // 탐사 기록은 구독하는 동안만 쌓이므로 지금 내 유닛·건물이 덮는 칸을 더해 본다(기록은 바꾸지 않는다, 사본)
      const bits = new Uint8Array(await loadExplored(viewer.userId));
      addCoverBits(bits, sightOf(viewer, coverOf(viewer.ownerId)));
      return bits;
    },
    subscribe(subscriber, viewer) {
      const previous = bySubscriber.get(subscriber);
      const key = groupKeyOf(viewer);
      if (previous && previous.key !== key) this.unsubscribe(subscriber);
      let group = groups.get(key);
      if (!group) {
        // canView가 탐사 기록을 먼저 읽었다
        group = createGroup(viewer, exploredOf.get(viewer.userId) ?? new Uint8Array(VISION_BYTES));
        exploredOf.set(viewer.userId, group.explored);
        groups.set(key, group);
      }
      group.subscribers.add(subscriber);
      bySubscriber.set(subscriber, group);
      group.stream.subscribe(subscriber);
      subscriber.send(encodeMessage({ t: "vision", mapKey, explored: encodeBits(group.explored) }));
      ensureTimer();
    },
    unsubscribe(subscriber) {
      const group = bySubscriber.get(subscriber);
      if (!group) return;
      bySubscriber.delete(subscriber);
      group.subscribers.delete(subscriber);
      group.stream.unsubscribe(subscriber);
      if (group.subscribers.size > 0) return;
      if (group.exploredDirty) options.explored?.save(group.viewer.userId, group.explored);
      group.stream.close();
      groups.delete(group.key);
      if (groups.size === 0 && tickTimer) {
        clearInterval(tickTimer);
        tickTimer = undefined;
      }
    },
    unitChanged(unit) {
      for (const group of groups.values()) {
        if (owns(group.viewer, unit.ownerId)) {
          group.rev += 1;
          group.stream.unitChanged(group.rev, ownEntry(unit));
        } else if (group.visible.has(unit.id)) {
          showUnit(group, unit);
        }
      }
    },
    async explore(userId, points) {
      const bits = await loadExplored(userId);
      const cover = new Uint16Array(VISION_CELLS);
      for (const point of points) stampVision(cover, visionCellOf(point), UNIT_RADIUS);
      if (!addCoverBits(bits, cover)) return false;
      options.explored?.save(userId, bits);
      // 보던 무리는 같은 비트 배열을 든다(loadExplored·createGroup이 나눠 쓴다): 알리고 새로 드러난 건물을 보낸다
      for (const group of groups.values()) {
        if (group.viewer.userId !== userId) continue;
        group.exploredDirty = false;
        sendVision(group);
        revealBuildings(group);
      }
      return true;
    },
    unitRemoved(unitId, ownerId) {
      for (const group of groups.values()) {
        if (owns(group.viewer, ownerId)) {
          group.rev += 1;
          group.stream.unitHidden(group.rev, unitId);
        } else hideUnit(group, unitId);
      }
    },
    buildingPlaced(building) {
      for (const group of groups.values()) {
        if (!buildingVisible(group, building)) continue;
        group.buildings.add(building.id);
        group.rev += 1;
        group.stream.buildingPlaced(group.rev, building.entry.value);
      }
    },
    buildingRemoved(buildingId) {
      for (const group of groups.values()) {
        if (!group.buildings.delete(buildingId)) continue;
        group.rev += 1;
        group.stream.buildingRemoved(group.rev, buildingId);
      }
    },
    sees(viewer, unitId) {
      const unit = source.unit(unitId);
      if (!unit) return false;
      if (owns(viewer, unit.ownerId)) return true;
      // 구독 중인 무리면 지금 보내 둔 것과 같게, 아니면 지금 시야를 다시 센다
      const group = groups.get(groupKeyOf(viewer));
      if (group) return group.visible.has(unitId);
      const share = shareFor(viewer);
      if (share && isMember(share, unit.ownerId)) return true;
      const sight = share?.cover ?? coverOf(viewer.ownerId);
      return (sight[visionCellOf(positionAt(unit.motion, now()))] ?? 0) > 0;
    },
    tick,
    get groupCount() {
      return groups.size;
    },
    close() {
      if (tickTimer) clearInterval(tickTimer);
      tickTimer = undefined;
      for (const group of groups.values()) {
        if (group.exploredDirty) options.explored?.save(group.viewer.userId, group.explored);
        group.stream.close();
      }
      groups.clear();
      bySubscriber.clear();
    },
  };
}
