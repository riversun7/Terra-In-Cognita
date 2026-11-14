// 2차맵 저장 행·저장 고리 모양(secondMap.ts에서 나눔 — 그 파일 1,000줄 상한). secondMap.ts가 다시 내보낸다
import { type BuildingPlacement, type Motion, type Point, type SizeClass, createMotion } from "@terra/sim";
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
  wakeAtMs: number | null;
  aiStep: number;
  job: UnitJob;
  /** 부상·포로(전투 결과, unitCondition.ts) */
  condition: UnitCondition;
  /** 타고 있는 배의 유닛 ID(docs/adr/2026-11-13-boats.md 4절). 없으면 null·없음 */
  aboardId?: number | null | undefined;
}

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
    wakeAtMs: unit.wakeAtMs ?? null,
    aiStep: unit.aiStep,
    job: unit.job,
    condition: unit.condition,
  };
}

/**
 * 저장 행 → 움직임. 틀린 행이면 undefined(부르는 쪽이 그 유닛을 버린다).
 * 걸음 배율 길이가 점 수 − 1이 아니면(옛 앱이 path만 고쳐 쓴 행 — 마이그레이션은 직전 앱이 그대로 돌게 칸만 더했다) 배율 없이 읽는다
 */
export function motionOfRow(
  row: Pick<UnitRow, "path" | "pace" | "departAtMs" | "speed">,
): Motion | undefined {
  const waypoints: Point[] = [];
  for (let i = 0; i + 1 < row.path.length; i += 2)
    waypoints.push({ x: row.path[i] ?? 0, y: row.path[i + 1] ?? 0 });
  const pace = row.pace ?? undefined;
  const paces = pace !== undefined && pace.length === waypoints.length - 1 ? pace : undefined;
  try {
    return createMotion({ waypoints, departAtMs: row.departAtMs, speed: row.speed, paces });
  } catch {
    if (paces === undefined) return undefined;
    try {
      return createMotion({ waypoints, departAtMs: row.departAtMs, speed: row.speed });
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
    wake_at_ms: row.wakeAtMs,
    ai_step: row.aiStep,
    job: row.job.job,
    job_phase: row.job.phase,
    job_progress_ms: row.job.progressMs,
    fatigue: row.job.fatigue,
    ...conditionColumns(row.condition, row.aboardId),
  };
}
