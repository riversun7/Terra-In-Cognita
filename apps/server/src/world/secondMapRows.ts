// 2차맵 저장 행·저장 고리 모양(secondMap.ts에서 나눔 — 그 파일 1,000줄 상한). secondMap.ts가 다시 내보낸다
import {
  type BuildingPlacement,
  MAX_SPEED,
  type Motion,
  type Point,
  type SizeClass,
  createMotion,
} from "@terra/sim";
import type { WorldDomain } from "../db/schema.ts";
import { type UnitCondition, conditionColumns } from "./unitCondition.ts";

/** 정산 직무 상태(packages/sim settle가 읽고 바꾼다). 직무가 없으면 job 0 */
export interface UnitJob {
  job: number;
  phase: number;
  progressMs: number;
  fatigue: number;
}

export const NO_JOB: UnitJob = { job: 0, phase: 0, progressMs: 0, fatigue: 0 };

/** 저장하는 유닛 한 줄(world_units) */
export interface UnitRow {
  id: number;
  ownerId: number;
  kind: number;
  size: SizeClass;
  speed: number;
  mapKey: number;
  /** 행성 ID(콘텐츠 팩). 셀 키는 행성 안에서만 하나다(ADR 2026-10-29-cell-key-layout) */
  planetId: string;
  /** 영역(D-372): 우주·하늘·육지·해상. 지금은 모두 육지 */
  domain: WorldDomain;
  /** 꺾이는 점 [x0, y0, …] */
  path: number[];
  /**
   * 구간마다 걸음 배율(천분율, 길이 = 점 수 − 1, ADR 2026-11-14-segment-speed.md). 없으면(null) 구간 빠르기가 같다.
   * 길이가 맞지 않으면(옛 앱이 path만 고쳐 쓴 행) 읽을 때 버린다(motionOfRow)
   */
  pace?: number[] | null | undefined;
  departAtMs: number;
  /**
   * 지금 움직임의 속도(단위/초). 없거나 null이면 speed와 같다. 운영자 배율로 걷던 움직임(operatorPace.ts)이나 걷는 중에 기본 속도가 바뀐
   * 유닛(D-540 실효 AGI)은 speed와 다르다 — 다시 켜도 걷던 움직임을 그 속도로 끝낸다(motionOfRow). 기본 속도(speed)는 그대로 유닛 속도다
   */
  motionSpeed?: number | null | undefined;
  wakeAtMs: number | null;
  aiStep: number;
  job: UnitJob;
  /** 부상·포로(전투 결과, unitCondition.ts) */
  condition: UnitCondition;
  /** 타고 있는 배의 유닛 ID(docs/adr/2026-11-13-boats.md 4절). 없으면 null·없음 */
  aboardId?: number | null | undefined;
}

/**
 * 2차맵 사이로 넘기는 한 줄: 배는 승객 줄을 riders로 데리고 넘는다(기획 D-541 1283 나, docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)").
 * riders는 저장하지 않는다(승객마다 자기 줄 — aboardId = 배)
 */
export type TransferRow = UnitRow & { readonly riders?: readonly UnitRow[] | undefined };

/** 저장하는 건물 한 줄(world_buildings) */
export interface BuildingRow {
  id: number;
  mapKey: number;
  planetId: string;
  domain: WorldDomain;
  ownerId: number | null;
  placement: BuildingPlacement;
}

/** 저장 고리(월드 쓰기 대기열). 없으면 메모리에만 둔다(DB 없는 서버·시험) */
export interface MapPersist {
  saveUnit(row: UnitRow): void;
  saveBuilding(row: BuildingRow): void;
  removeBuilding(buildingId: number): void;
  /** 유닛 행을 지운다(NPC 휴먼 사망, docs/adr/2026-11-01-npc-brain-r5.md 7절). 없으면 저장하지 않는 2차맵 */
  removeUnit?(unitId: number): void;
}

/** 유닛 상태 → 저장 한 줄(secondMap.ts rowOf에서 나눔 — 그 파일 1,000줄 상한) */
export function unitRowOf(
  unit: {
    readonly id: number;
    readonly ownerId: number;
    readonly kind: number;
    readonly size: SizeClass;
    readonly speed: number;
    readonly domain: WorldDomain;
    readonly motion: Motion;
    readonly wakeAtMs: number | undefined;
    readonly aiStep: number;
    readonly job: UnitJob;
    readonly condition: UnitCondition;
  },
  mapKey: number,
  planetId: string,
): UnitRow {
  const path: number[] = [];
  for (const point of unit.motion.waypoints) path.push(point.x, point.y);
  return {
    id: unit.id,
    ownerId: unit.ownerId,
    kind: unit.kind,
    size: unit.size,
    speed: unit.speed,
    mapKey,
    planetId,
    domain: unit.domain,
    path,
    pace: unit.motion.paces ? [...unit.motion.paces] : null,
    departAtMs: unit.motion.departAtMs,
    motionSpeed: unit.motion.speed === unit.speed ? null : unit.motion.speed,
    wakeAtMs: unit.wakeAtMs ?? null,
    aiStep: unit.aiStep,
    job: unit.job,
    condition: unit.condition,
  };
}

/** 저장한 움직임 속도가 쓸 만하면 그 값, 아니면(없음·정수가 아님·1 ~ MAX_SPEED 밖) 기본 속도 */
function motionSpeedOf(row: Pick<UnitRow, "speed" | "motionSpeed">): number {
  const speed = row.motionSpeed;
  return typeof speed === "number" && Number.isInteger(speed) && speed >= 1 && speed <= MAX_SPEED
    ? speed
    : row.speed;
}

/**
 * 저장 행 → 움직임. 틀린 행이면 undefined(부르는 쪽이 그 유닛을 버린다).
 * 걸음 배율 길이가 점 수 − 1이 아니면(옛 앱이 path만 고쳐 쓴 행 — 마이그레이션은 직전 앱이 그대로 돌게 칸만 더했다) 배율 없이 읽는다.
 * 움직임 속도(motionSpeed)가 있으면 그 속도로 만든다(운영자 배율로 걷던 한 움직임을 다시 켜도 같은 자리·같은 도착 시각으로 — operatorPace.ts).
 * 범위 밖이면 기본 속도로 읽는다. 옛 앱이 움직임만 고쳐 쓴 행의 남은 값은 읽을 때 버린다(persist/load.ts — 출발 시각 짝)
 */
export function motionOfRow(
  row: Pick<UnitRow, "path" | "pace" | "departAtMs" | "speed" | "motionSpeed">,
): Motion | undefined {
  const waypoints: Point[] = [];
  for (let i = 0; i + 1 < row.path.length; i += 2)
    waypoints.push({ x: row.path[i] ?? 0, y: row.path[i + 1] ?? 0 });
  const pace = row.pace ?? undefined;
  const paces = pace !== undefined && pace.length === waypoints.length - 1 ? pace : undefined;
  const speed = motionSpeedOf(row);
  try {
    return createMotion({ waypoints, departAtMs: row.departAtMs, speed, paces });
  } catch {
    if (paces === undefined) return undefined;
    try {
      return createMotion({ waypoints, departAtMs: row.departAtMs, speed });
    } catch {
      return undefined;
    }
  }
}

/** 유닛 행 → world_units 열(월드 쓰기 대기열, persist/tables.ts 열 이름) — world.ts에서 나눔(그 파일 1,000줄 상한) */
export function unitColumnsOf(row: UnitRow): Record<string, unknown> {
  return {
    id: row.id,
    owner_id: row.ownerId,
    kind: row.kind,
    size: row.size,
    speed: row.speed,
    map_key: row.mapKey,
    planet_id: row.planetId,
    domain: row.domain,
    path: row.path,
    pace: row.pace ?? null,
    depart_at_ms: row.departAtMs,
    // 움직임 속도와 그 움직임의 출발 시각(짝). 이 칸을 모르는 옛 앱이 움직임만 고쳐 쓰면 짝이 어긋나 읽을 때 버린다(persist/load.ts)
    motion_speed: row.motionSpeed ?? null,
    motion_depart_at_ms: (row.motionSpeed ?? null) === null ? null : row.departAtMs,
    wake_at_ms: row.wakeAtMs,
    ai_step: row.aiStep,
    job: row.job.job,
    job_phase: row.job.phase,
    job_progress_ms: row.job.progressMs,
    fatigue: row.job.fatigue,
    ...conditionColumns(row.condition, row.aboardId),
  };
}
