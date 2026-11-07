// 2차맵 시야 전송 — docs/adr/2026-10-31-s3-server-stage.md 3절 (ADR 7 "시야 판정으로 거른다", ADR 26 "2차맵부터 서버가 확인")
// - 시야 묶음마다 전송(mapStream) 하나를 쓴다. 묶음 = 사용자 한 명(S3). 세력 가입이 생기면 groupKeyOf만 최상위 세력을
//   돌려주면 된다(기술 기본안 "같은 국가 전체", 기획 질문 S3-Q1). 관리자 전체 보기는 2차맵의 원래 전송(거르지 않음)을 쓴다.
// - 내 유닛은 경로 전체(S1 그대로). 남의 유닛은 지금 내 시야 칸에 들어 있을 때만, 경로를 덮인 칸을 벗어나는 곳 또는
//   CLIP_HORIZON_MS 뒤에서 잘라 보낸다(until). 남은 몫이 RESEND_BELOW_MS보다 적거나 경로가 바뀌면 다음 구간, 안 보이면 hidden.
// - 시야 틱(VISION_TICK_MS)마다 덮인 칸을 다시 계산한다. 남의 유닛 경로가 바뀌면 그 묶음에 보이는 동안은 곧바로 다시 자른다.
// - 탐사 기록(사용자마다 128바이트)은 내 유닛·건물의 시야로만 채운다(기술 기본안, 기획 질문 S3-Q2). 바뀌면 vision 메시지로
//   알리고 EXPLORED_SAVE_MS마다 저장한다. 건물은 탐사한 칸에 있으면 보낸다(마지막 본 모습 D-152는 뒤로 미뤘다).
// - 볼 수 있는지(구독·지형 파일): 전체 보기 권한, 이 2차맵에 내 유닛·건물이 있음, 한 칸이라도 탐사함(사용자 결정 U3).
import { type BuildingWire, type UnitMotionWire, VISION_BYTES, encodeMessage } from "@terra/protocol";
import {
  BUILDING_VISION_CELLS,
  type BuildingPlacement,
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

const UNIT_RADIUS = visionRadius(UNIT_VISION_CELLS);
const BUILDING_RADIUS = visionRadius(BUILDING_VISION_CELLS);

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
  cover: Uint16Array;
  explored: Uint8Array;
  exploredDirty: boolean;
}

/** 내 유닛 항목(own 표시를 붙인다. 기기는 이 유닛에 이동 명령을 보낼 수 있다) */
const ownEntry = (unit: VisionUnit): SizedEntry<UnitMotionWire> => sized({ ...unit.entry.value, own: true });

const encodeBits = (bits: Uint8Array): string =>
  Buffer.from(bits.buffer, bits.byteOffset, bits.byteLength).toString("base64");

/** 묶음 열쇠: 사용자 + 소유 주체(시험 일꾼을 받아 주체가 생기면 새 묶음이 된다. 기기는 다시 구독한다) */
function groupKeyOf(viewer: VisionViewer): string {
  return `u:${viewer.userId}:${viewer.ownerId ?? "-"}`;
}

/** 그 사람의 소유 주체 것인가 */
const owns = (viewer: VisionViewer, ownerId: number | null): boolean =>
  viewer.ownerId !== undefined && ownerId === viewer.ownerId;

/** 건물이 든 시야 칸(발자국 가운데) */
const buildingCell = (placement: BuildingPlacement): number => {
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

  const buildingVisible = (group: Group, building: VisionBuilding): boolean =>
    owns(group.viewer, building.ownerId) || hasBit(group.explored, buildingCell(building.placement));

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
    return cover;
  };
  const computeCover = (group: Group): Uint16Array => coverOf(group.viewer.ownerId);

  /** 남의 유닛 하나를 지금 덮인 칸으로 잘라 본다. 안 보이면 undefined */
  const clip = (
    group: Group,
    unit: VisionUnit,
  ): { sent: SentUnit; entry: SizedEntry<UnitMotionWire> } | undefined => {
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
      entry: sized({ ...motionToWire(unit.id, unit.size, cut), until }),
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
    group.cover = computeCover(group);
    if (addCoverBits(group.explored, group.cover)) {
      group.exploredDirty = true;
      sendVision(group);
      revealBuildings(group);
    }
    const at = now();
    for (const unit of source.units()) {
      if (owns(group.viewer, unit.ownerId)) continue;
      const sent = group.visible.get(unit.id);
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
    for (const group of groups.values()) tickGroup(group);
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
      explored,
      exploredDirty: false,
    };
    holder.group = group;
    // 처음 상태: 덮인 칸·탐사·보이는 남의 유닛·건물
    group.cover = computeCover(group);
    if (addCoverBits(group.explored, group.cover)) group.exploredDirty = true;
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
      }
      const bits = await loadExplored(viewer.userId);
      return bits.some((byte) => byte !== 0);
    },
    async sighted(viewer) {
      // 탐사 기록은 구독하는 동안만 쌓이므로 지금 내 유닛·건물이 덮는 칸을 더해 본다(기록은 바꾸지 않는다, 사본)
      const bits = new Uint8Array(await loadExplored(viewer.userId));
      addCoverBits(bits, coverOf(viewer.ownerId));
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
      return (coverOf(viewer.ownerId)[visionCellOf(positionAt(unit.motion, now()))] ?? 0) > 0;
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
