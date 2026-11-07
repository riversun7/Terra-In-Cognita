// 2차맵 화면의 내 유닛 목록 응답(tRPC world.mapUnits) — docs/adr/2026-11-07-unit-control.md(사용자 지적 2026-11-07 "사이보그 포함 유닛 목록을 통해
// 선택하여 명령"). 서버는 그 2차맵에 있는 내 유닛(사이보그 본체 먼저)과 지금 명령할 수 없는 까닭을 준다. 명령은 WebSocket(move_unit·stop_unit)이고
// 서버가 명령 때 소유·운영자 권한을 다시 본다(같은 함수 — 서버 src/world/unitControl.ts).
import type { RosterJob } from "./roster.ts";

/** 목록 한 줄의 종류: 사이보그 본체(플레이어 하나에 하나) + 보유 유닛 종류(roster UnitType 중 세계에 있는 것) */
export const MAP_UNIT_KINDS = [
  "cyborg_body",
  "cyborg",
  "human",
  "guardian",
  "test_worker",
  "test_unit",
] as const;
export type MapUnitKind = (typeof MAP_UNIT_KINDS)[number];

/** 지금 명령할 수 없는 까닭: 수호신은 그 도시에 머문다(기획 답 456 가), 포로, 중태(D-145 활동 불가) */
export type MapUnitHold = "guardian" | "captive" | "critical";

export interface MapUnit {
  readonly unitId: number;
  readonly kind: MapUnitKind;
  /** 사이보그 본체면 사이보그 이름, 그 밖은 null(유닛 이름 칸이 아직 없다 — 화면은 "종류 #번호") */
  readonly name: string | null;
  /** 조회한 때의 배치 칸(0~255). 화면은 엔진의 지금 자리를 먼저 쓴다 */
  readonly cellX: number;
  readonly cellY: number;
  /** 조회한 때 가는 중인가 */
  readonly moving: boolean;
  /** 정산 직무(없으면 null) */
  readonly job: RosterJob | null;
  /** 부상 단계 0~3 */
  readonly injury: 0 | 1 | 2 | 3;
  /** 지금 명령할 수 없는 까닭(없으면 null — 옮기고 세울 수 있다) */
  readonly hold: MapUnitHold | null;
}

export interface MapUnitsResponse {
  /** not_ready: 세계(DB)가 없거나 부팅 복구 전 — 빈 목록 */
  readonly status: "ready" | "not_ready";
  readonly mapKey: number;
  /** 그 2차맵을 서버가 띄웠는가(아니면 빈 목록) */
  readonly loaded: boolean;
  /** 사이보그 본체 먼저, 그다음 유닛 ID 차례 */
  readonly units: readonly MapUnit[];
  /** 운영자 권한(dev·admin — 모든 유닛 명령, 전체 보기). 서버 명령 판정과 같은 권한 표 */
  readonly operator: boolean;
  readonly generatedAt: number;
}
