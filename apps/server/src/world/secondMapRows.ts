// 2차맵 저장 행·저장 고리 모양(secondMap.ts에서 나눔 — 그 파일 1,000줄 상한). secondMap.ts가 다시 내보낸다
import type { BuildingPlacement, SizeClass } from "@terra/sim";
import type { WorldDomain } from "../db/schema.ts";
import type { UnitCondition } from "./unitCondition.ts";

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
