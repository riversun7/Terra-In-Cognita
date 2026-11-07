// 유닛 직무 줄(unit_work) — docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산"
// - 직무 배치: 내 유닛을 내 채집 시설에 돈 없이 둔다(노동 계약이 아니다, 질문 521). 배치한 동안 유닛은 다른 계약·건물 작업을 받지 않는다.
// - 채집 진행: 채집 시설에서 일한 진행과 다음 묶음 차례(gatherWork.ts). 노동 계약으로 일해도 같은 줄을 쓴다.
// 부팅 때 store.ts가 읽고, 바뀌면 월드 쓰기 대기열(unit_work)로 쓴다(산출 거래와 같은 묶음).
import type { Row } from "../world/persist/tables.ts";

export interface WorkRecord {
  readonly unitId: number;
  /** 배치한 소유 주체(배치가 없으면 마지막으로 일한 유닛 주인) */
  ownerId: number;
  /** 직무 배치한 시설(건물 ID). null = 배치 없음 */
  buildingId: number | null;
  assignedAtMs: number | null;
  /** 쌓인 진행의 시설(다른 시설에서 일하면 0부터) */
  gatherBuildingId: number | null;
  gatherPoints: number;
  gatherSeq: number;
  updatedAtMs: number;
}

export function workRow(r: WorkRecord): Row {
  return {
    unit_id: r.unitId,
    owner_id: r.ownerId,
    building_id: r.buildingId,
    assigned_at_ms: r.assignedAtMs,
    gather_building_id: r.gatherBuildingId,
    gather_points: r.gatherPoints,
    gather_seq: r.gatherSeq,
    updated_at_ms: r.updatedAtMs,
  };
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/** DB 줄 → 기록(pg는 int8을 글자로 준다) */
export function workRecordOf(row: Readonly<Record<string, unknown>>): WorkRecord {
  const buildingId = numOrNull(row.building_id);
  const assignedAtMs = numOrNull(row.assigned_at_ms);
  return {
    unitId: num(row.unit_id),
    ownerId: num(row.owner_id),
    // 둘이 함께 있거나 함께 없다(표 검사). 어긋난 줄은 배치 없음으로 읽는다
    buildingId: buildingId !== null && assignedAtMs !== null ? buildingId : null,
    assignedAtMs: buildingId !== null && assignedAtMs !== null ? assignedAtMs : null,
    gatherBuildingId: numOrNull(row.gather_building_id),
    gatherPoints: Math.max(0, num(row.gather_points)),
    gatherSeq: Math.max(0, num(row.gather_seq)),
    updatedAtMs: num(row.updated_at_ms),
  };
}
