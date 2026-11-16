// 건물(시설) 화면 자료 모양 — tRPC facilities.overview(조회만, 바꾸는 명령은 WebSocket facility_*·storage_move, 프로토콜 10~12).
// docs/adr/2026-11-07-buildings-runtime.md. 서버(apps/server/src/facilities/views.ts)와 경제 화면(apps/game/src/economy/FacilityPanel.tsx)이 같이 쓴다.
// 수량은 묶음 단위 정수, 원장 잔고는 10진 글자(BigInt). 상태는 ppm(가득 1,000,000, @terra/shared/facilityRuntime).
import type { ExchangeKind } from "./exchange.ts";
import type { ConditionState, FacilityRuntimeRules } from "./facilityRuntime.ts";
import { type CityCell, type GoodsPlaceKind, isMaterialSource } from "./goodsPlaces.ts";
import type { LocalizedName } from "./roster.ts";
import type { HaulCenterView } from "./logistics.ts";

export type { ConditionState } from "./facilityRuntime.ts";

export interface FacilityStackView {
  readonly item: string;
  readonly qty: number;
}

/** 짓거나 올릴 수 있는 시설 하나(실효 팩) */
export interface FacilityCatalogView {
  readonly id: string;
  readonly name: LocalizedName;
  readonly stage: string;
  readonly maxLevel: number;
  /** 2차맵 칸 크기(회전 전). 없으면 2차맵에 지을 수 없다 */
  readonly footprint: { readonly width: number; readonly height: number } | null;
  /**
   * 물가 조건(질문 947 나, 팩 needsWaterWithin — 낚시터): 건물 칸 둘레 이 배치 칸 수 안에 물 칸이 있어야 짓는다(@terra/shared/waterNearby,
   * 물 표 = facilities.waterMask). 없으면 null(땅 조건 없음). 선택 칸이라 옛 서버 응답에는 없다
   */
  readonly needsWaterWithin?: number | null | undefined;
  /**
   * 채집소 반경(배치 칸, 레벨 1 — 이 반경 안 원자재 오브젝트가 그 채집소 몫이다). 오브젝트를 맡는 채집소(벌목장·광산 등)만, 아니면 null.
   * 건축 모드 미리보기가 고리로 그린다(사용자 요청 2026-11-15, docs/adr/2026-11-15-building-screen.md). 옛 서버 응답에는 없다
   */
  readonly gatherRadiusCells?: number | null | undefined;
  /** 레벨 1 최대 내구도 */
  readonly durability: number;
  /** 레벨마다 재료·건설 시간(일꾼 없이, ms) */
  readonly levels: readonly {
    readonly level: number;
    readonly materials: readonly FacilityStackView[];
    readonly timeMs: number;
  }[];
  /** 장비를 고치는 시설(공방) */
  readonly repairsEquipment: boolean;
  /** 거래소 종류(docs/adr/2026-11-16-exchange-buildings.md). 거래소가 아니면 없다 */
  readonly exchange?: ExchangeKind | undefined;
  /** 잠긴 거래소(짓지 못함)와 까닭: after_launch = 출시 뒤(증권), not_ready = 기능 준비 중(유닛). 없으면 잠기지 않음 */
  readonly exchangeLock?: "after_launch" | "not_ready" | undefined;
}

/** plot = 면적 모듈 붙이기(기획 D-569 1765) */
export type FacilityJobKind = "build" | "upgrade" | "repair" | "beacon_repair" | "equipment" | "plot";

export interface FacilityJobView {
  readonly id: number;
  readonly kind: FacilityJobKind;
  readonly buildingId: number | null;
  readonly beaconId: number | null;
  readonly holdingId: number | null;
  readonly targetLevel: number | null;
  readonly restorePpm: number | null;
  readonly unitIds: readonly number[];
  readonly materials: readonly FacilityStackView[];
  readonly startedAtMs: number;
  readonly doneAtMs: number;
}

/** 다음 한 걸음 미리 셈(재료, 일꾼 없이 걸리는 시간) */
export interface FacilityStepView {
  readonly materials: readonly FacilityStackView[];
  readonly timeMs: number;
}

export interface FacilityView {
  readonly buildingId: number;
  readonly facilityId: string;
  readonly name: LocalizedName;
  /** 다 지은 레벨(처음 짓는 동안 0) */
  readonly level: number;
  readonly maxLevel: number;
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
  readonly conditionPpm: number;
  readonly state: ConditionState;
  /** 지금 일하나(다 지었고 30% 이상) */
  readonly works: boolean;
  readonly durability: number;
  readonly maxDurability: number;
  /** 창고 용량(kg, 지금 레벨). 창고 없는 시설은 null */
  readonly storageKg: number | null;
  /** 창고 시설(창고 단계)인가 — 물건을 넣고 꺼낸다(storage_move, 프로토콜 11) */
  readonly storage: boolean;
  /** 건물 창고에 든 무게(kg, 모든 주인, 올림). 창고 시설·상한이 있는 시설(채집 시설의 임대형 몫, 523 ②)만, 그 밖은 null */
  readonly storedKg: number | null;
  /**
   * 숙소(생활 단계, 질문 1047 다): 침대 = 레벨 × 설정 칸 lodging_beds_per_level, 쉬는 일꾼 = 그 도시 NPC 일꾼 쉼터 계획에서 이 숙소를 쓰는 수
   * (NPC 사회가 꺼져 있으면 null). 숙소가 아니면 없음
   */
  readonly lodging?: { readonly beds: number; readonly occupants: number | null } | null | undefined;
  /** 건물이 선 도시(재료를 꺼내는 도시 창고, @terra/shared/goodsPlaces). 그 2차맵에 도시가 없으면 null */
  readonly cityId: number | null;
  readonly job: FacilityJobView | null;
  /** 레벨업(최고 레벨이면 null) */
  readonly upgrade: FacilityStepView | null;
  /** 수리 한 번(10%, 가득이면 null) — 고칠 양·재료·시간(일꾼 하나) */
  readonly repairStep: (FacilityStepView & { readonly restorePpm: number }) | null;
  /** 30%까지 노화가 걸리는 남은 시간(쓰지 않을 때, 화면 안내). 이미 아래면 null */
  readonly idleMsToDisabled: number | null;
  readonly repairsEquipment: boolean;
  /** 채집 시설이면 스탯 짝·중분류·방식(D-506·D-507) — 직무 배치 칸이 보인다(docs/adr/2026-11-07-play-flow.md "WP3"). 아니면 null */
  readonly gather: FacilityGatherView | null;
  /** 일꾼 자리 = 다 지은 레벨 × 레벨당 자리(직무 배치 + 열린 노동 계약). 채집 시설·병원이 아니면 0 */
  readonly slots: number;
  /** 이 시설에서 일하는 유닛(직무 배치·노동 계약, 유닛 ID 차례) */
  readonly workers: readonly FacilityWorkerView[];
  /** 병원(의료 단계 시설, D-521)이면 true — 의사 직무 배치 칸이 보인다(산출 없음, docs/adr/2026-11-08-injury.md). 아니면 없음 */
  readonly medical?: boolean | undefined;
  /**
   * 빈 2차맵에 짓는 중인 알박기 정부 건물의 고르기(기획 D-577 — 다 지어질 때 발효, 그 전에는 facility_claim으로 바꾼다). kind = 다 지었을 때 새 도시의
   * 주인(personal = 1인 독재 도시라 체제는 늘 독재), locked = 가문이 이미 봉신·독립을 정해 고르기를 보지 않는다(FacilityLandRuleResponse.claimLocked와
   * 같다). 다 지었거나 알박기 정부가 아니면 없음. 옛 서버는 이 칸이 없다
   */
  readonly landClaim?:
    | {
        readonly choice: LandClaimChoice;
        readonly kind: FacilityLandClaim | null;
        readonly locked: "vassal" | "independent" | null;
      }
    | null
    | undefined;
}

/** 채집 시설의 스탯 짝(주 = 진행 속도, 보조 = 수확량)·중분류·방식(roll 추첨, select 해금 티어에서 고름) */
export interface FacilityGatherView {
  readonly primary: string;
  readonly secondary: string;
  readonly subcategory: string;
  readonly mode: "roll" | "select";
}

/** 시설에서 일하는 유닛 하나 */
export interface FacilityWorkerView {
  readonly unitId: number;
  /** assign = 직무 배치(돈 없음), wage·lease = 노동 계약 */
  readonly via: "assign" | "wage" | "lease";
  /** 내 유닛인가(직무 배치는 늘 내 유닛) */
  readonly mine: boolean;
  /** 사이보그 본체인가 */
  readonly cyborg: boolean;
}

/** 내 세력 영토 비콘(건물 규칙, 기획 336) */
export interface FacilityBeaconView {
  readonly id: number;
  readonly planetId: string;
  readonly cellKey: number;
  readonly conditionPpm: number;
  readonly state: ConditionState;
  readonly durability: number;
  readonly maxDurability: number;
  readonly readyAtMs: number | null;
  readonly job: FacilityJobView | null;
  readonly repairStep: (FacilityStepView & { readonly restorePpm: number }) | null;
  /**
   * 재료를 꺼내는 도시: 그 세력에서 비콘 칸과 가장 가까운 도시(질문 410 ①, @terra/shared/territory nearestFactionCity). 그 도시의 내 도시
   * 창고 + 그 도시의 내 창고 시설에서만 꺼낸다(화물 없음). 세력 도시가 없으면 null(재료를 꺼낼 곳이 없다)
   */
  readonly supplyCityId: number | null;
}

/**
 * 칠 수 있는 남의 시설·다른 세력 영토 비콘 하나(질문 381, 명령 facility_attack 프로토콜 12). 내 유닛이 있는 2차맵의 것만(비콘은 그 칸의
 * 2차맵), 내 것·내 세력 것·도시 시가지(안전지대, D-146) 안의 것은 뺀다. 상태 0%(폐허)도 보이되 칠 수 없다(target_ruined)
 */
export interface FacilityTargetView {
  readonly kind: "facility" | "beacon";
  /** 시설 = 2차맵 건물 ID, 비콘 = 비콘 ID */
  readonly id: number;
  /** 시설의 팩 ID(비콘은 null) */
  readonly facilityId: string | null;
  readonly name: LocalizedName | null;
  readonly mapKey: number;
  /** 시설의 2차맵 기준 칸(비콘은 null) */
  readonly x: number | null;
  readonly y: number | null;
  readonly conditionPpm: number;
  readonly state: ConditionState;
  readonly durability: number;
  readonly maxDurability: number;
  /** 그 2차맵에 있는 내 유닛 가운데 공격에 쓸 수 있는 것(작업·계약·부상·포로가 아님) */
  readonly unitIds: readonly number[];
}

export interface FacilityUnitView {
  readonly id: number;
  /** 사이보그 본체인가 */
  readonly cyborg: boolean;
  /** 유닛이 있는 2차맵(직무 배치는 같은 2차맵 시설에만, 기획 정리 D-518 522 ①) */
  readonly mapKey: number;
  /** 다른 작업·계약 중 */
  readonly busy: boolean;
  /** 제작 직무 점수(가중치 표 job_crafting, 장인 보정) */
  readonly craftScore: number;
  /** 1차 스탯(입은 장비·버프 포함) — 채집 시설 직무 배치 고르기가 스탯 짝을 보인다 */
  readonly stats: Readonly<Record<"str" | "dex" | "agi" | "vit" | "int" | "wis", number>>;
  /** 직무 배치된 시설(건물 ID). 없으면 null */
  readonly assignedTo: number | null;
}

/** 고칠 수 있는 내 장비(닳은 것) */
export interface FacilityHoldingView {
  readonly id: number;
  readonly item: string;
  readonly name: LocalizedName | null;
  readonly tier: number;
  readonly durability: number;
  readonly maxDurability: number;
  readonly equipped: boolean;
  /** 지금 고치는 중 */
  readonly busy: boolean;
  /**
   * 이 장비를 받는 공방(건물 ID)과 그 공방에서의 재료(고치기 전 잃은 양으로 셈). 내 공방이 먼저, 그다음 내 유닛이 있는 2차맵의 남의 공방(외주 —
   * 기획 D-564 1682, fee = 그 공방 금고에 낼 요금(최소 단위 글자) = 주인이 정한 시간당 요금 × 시간(D-570 1785). 내 공방·옛 응답에는 없다)
   */
  readonly shops: readonly {
    readonly buildingId: number;
    readonly materials: readonly FacilityStackView[];
    readonly fee?: string | undefined;
    /** 남의 공방 수리 시간(ms — 그 공방 일꾼이 고친다, D-570 1785). 내 공방·옛 응답에는 없다(기기가 내 장인으로 셈) */
    readonly ms?: number | undefined;
    /** 남의 공방에서 고칠 일꾼 수(D-570 1785). 내 공방·옛 응답에는 없다 */
    readonly workers?: number | undefined;
    /** 남의 공방 자리(내 재료를 꺼내는 도시 — 미리 셈). 내 공방은 facilities 줄에서 찾는다 */
    readonly mapKey?: number | undefined;
    readonly cityId?: number | null | undefined;
  }[];
}

/** 내 물건이 있는 자리 하나(도시 창고·건물 창고·화물·자리 없음, @terra/shared/goodsPlaces) */
export interface GoodsPlaceView {
  /** 화면 key(city_3·building_42·cargo_17·ledger) */
  readonly key: string;
  readonly kind: GoodsPlaceKind;
  /** 도시 ID·건물 ID·유닛 ID(자리 없음은 null) */
  readonly id: number | null;
  /** 도시 창고 = 그 도시, 건물 창고 = 건물이 선 도시, 화물·자리 없음 = null */
  readonly cityId: number | null;
  /** 건물이 선·유닛이 있는 2차맵(도시 창고·자리 없음은 null) */
  readonly mapKey: number | null;
  /** 건물 창고: 내 창고 시설인가(재료를 꺼내는 자리). 남의 건물(임대 몫)·창고가 아닌 시설이면 false */
  readonly storage: boolean;
  /** 건물 창고: 그 건물의 팩 시설 ID(시설이 아니면 null) */
  readonly facilityId: string | null;
  /**
   * 건물 창고: 내 사업장 물건(내 시설이고 창고 시설이 아님)인가 — 꺼내지 못하고 판매가로만 산다(기획 D-569 1781, 서버 storage_move out = sale_only).
   * 없으면 false
   */
  readonly sale?: boolean | undefined;
  /** 건물 창고: 거래소 건물이면 그 종류(맡긴 물건 — 꺼낸다, docs/adr/2026-11-16-exchange-buildings.md). 없으면 거래소가 아니다 */
  readonly exchange?: ExchangeKind | undefined;
  /** 도시 창고: 그 도시 물자 거래소 건물 ID(없으면 null — [거래소로 옮기기]를 숨긴다). 칸이 없으면 옛 서버 */
  readonly exchangeId?: number | null | undefined;
  /** 도시 창고: 거래소로 옮길 때 맡길 수 있는 그 도시 물류센터(기획 D-576 — 건물 ID 차례). 칸이 없으면 옛 서버 */
  readonly haulCenters?: readonly HaulCenterView[] | undefined;
  readonly lines: readonly {
    /** 원장 자산 코드(item:<ID>, 시험 광석 등) */
    readonly asset: string;
    /** 물자면 아이템 ID */
    readonly item: string | null;
    readonly name: LocalizedName | null;
    readonly qty: string;
  }[];
}

/** 설정 칸 N50·M15·N54 실효 값(화면 미리 셈이 @terra/shared/facilityRuntime 함수에 그대로 넘긴다) */
export type FacilityRulesView = FacilityRuntimeRules;

export interface FacilitiesOverviewResponse {
  readonly status: "ready" | "not_ready";
  readonly generatedAt: number;
  readonly rules: FacilityRulesView;
  /** 지을 수 있는 2차맵(서버가 띄운 것) */
  readonly maps: readonly number[];
  readonly catalog: readonly FacilityCatalogView[];
  readonly facilities: readonly FacilityView[];
  readonly beacons: readonly FacilityBeaconView[];
  /** 띄운 2차맵의 도시 자리(짓는 칸이 속한 도시 = 가장 가까운 도시, @terra/shared/goodsPlaces cityOfCell) */
  readonly cities: readonly CityCell[];
  /** 내 물건이 있는 자리(잔고 0은 뺀다). 재료는 그 도시 창고 + 그 도시의 내 창고 시설 + 그 2차맵 내 유닛 화물에서만 꺼낸다(D-516 361) */
  readonly places: readonly GoodsPlaceView[];
  /** 건설·수리 재료로 쓰는 물자와 내 잔고(모든 자리 합, 10진 글자 — 옛 화면용. 짓는 자리의 재료는 places로 센다) */
  readonly materials: readonly {
    readonly item: string;
    readonly name: LocalizedName | null;
    readonly have: string;
  }[];
  readonly units: readonly FacilityUnitView[];
  readonly holdings: readonly FacilityHoldingView[];
  /** 칠 수 있는 남의 시설·다른 세력 비콘(질문 381) */
  readonly targets: readonly FacilityTargetView[];
  /** 개발 시험 명령(재료 받기·바로 끝내기)을 쓸 수 있나 */
  readonly dev: boolean;
}

/**
 * 그 도시·2차맵에서 건물 재료로 쓸 수 있는 물자 합(아이템 ID → 수량) — 서버 materialScope와 같은 자리 규칙(D-516 361). mapKey가 null이면
 * 화물을 빼고 그 도시 창고 + 그 도시의 내 창고 시설만(영토 비콘 재료, 질문 410 ①)
 */
export function materialStockAt(
  places: readonly GoodsPlaceView[],
  mapKey: number | null,
  cityId: number | null,
): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const place of places) {
    if (!isMaterialSource(place, cityId, mapKey)) continue;
    for (const line of place.lines)
      if (line.item !== null) out.set(line.item, (out.get(line.item) ?? 0n) + BigInt(line.qty));
  }
  return out;
}

/**
 * 띄운 2차맵의 물 표(tRPC facilities.waterMask, 질문 947 나): 지형 칸마다 1비트(@terra/shared/waterNearby waterMaskToHex). 짓기 폼이 물가 조건
 * 미리 보기에 쓴다(판정은 지을 때 서버가 같은 함수로). 띄우지 않은 2차맵은 unknown_map, 세계 준비 전은 not_ready
 */
export type FacilityWaterMaskResponse =
  | { readonly status: "ready"; readonly mapKey: number; readonly size: number; readonly hex: string }
  | { readonly status: "unknown_map" | "not_ready"; readonly mapKey: number };

/**
 * facilities.landRule — 그 2차맵(의 배치 칸)에 지을 수 있나(서버 땅 규칙, docs/adr/2026-11-14-second-map-build.md). 다른 세력 도시 2차맵(정부
 * 건물 있음)이면 못 짓는다(전쟁·중립·동맹 — 동맹 정책은 아직 없고 기본값 금지). 정부 건물이 없는 2차맵은 다른 세력 1차맵 영토 안이어도 짓는다
 * (기획 D-572 알박기 우선 — territoryFaction으로 알린다). 짓기 명령은 그때 같은 판정으로 forbidden을 준다
 */
export interface FacilityLandRuleResponse {
  readonly status: "ready" | "not_ready" | "unknown_map";
  readonly mapKey: number;
  /** 지을 수 있나(not_ready·unknown_map이면 false) */
  readonly allowed: boolean;
  /**
   * 못 지으면 까닭: foreign_city = 다른 세력의 도시 2차맵. (D-568 territory-3의 foreign_territory는 D-572로 없어졌다 — 그 판의 기기는 그 문구를
   * 갖고 있지만 서버가 더는 보내지 않는다.) house_policy = 같은 나라 다른 가문의 도시가 남의 가문 짓기를 막았다(D-574 2124, 옛 기기는 다른 세력
   * 도시 문구로 보인다). 옛 기기는 allowed만 본다
   */
  readonly reason: "foreign_city" | "house_policy" | null;
  /** 못 지으면 그 도시 주인 세력 ID */
  readonly cityFaction: number | null;
  /**
   * 지을 수 있지만 짓는 자리가 다른 세력의 1차맵 영토 안이면 그 세력 ID(알박기 땅 — 지킬 힘이 없으면 빼앗길 수 있음, D-572). 아니면 null.
   * 옛 서버는 이 칸이 없다
   */
  readonly territoryFaction?: number | null | undefined;
  /**
   * 빈 2차맵 알박기(기획 D-572, 질문 2122 가, D-574): 그 2차맵에 도시도 폐허도 없으면 정부(행정) 건물을 다 지었을 때 새 도시의 주인 — house =
   * 내 가문(가문장·가문원 모두, D-574 "가문이 있으면 가문소유"), personal = 가문 없는 플레이어의 1인 독재 도시(D-574 "무소속이면 유닛 독재 도시"),
   * faction = 내 세력(세력 주체). 도시·폐허가 있는 2차맵·모르면 null. 옛 서버는 이 칸이 없다(옛 서버는 nation·no_house도 보냈다)
   */
  readonly claim?: FacilityLandClaim | null | undefined;
  /**
   * 가문이 이미 도시를 가져 봉신·독립을 골라 둔 상태(바꾸지 못함 — houseCity mode_locked와 같다). house일 때만 값, 아직 안 골랐으면 null(짓기 때
   * 고른다, D-574). 옛 서버는 이 칸이 없다
   */
  readonly claimLocked?: "vassal" | "independent" | null | undefined;
}

/** 빈 2차맵 정부 건물이 다 지어지면 새 도시의 주인(FacilityLandRuleResponse.claim) */
export type FacilityLandClaim = "house" | "personal" | "faction";

/**
 * 알박기 정부를 지을 때 고르는 것(D-574 "정부건설시 독립할지 소속된 국가로 귀속할지 결정가능"): nation = 소속 국가로 귀속(가문·1인 도시가 그 나라의
 * 봉신), independent = 독립 도시국가. 귀속해도 도시 지분은 최초 설립자(새 도시 주인)가 갖고 나중에 독립을 선언할 수 있다(D-575)
 */
export const LAND_CLAIM_MODES = ["nation", "independent"] as const;
export type LandClaimMode = (typeof LAND_CLAIM_MODES)[number];

/**
 * 기본 선택 — D-574 원문 "소속된 국가로". 기본값이 맞는지 기획이 사용자에게 다시 확인 중이다(질문 2241). 바꾸려면 이 한 줄만 바꾼다(서버가 고르기
 * 없이 온 짓기 명령에도, 건축 모드 처음 선택에도 이 값을 쓴다)
 */
export const DEFAULT_LAND_CLAIM_MODE: LandClaimMode = "nation";

/** 독립을 고를 때의 체제(D-340 "독립 도시국가로 세우면 체제도 그때 정한다" — 프로토콜 HOUSE_REGIMES와 같은 값) */
export const LAND_CLAIM_REGIMES = ["dictatorship", "democracy", "capitalism"] as const;
export type LandClaimRegime = (typeof LAND_CLAIM_REGIMES)[number];

/** 알박기 고르기 한 벌(짓기 명령 claim 칸). regime = 독립일 때 체제(1인 독재 도시는 늘 dictatorship) */
export interface LandClaimChoice {
  readonly mode: LandClaimMode;
  readonly regime: LandClaimRegime | null;
}
