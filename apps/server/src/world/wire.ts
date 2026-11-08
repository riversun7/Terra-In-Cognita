// 판정 상태 → 전송 모양(packages/protocol secondMap.ts), 그리고 메시지 크기 상한에 맞춘 조각 나누기.
// 모든 메시지는 MAX_MESSAGE_BYTES(64KiB) 이하여야 한다. 기기가 그보다 큰 메시지를 거부한다(codec.ts).
// 크기는 JSON 길이로 센다: 유닛·건물 항목은 숫자와 정해진 키뿐이라 글자 수 = UTF-8 바이트 수다.
import {
  type BuildingWire,
  MAX_MESSAGE_BYTES,
  type ServerMessageOf,
  type UnitMotionWire,
  encodeMessage,
  utf8ByteLength,
} from "@terra/protocol";
import type { BuildingPlacement, Motion, SizeClass } from "@terra/sim";

/** 전송 항목 + 그 JSON 길이(바뀔 때 한 번 센다) */
export interface SizedEntry<T> {
  readonly value: T;
  readonly bytes: number;
}

export function sized<T>(value: T): SizedEntry<T> {
  return { value, bytes: JSON.stringify(value).length };
}

/** kind = 표시 종류(프로토콜 18, 지도에 따로 그리는 유닛만 — unitKinds.ts wireKindOf). 없으면 칸을 넣지 않는다(보통 유닛, 바이트) */
export function motionToWire(
  id: number,
  size: SizeClass,
  motion: Motion,
  kind?: UnitMotionWire["kind"],
): UnitMotionWire {
  const path: number[] = [];
  for (const point of motion.waypoints) path.push(point.x, point.y);
  const wire: UnitMotionWire = { id, size, speed: motion.speed, departAtMs: motion.departAtMs, path };
  return kind === undefined ? wire : { ...wire, kind };
}

export function buildingToWire(id: number, placement: BuildingPlacement): BuildingWire {
  const { x, y, width, height, rotation } = placement;
  return { id, x, y, width, height, rotation };
}

/** 머리 크기를 넉넉하게 재려고 숫자 자리에 넣는 큰 값 */
const LARGE = Number.MAX_SAFE_INTEGER;

/** 스냅샷 조각의 머리(빈 배열일 때) 크기 상한 */
export function snapshotHeaderBytes(
  mapKey: number,
  terrain: { url: string; generatorVersion: number },
): number {
  return utf8ByteLength(
    encodeMessage({
      t: "map_snapshot",
      mapKey,
      snapshotId: 0xffff_ffff,
      part: LARGE,
      parts: LARGE,
      rev: LARGE,
      serverTime: LARGE,
      terrain,
      units: [],
      buildings: [],
    }),
  );
}

/** unit_paths의 머리(빈 배열일 때) 크기 상한 */
export function unitPathsHeaderBytes(mapKey: number): number {
  return utf8ByteLength(
    encodeMessage({ t: "unit_paths", mapKey, fromRev: LARGE, rev: LARGE, units: [], hidden: [] }),
  );
}

export interface ChunkPlan<U, B> {
  units: U[];
  buildings: B[];
}

/**
 * 항목을 조각으로 나눈다. 조각 하나 = 머리 + 항목들(항목마다 쉼표 1바이트) ≤ limit.
 * 항목 순서는 그대로 둔다(유닛 먼저, 그다음 건물). 항목이 없어도 조각 하나는 만든다(빈 2차맵).
 * 항목 하나가 혼자서도 넘치면 오류(경로 점 수 상한 MAX_PATH_POINTS가 막는다).
 */
export function planChunks<U, B>(
  headerBytes: number,
  units: readonly SizedEntry<U>[],
  buildings: readonly SizedEntry<B>[],
  limit = MAX_MESSAGE_BYTES,
): ChunkPlan<U, B>[] {
  const budget = limit - headerBytes;
  const chunks: ChunkPlan<U, B>[] = [];
  let current: ChunkPlan<U, B> = { units: [], buildings: [] };
  let used = 0;
  const add = (entry: SizedEntry<U> | SizedEntry<B>, push: () => void): void => {
    const cost = entry.bytes + 1;
    if (cost > budget) throw new RangeError(`entry of ${entry.bytes} bytes does not fit in a message`);
    if (used + cost > budget) {
      chunks.push(current);
      current = { units: [], buildings: [] };
      used = 0;
    }
    push();
    used += cost;
  };
  for (const entry of units) add(entry, () => current.units.push(entry.value));
  for (const entry of buildings) add(entry, () => current.buildings.push(entry.value));
  chunks.push(current);
  return chunks;
}

export interface SnapshotInput {
  mapKey: number;
  snapshotId: number;
  rev: number;
  serverTime: number;
  terrain: { url: string; generatorVersion: number };
  units: readonly SizedEntry<UnitMotionWire>[];
  buildings: readonly SizedEntry<BuildingWire>[];
}

/** 스냅샷을 인코딩한 조각들. 조각마다 크기 상한을 다시 확인한다 */
export function encodeSnapshot(input: SnapshotInput): string[] {
  const plan = planChunks(snapshotHeaderBytes(input.mapKey, input.terrain), input.units, input.buildings);
  return plan.map((chunk, part) => {
    const message: ServerMessageOf<"map_snapshot"> = {
      t: "map_snapshot",
      mapKey: input.mapKey,
      snapshotId: input.snapshotId,
      part,
      parts: plan.length,
      rev: input.rev,
      serverTime: input.serverTime,
      terrain: input.terrain,
      units: chunk.units,
      buildings: chunk.buildings,
    };
    return checkedEncode(message);
  });
}

/** 인코딩하고 크기 상한을 확인한다(넘으면 서버 버그) */
export function checkedEncode(message: Parameters<typeof encodeMessage>[0]): string {
  const text = encodeMessage(message);
  const bytes = utf8ByteLength(text);
  if (bytes > MAX_MESSAGE_BYTES) throw new RangeError(`${message.t} message is ${bytes} bytes`);
  return text;
}
