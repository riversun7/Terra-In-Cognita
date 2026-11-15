// 건물(시설) 서비스 입력·결과 타입(service.ts에서 나눔 — 파일 1,000줄 상한). service.ts가 다시 내보낸다.
import type { FacilityResultCode } from "@terra/protocol";
import type { Rotation } from "@terra/sim";
import type { JobMaterial } from "./state.ts";
import type { StorageMoveInput } from "./storage.ts";

export type FacilityCommandResult =
  | { readonly ok: true; readonly buildingId?: number; readonly doneAtMs?: number }
  | { readonly ok: false; readonly code: FacilityResultCode };

export type FacilityTarget = { readonly buildingId: number } | { readonly beaconId: number };

/** 행정 건물(폐허 정부) 짓기 고리 — 폐허 서비스(src/ruins/service.ts)가 붙인다 */
/** 창고 꺼내기 고리: null = 맡아 처리함(성공), 코드 = 맡아 실패, undefined = 맡지 않음 */
export type StorageOutHook = (
  ownerId: number,
  input: StorageMoveInput,
  atMs: number,
) => FacilityResultCode | null | undefined;

export interface GovernmentHook {
  /** 그 칸이 주인 없는 폐허 자리인가(주체가 짓기 시작하면 주인이 될 수 있나) */
  check(
    ownerId: number,
    mapKey: number,
    x: number,
    y: number,
  ):
    | { readonly ok: true; readonly ruinId: number }
    | { readonly ok: false; readonly code: FacilityResultCode };
  /** 짓기를 시작했다(같은 동기 처리): 주인이 된다 */
  claimed(ruinId: number, ownerId: number, buildingId: number, atMs: number): void;
}

export interface FacilityBuildInput {
  readonly mapKey: number;
  readonly facility: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: Rotation;
  readonly unitIds?: readonly number[] | undefined;
  /**
   * 운영자 모드 건설(기획 D-560 1239, D-564 1663 "재료랑 건설시간만 없게 해라" — 권한은 게이트웨이가 본다: 전체 보기 구독 + 모든 유닛 명령 권한):
   * 재료를 쓰지 않고 건설 시간이 없다(바로 다 짓는다). 그 밖의 건설 규칙(칸 검사·물가 조건·행정 건물 폐허 자리·땅 규칙)은 그대로 본다
   */
  readonly operator?: OperatorBuild | undefined;
}

/**
 * 운영자 모드 건설 표지. pace = 그 연결의 운영자 배율(1 이상, 기록용) — D-564 1663부터 짓는 시간에 쓰지 않는다(운영자 모드는 늘 시간 0)
 */
export interface OperatorBuild {
  readonly pace: number;
}

/** 운영자 모드 짓기·레벨 올리기 시간: 운영자 모드면 0(D-564 1663 "건설시간 없게"), 아니면 그대로 */
export const operatorMs = (ms: number, operator: OperatorBuild | undefined): number => (operator ? 0 : ms);

/**
 * NPC 증축 짓기 입력(질문 1101 나, npc/cityBuild.ts — 플레이어 짓기와 같은 규칙): 재료·시간은 @terra/sim buildPolicy가 플레이어와 같은 식
 * (buildCostAt·buildTimeAt·withBuilders)으로 셈해 넘긴다. 자리는 전략 배치 함수(npcPlacement.ts)가 고른 칸이다
 */
export interface NpcBuildInput {
  readonly ownerId: number;
  readonly mapKey: number;
  readonly cityId: number;
  readonly facility: string;
  readonly x: number;
  readonly y: number;
  readonly materials: readonly JobMaterial[];
  readonly ms: number;
}

/**
 * NPC 레벨 올리기·수리 입력(질문 1146 나·1114 가, npc/cityBuild.ts — 플레이어 레벨업·수리와 같은 규칙): 재료·시간·고칠 양은 @terra/sim
 * buildPolicy가 플레이어와 같은 식으로 셈해 넘긴다. 건물 주인 = ownerId여야 한다
 */
export interface NpcJobInput {
  readonly kind: "upgrade" | "repair";
  readonly ownerId: number;
  readonly buildingId: number;
  readonly materials: readonly JobMaterial[];
  readonly ms: number;
  /** 수리로 더할 상태(ppm). 레벨 올리기면 쓰지 않는다 */
  readonly restorePpm?: number | undefined;
}
