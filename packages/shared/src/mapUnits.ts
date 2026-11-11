// 2차맵 화면의 내 유닛 목록 응답(tRPC world.mapUnits) — docs/adr/2026-11-07-unit-control.md(사용자 지적 2026-11-07 "사이보그 포함 유닛 목록을 통해
// 선택하여 명령"). 서버는 그 2차맵에 있는 내 유닛(사이보그 본체 먼저)과 지금 명령할 수 없는 까닭을 준다. 명령은 WebSocket(move_unit·stop_unit)이고
// 서버가 명령 때 소유·운영자 권한을 다시 본다(같은 함수 — 서버 src/world/unitControl.ts).
// 바뀜(기획 답 630~637, docs/adr/2026-11-07-unit-control.md "바뀜 (기획 답 630~637)"): 다른 곳 내 유닛 수(632 다), 카메라 범위(630 — 내 유닛·건물
// 둘레), 남의 유닛 한눈 정보(636 나 — 시야 안이면 세력·종류, tRPC world.unitGlance). 목록 차례(637 나)는 기기가 유닛 화면 규칙으로 정한다.
import type { CharacterLook } from "./characterLook.ts";
import type { NationEmblemView } from "./nationEditor.ts";
import type { NationEmblemSpec } from "./nationEmblem.ts";
import type { LocalizedName, PrimaryStat, RosterJob } from "./roster.ts";

/** 목록 한 줄의 종류: 사이보그 본체(플레이어 하나에 하나) + 보유 유닛 종류(roster UnitType 중 세계에 있는 것) */
export const MAP_UNIT_KINDS = [
  "cyborg_body",
  "cyborg",
  "human",
  "guardian",
  "test_unit",
  // NPC 국가 지도자 사이보그(남의 유닛 한눈 정보에만 나온다 — docs/adr/2026-11-07-play-flow.md "WP-NPC")
  "npc_leader",
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
  /** 다친 유닛이 한 단계 나을 시각(D-525 남은 시간 "N시간 M분" 표시). 정상이면 null, 옛 서버면 없음 */
  readonly injuryUntilMs?: number | null | undefined;
  /** 지금 명령할 수 없는 까닭(없으면 null — 옮기고 세울 수 있다) */
  readonly hold: MapUnitHold | null;
  /**
   * 1차 스탯(입은 장비·버프 포함, 직무 산출과 같은 값) — 고른 유닛의 추천 한 줄(1차 생산·전투 유형, @terra/shared/unitGuide)이 읽는다.
   * 옛 서버·스탯을 모르는 서버면 없음(추천 줄을 보이지 않는다)
   */
  readonly stats?: Readonly<Record<PrimaryStat, number>> | undefined;
}

export interface MapUnitsResponse {
  /** not_ready: 세계(DB)가 없거나 부팅 복구 전 — 빈 목록 */
  readonly status: "ready" | "not_ready";
  readonly mapKey: number;
  /** 그 2차맵을 서버가 띄웠는가(아니면 빈 목록) */
  readonly loaded: boolean;
  /** 사이보그 본체 먼저, 그다음 유닛 ID 차례(화면은 유닛 화면의 손이 필요한 순으로 다시 늘어놓는다, 637 나) */
  readonly units: readonly MapUnit[];
  /** 이 2차맵 밖의 내 유닛 수(다른 띄운 2차맵 + 띄우지 않은 2차맵을 건너뛰는 중, 632 다 "다른 곳에 N") */
  readonly elsewhere: number;
  /** 플레이어 카메라 범위(630): 내 유닛·건물 둘레. 운영자 모드는 쓰지 않는다 */
  readonly view: MapViewArea;
  /** 운영자 권한(dev·admin — 모든 유닛 명령, 전체 보기). 서버 명령 판정과 같은 권한 표 */
  readonly operator: boolean;
  readonly generatedAt: number;
}

/**
 * 플레이어 카메라 범위(기획 정리 630 — 내 유닛·내 세력 시야 둘레, 시야 자유 이동은 운영자만). 반지름은 배치 칸이다:
 * 시야 반지름(서버 판정과 같은 칸) + 여유(설정 칸 없음 — 화면 값 [임시]). 유닛 자리는 기기가 엔진의 지금 자리로 쓴다(5초마다 받지 않는다).
 * 세력 시야 묶음(같은 국가 전체, S3-Q1)은 서버 시야 묶음이 사용자 하나라 아직 없다 — 내 유닛·건물만.
 */
export interface MapViewArea {
  readonly unitRadius: number;
  readonly buildingRadius: number;
  /** 이 2차맵의 내 건물 기준 칸 */
  readonly buildings: readonly { readonly x: number; readonly y: number }[];
}

/** 유닛 주인(유저)이 정한 세력 정체성 — 한눈 정보의 주인 줄 */
export interface MapUnitOwnerIdentity {
  readonly name: string;
  readonly shortName: string;
  readonly color: string;
  readonly emblem: NationEmblemSpec;
  /** 올린 그림 해시(있으면 그림이 먼저) */
  readonly uploaded: string | null;
}

/** 남의 유닛을 눌렀을 때의 한눈 정보(636 나): 지금 내 시야 안일 때만. 세력이 없으면(무소속 유저) faction null */
export interface MapUnitGlance {
  readonly unitId: number;
  readonly kind: MapUnitKind;
  readonly faction: {
    readonly id: number;
    readonly code: string | null;
    readonly kind: "npc" | "player";
    /** 화면 이름(팩 국가 프리셋 등). 없으면 null(기기는 "세력 #ID") */
    readonly name: LocalizedName | null;
    /** 국가 마크(팩 국가 프리셋의 만든 마크 + 이 세계에 올린 그림). 프리셋이 없는 세력이면 null·없음 */
    readonly emblem?: NationEmblemView | null;
  } | null;
  /**
   * 유저 유닛이면 그 주인이 정한 세력 정체성(이름·약어·색·마크 — docs/adr/2026-11-11-faction-identity.md). 정하지 않았거나 NPC 유닛이면
   * null·없음
   */
  readonly owner?: MapUnitOwnerIdentity | null;
  /** 유닛 이름(NPC 국가 지도자면 팩 국가 프리셋 leaderName). 없으면 null·없음(기기는 "종류 #번호") */
  readonly name?: LocalizedName | null;
}

export interface MapUnitGlanceResponse {
  readonly status: "ready" | "not_ready";
  /** 지금 시야 밖이거나 없는 유닛이면 null(같은 답 — 시야 밖 유닛이 있는지 새지 않게) */
  readonly glance: MapUnitGlance | null;
  readonly generatedAt: number;
}

/**
 * 2차맵 유닛 하나의 3D 외형(tRPC world.unitLooks — docs/adr/2026-11-11-character-3d.md 5절). 서버는 그 사람이 보는 유닛(내 유닛·전체 보기·지금
 * 시야 안) 가운데 사이보그 본체(저장한 외형, 없으면 옛 외형에서 넘긴 값)와 NPC 국가 지도자(유닛 ID로 정한 기본 외형)만 준다. 나머지 걷는 유닛은
 * 기기가 유닛 ID로 기본 외형을 만든다(characterLookForUnit). 꾸밈 자료다(판정에 쓰지 않는다)
 */
export interface MapUnitLook {
  readonly unitId: number;
  readonly kind: "cyborg_body" | "npc_leader";
  readonly look: CharacterLook;
}

export interface MapUnitLooksResponse {
  readonly status: "ready" | "not_ready";
  readonly mapKey: number;
  /** 유닛 ID 차례. 띄우지 않은 2차맵이면 빈 목록 */
  readonly units: readonly MapUnitLook[];
  readonly generatedAt: number;
}
