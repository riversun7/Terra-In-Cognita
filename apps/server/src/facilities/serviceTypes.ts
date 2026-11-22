// 건물(시설) 서비스 입력·결과·만들기 입력 타입(service.ts에서 나눔 — 파일 1,000줄 상한). service.ts가 다시 내보낸다.
import type { FacilityResultCode } from "@terra/protocol";
import type { LandClaimChoice } from "@terra/shared/facilities";
import type { Rotation } from "@terra/sim";
import type { JobMaterial } from "./state.ts";
import type { StorageMoveInput } from "./storage.ts";
import type { CityCell } from "@terra/shared/goodsPlaces";
import type { SocietyCoefficients } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldHoldings } from "../holdings/world.ts";
import type { LaborWorkerEntry } from "../labor/workerEntry.ts";
import type { TerritoryService } from "../territory/service.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { Settlement } from "../world/settlement.ts";
import type { FacilityCatalog } from "./catalog.ts";
import type { LandCheck } from "./landRule.ts";
import type { LoadedFacilities } from "./state.ts";
import type { PlaceWorld } from "./places.ts";

export type FacilityCommandResult =
  | { readonly ok: true; readonly buildingId?: number; readonly doneAtMs?: number }
  | { readonly ok: false; readonly code: FacilityResultCode };

export type FacilityTarget = { readonly buildingId: number } | { readonly beaconId: number };

/**
 * 창고 꺼내기 고리(운반꾼이 나름, 기획 D-569 1784): null = 맡아 처리함(성공), 코드 = 맡아 실패, undefined = 맡지 않음(나를 거리 없음 — 부르는 쪽이
 * 바로 옮긴다). ownerId = 받는 사람(그 도시의 이 사람 도시 창고로), sellerId = 그 건물 창고에서 물건을 내는 사람(사업장 판매면 건물 주인, 없으면 받는 사람)
 */
export type StorageOutHook = (
  ownerId: number,
  input: StorageMoveInput,
  atMs: number,
  sellerId?: number,
  /** 물류센터 요금을 낸 뒤에도 받는 사람 지갑에 남아야 할 돈(사업장 사기의 물건 값 — gather/carrySpec.ts keep) */
  keep?: { readonly asset: string; readonly amount: bigint },
) => FacilityResultCode | null | undefined;

/** 행정 건물(폐허 정부) 짓기 고리 — 폐허 서비스(src/ruins/service.ts)가 붙인다 */
export interface GovernmentHook {
  /**
   * 그 칸이 주인 없는 폐허 자리인가(주체가 짓기 시작하면 주인이 될 수 있나). ruinId null = 도시도 폐허도 없는 2차맵(빈 2차맵 알박기 — 다 지으면
   * 그 편의 새 도시, ruins/landClaim.ts)
   */
  check(
    ownerId: number,
    mapKey: number,
    x: number,
    y: number,
  ):
    | { readonly ok: true; readonly ruinId: number | null }
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
  /** 빈 2차맵 알박기 정부 건물의 고르기(D-574, 프로토콜 53). 없으면 기본 선택(@terra/shared/facilities DEFAULT_LAND_CLAIM_MODE) */
  readonly claim?: LandClaimChoice | undefined;
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
  /**
   * plot = 면적 모듈 붙이기(기획 D-569 1768 — NPC도 모듈). build = NPC 알박기 짓기 시작(npc-claim-3 — 레벨 0·도시 없는 행정 건물, 재료 자리 =
   * 그 건물 창고: 운반꾼이 날라 온 재료). floor = 주거 건물 층 하나 올리기(fixes-1117k 2762 — NPC 집주인, floors.ts와 같은 자리 규칙)
   */
  readonly kind: "upgrade" | "repair" | "plot" | "build" | "floor";
  readonly ownerId: number;
  readonly buildingId: number;
  readonly materials: readonly JobMaterial[];
  readonly ms: number;
  /** 수리로 더할 상태(ppm). 레벨 올리기면 쓰지 않는다 */
  readonly restorePpm?: number | undefined;
}

/** 건물 서비스 만들기 입력(createFacilityService) */
export interface FacilityServiceOptions {
  readonly loaded: LoadedFacilities;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly settlement: Settlement;
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  /** 세력·사회 계수표(설정 칸 실효 값: facilityBuild·facilityRuntime·durability), 부를 때마다 읽는다 */
  readonly rules: () => SocietyCoefficients;
  /** 실효 시설·아이템(건물 편집기 덮어쓰기가 바로 든다) */
  readonly catalog: () => FacilityCatalog;
  readonly holdings: WorldHoldings;
  /** 띄운 2차맵의 도시 자리(건물이 선 도시 = 가장 가까운 도시, 부를 때마다 읽는다). 없으면 도시 없음(재료는 화물만) */
  readonly cities?: (() => readonly CityCell[]) | undefined;
  /** 영토 서비스(비콘 수리). 없으면 비콘 수리는 unknown_beacon */
  readonly territory?: (() => TerritoryService | undefined) | undefined;
  /** 지방(D-568 — 1차맵 영토 지도로 정한 도시, places.ts cityAt). 없으면 옛 규칙(같은 2차맵 가장 가까운 도시) */
  readonly province?: PlaceWorld["province"];
  /** 2차맵 건설 땅 규칙(landRule.ts, docs/adr/2026-11-14-second-map-build.md). 없으면 막지 않는다(시험·DB 없는 세계) */
  readonly land?: LandCheck | undefined;
  /** 유닛이 노동 계약 중인가 / 건물에 일하는 계약이 있나(사용 닳음) */
  readonly labor?:
    | {
        readonly unitBusy: (unitId: number) => boolean;
        readonly buildingInUse: (buildingId: number) => boolean;
        /** 그 시설 일꾼(외주 수리를 맡는 공방 일꾼 — D-570 1785). 없으면 빈 목록 */
        readonly workersAt?: ((buildingId: number) => readonly LaborWorkerEntry[]) | undefined;
        /** 일하지 않는 유닛(비활성·수호신). 없으면 늘 false */
        readonly unitAway?: ((unitId: number) => boolean) | undefined;
      }
    | undefined;
  readonly now: () => number;
  readonly ready: () => boolean;
  /** 타이머 없이(시험이 finishDue·age를 부른다) */
  readonly manual?: boolean | undefined;
  /** 사업장이 멈췄나(적자를 한 주기 넘게 못 갚음 — D-555 1504, business/core.ts). 멈춘 시설은 일하지 않는다. 없으면 늘 false */
  readonly suspended?: ((buildingId: number) => boolean) | undefined;
  /** 노화 정시마다(사업장 주기 끝 처리 — 자동 정산·적자) */
  readonly onAge?: ((nowMs: number) => void) | undefined;
  /** 건물이 사라져 시설 줄을 지울 때(사업장 상태 줄 지우기) */
  readonly onGone?: ((buildingId: number) => void) | undefined;
}
