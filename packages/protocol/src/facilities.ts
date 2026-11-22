// 건물(시설) 명령 (프로토콜 10부터, 창고 옮기기는 12부터) — docs/adr/2026-11-07-buildings-runtime.md, 기획 49 N50·M14·M15·N54,
// D-171·D-508·D-509·D-514·D-516(361·382)
// - 바꾸는 명령: 짓기(facility_build), 레벨업(facility_upgrade), 건물·영토 비콘 수리(facility_repair), 공방 장비 수리(equipment_repair),
//   면적 모듈 붙이기(facility_plot, 프로토콜 41 — 건물 채집소, 기획 D-567; 45부터 짓는 시간·일꾼, D-569 1765)·떼기(facility_plot_remove, 45)·
//   기르는 티어 고르기(facility_gather_tier, 45 — D-569 1761),
//   개발 시험(dev_facility_grant: 재료 받기, dev_facility_finish: 하던 작업 바로 끝내기 — 권한 secondMap: dev-test).
//   창고 옮기기(storage_move, 프로토콜 11): 도시 창고·화물 ↔ 창고 시설, 건물 창고(임대 몫) → 도시 창고. 조회는 tRPC facilities.overview다.
//   바뀜 (프로토콜 46, 기획 D-569 1781·1784): 주인의 사업장 창고 물건은 꺼내지 못한다(sale_only — business_buy로 판매가에 산다). 꺼내기는 운반꾼
//   (그 건물 일꾼 또는 내 유닛)이 걸어 나른다(운반꾼이 없으면 unknown_unit, 모두 바쁘면 unit_busy — 옮김 셈을 끄거나 거리 0이면 바로).
//   건물·영토 비콘 공격(facility_attack, 프로토콜 12, 질문 381): 내 유닛으로 남의 시설·다른 세력 비콘을 넥서스로 하는 공성 전투를 연다.
// - 재료를 꺼내는 자리(12부터 서버 규칙, D-516 361): 건물이 선 도시 창고 + 그 도시의 내 창고 시설 + 그 2차맵 내 유닛 화물(@terra/shared/goodsPlaces).
// - 서버가 판정한다: 소유(내 건물·내 유닛·내 물건), 재료(주인 원장의 재료를 뺀다), 배치(2차맵 칸), 시간(M14 식 × 일꾼 단축),
//   상태(30% 미만 기능 정지). 결과는 facility_result 하나(id = 요청 id). 오류는 코드다(기기가 번역).
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 시설·아이템 ID가 팩에 있는지는 서버가 본다.
import { z } from "zod";

/** 건물 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const FACILITY_PROTOCOL_VERSION = 10;
/** 창고 옮기기(storage_move)·개발 재료 받기 자리 칸(mapKey·x·y)이 생긴 프로토콜 버전 */
export const STORAGE_PROTOCOL_VERSION = 11;
/** 건물·영토 비콘 공격(facility_attack, 질문 381)이 생긴 프로토콜 버전 */
export const ATTACK_PROTOCOL_VERSION = 12;
/** 물가 조건 결과 코드 needs_water가 생긴 판(질문 947 나). 더 낮은 판 연결은 blocked_terrain을 받는다 */
export const WATER_PLACE_PROTOCOL_VERSION = 21;
/** 면적 모듈 붙이기(facility_plot, 기획 D-567)와 결과 코드 plot_full이 생긴 판. 더 낮은 판 기기는 보내지 않는다(코드는 이 메시지의 답에만) */
export const PLOT_PROTOCOL_VERSION = 41;
/**
 * 면적 모듈 떼기(facility_plot_remove)·기르는 티어 고르기(facility_gather_tier)와 결과 코드 no_plot·tier_locked가 생긴 판(기획 D-569 1761·1765).
 * 더 낮은 판 기기는 보내지 않는다(코드는 이 메시지들의 답에만)
 */
export const GATHER_TIER_PROTOCOL_VERSION = 45;
/**
 * 판매만(기획 D-569 1781 "주인이 꺼내는 기능은 존재하지 않는다 무조건 판매"): 주인이 제 사업장 창고 물건을 꺼내는 storage_move out을 결과 코드
 * sale_only로 거절하는 판. 더 낮은 판 연결은 forbidden을 받는다(그 판 기기가 모르는 코드라 메시지를 풀지 못한다)
 */
export const SALE_ONLY_PROTOCOL_VERSION = 46;
/**
 * 거래소 건물(기획 D-561, docs/adr/2026-11-16-exchange-buildings.md): 짓기의 결과 코드 exchange_locked(잠긴 거래소 — 유닛·증권)·exchange_exists(그 도시에
 * 같은 종류 거래소가 이미 있음)가 생긴 판. 더 낮은 판 연결은 forbidden을 받는다. 물자 거래소 건물의 창고 넣기(storage_move in)는 운반꾼이 나른다(메시지 꼴 그대로)
 */
export const EXCHANGE_PROTOCOL_VERSION = 47;
/**
 * 외주 수리(기획 D-570 1785 "그 공방(사업장) 일꾼이 고치고 요금은 주인이 정한다"): 남의 공방 equipment_repair는 unitIds를 보지 않고(빈 목록도 받는다)
 * 그 공방 일꾼이 고친다. 결과 코드 no_shop_worker(그 공방에 고칠 일꾼이 없음)·service_closed(주인이 외주를 받지 않음 — 요금 0)가 생긴 판. 더 낮은 판
 * 연결은 unit_busy·cannot_repair를 받는다
 */
export const OUTSOURCE_PROTOCOL_VERSION = 48;
/**
 * 빈 2차맵 알박기 고르기(기획 D-574 "정부건설시 독립할지 소속된 국가로 귀속할지 결정가능"): facility_build의 선택 칸 claim이 생긴 판. 더 낮은 판
 * 기기는 보내지 않는다(서버는 기본 선택으로 본다)
 */
export const LAND_CLAIM_PROTOCOL_VERSION = 53;
/**
 * 물류센터에 운반 맡기기(기획 D-555 1505·D-576, docs/adr/2026-11-16-logistics-center.md): storage_move(거래소 넣기)·boat_unload·boat_load의 선택 칸 via가
 * 생긴 판. 더 낮은 판 기기는 보내지 않는다(서버는 예전처럼 내 운반꾼으로). 물류센터 쪽 실패는 있는 코드 no_shop_worker(나를 일꾼 없음)·service_closed(받지
 * 않음·고를 수 없는 건물)·insufficient_funds(요금 모자람)로 답한다(배 메시지는 서버 boats/cargo.ts가 no_carrier·unavailable·insufficient_funds로 바꾼다)
 */
export const LOGISTICS_PROTOCOL_VERSION = 54;
/**
 * 물류센터 맡기기 넓히기(기획 대조 2273·2272 — 묶음 1116r 55, 줄기 haul-2 판 84): storage_move 꺼내기(out)·business_buy(사업장 판매 운반)의 via, via "own"(내 운반꾼만 —
 * 계정의 자동 맡기기를 켜 두었어도 이번 명령은 맡기지 않는다). via가 없으면 서버가 계정 설정(자동 맡기기)을 따른다. 더 낮은 판 기기는 이 값들을 보내지
 * 않는다(서버는 계정 설정으로)
 */
export const HAUL_OUT_PROTOCOL_VERSION = 55;
/**
 * 짓는 중 알박기 고르기 바꾸기(facility_claim, 기획 D-577 — "정부 건물 완성 때 발효, 완성 전에는 언제든 바꿀 수 있게")가 생긴 판. 더 낮은 판
 * 기기는 보내지 않는다(그 판은 짓기 때 고른 것이 그대로 간다)
 */
export const FACILITY_CLAIM_PROTOCOL_VERSION = 54;
/**
 * 주거 건물 층 올리기(facility_floor, 사용자 결정 D-591 1 — 질문 2535 나)와 결과 코드 floor_full이 생긴 판(줄기 residence-3). 더 낮은 판 기기는 보내지 않는다(코드는
 * 이 메시지의 답에만)
 */
export const FLOOR_PROTOCOL_VERSION = 145;

const u32 = z.number().int().nonnegative().max(0xffff_ffff);
const requestId = u32;
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** 콘텐츠 팩 ID 모양(영어 snake_case). 팩에 있는지는 서버가 본다 */
const contentId = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z][a-z0-9_]*$/);
/** 일꾼(건축가·장인) 유닛 — 입력 한도(게임 값 아님) 16 */
const units = z.array(rowId).max(16);
/** 2차맵 배치 칸(0~255) */
const cell = z.number().int().min(0).max(255);

// ---------- 기기 → 서버 ----------

/**
 * 짓기: 내 2차맵 땅(지금은 필지가 없어 빈 칸이면 된다)에 시설 레벨 1을 짓는다. 재료(건물 편집기 레벨 1 구간)를 주인 원장에서 빼고,
 * 시간 = M14 식 × 일꾼 단축(unitIds = 내 유닛, 없어도 지어진다 — N50). x·y = 회전한 뒤 왼쪽 위 칸
 */
export const facilityBuildMessage = z.object({
  t: z.literal("facility_build"),
  id: requestId,
  mapKey: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  facility: contentId,
  x: cell,
  y: cell,
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  unitIds: units.optional(),
  /**
   * 빈 2차맵 알박기 정부(행정) 건물의 고르기(53부터, D-574): nation = 소속 국가로 귀속(봉신), independent = 독립(regime = 체제 — 가문 독립만 본다,
   * 1인 독재 도시는 늘 독재). 다른 건물·도시·폐허 2차맵에서는 서버가 보지 않는다. 없으면 기본 선택. 가문이 이미 골라 둔 상태면 그 상태를 따른다
   */
  claim: z
    .object({
      mode: z.enum(["nation", "independent"]),
      regime: z.enum(["dictatorship", "democracy", "capitalism"]).optional(),
    })
    .optional(),
});

/** 레벨업: 다음 레벨의 옛 비용 식(M14) 재료·시간. 올리는 동안 지금 레벨로 일한다 */
export const facilityUpgradeMessage = z.object({
  t: z.literal("facility_upgrade"),
  id: requestId,
  buildingId: rowId,
  unitIds: units.optional(),
});

/**
 * 수리(N50·D-171): 한 번에 최대 HP 10%(steps번 이어서, 모자란 만큼까지), 재료 = 지금 레벨 건설 재료 × 고친 비율, 노동이 필요하다
 * (unitIds 하나 이상). 건물(buildingId) 또는 영토 비콘(beaconId, 기획 336 "건물 규칙과 같다") 가운데 하나
 */
export const facilityRepairMessage = z
  .object({
    t: z.literal("facility_repair"),
    id: requestId,
    buildingId: rowId.optional(),
    beaconId: rowId.optional(),
    steps: z.number().int().min(1).max(10),
    unitIds: units.min(1),
  })
  .refine((message) => (message.buildingId === undefined) !== (message.beaconId === undefined));

/**
 * 장비 수리(D-512 323·D-514 351): 내 공방(수리 줄이 있는 시설)에서 내 장인 유닛으로 내 장비를 끝까지 고친다. 재료(공방 수리 줄)는 시작할 때
 * 빼고, 시간 = 기준 × 티어 × 잃은 ÷ 최대 × 장인 보정, 끝나면 고쳐진다(최대 내구도 감소 F11·파괴 F12). 48부터 남의 공방(외주)은 unitIds를 보지
 * 않고 그 공방 일꾼이 고친다(빈 목록을 보낸다, D-570 1785). 내 공방은 서버가 일꾼 하나 이상을 본다(unknown_unit)
 */
export const equipmentRepairMessage = z.object({
  t: z.literal("equipment_repair"),
  id: requestId,
  buildingId: rowId,
  holdingId: rowId,
  unitIds: units,
});

/**
 * 개발 시험: 재료(쌓이는 물자) 받기(권한 secondMap: dev-test). 12부터 mapKey·x·y(짓는 자리)를 주면 그 칸이 속한 도시 창고로, 없으면
 * 첫 2차맵 가운데 칸의 도시 창고로 받는다(그 2차맵에 도시가 없으면 내 첫 유닛 화물)
 */
export const devFacilityGrantMessage = z.object({
  t: z.literal("dev_facility_grant"),
  id: requestId,
  item: contentId,
  /** 입력 한도(게임 값 아님) */
  qty: z.number().int().min(1).max(100_000),
  mapKey: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  x: cell.optional(),
  y: cell.optional(),
});

/** 원장 자산 코드 모양(물자 item:<ID>, 시험 광석 등). 쓸 수 있는 자산인지는 서버가 본다 */
const assetCode = z
  .string()
  .min(2)
  .max(97)
  .regex(/^[a-z][a-z0-9_]{1,47}(:[a-z][a-z0-9_]{1,47})?$/);

/**
 * 운반 맡기기 칸(54부터, D-576): 물류센터 건물 ID(명령에서 직접 고름 — 같은 도시의 물류센터) 또는 auto(설정의 자동 맡기기 — 내 운반꾼이 없으면 같은 도시의
 * 받는 물류센터 가운데 한 단위 요금이 가장 싼 곳, 없으면 예전처럼). 55부터 own(내 운반꾼만)과, 칸이 없으면 계정 설정(자동 맡기기 — 켜면 auto, 끄면 own,
 * 기획 대조 2272)
 */
export const haulViaSchema = z.union([rowId, z.literal("auto"), z.literal("own")]);

/**
 * 창고 옮기기(프로토콜 11, 49 N50·D-121·D-516 382): direction in = 그 건물이 선 도시의 내 도시 창고 → 그 2차맵 내 유닛 화물 차례로 꺼내
 * 내 창고 시설(창고 단계, 다 지었고 30% 이상)에 넣는다(무게 합 ≤ 용량, 물자만). out = 그 건물 창고의 내 몫(창고 시설·임대 몫, 남의 건물이어도
 * 된다)을 그 도시의 내 도시 창고로. 수량은 원장 단위(재료와 같은 묶음 수). [임시] 같은 도시 안은 바로 옮긴다(운송은 운송 줄기)
 */
export const storageMoveMessage = z.object({
  t: z.literal("storage_move"),
  id: requestId,
  buildingId: rowId,
  asset: assetCode,
  qty: z.number().int().min(1).max(1_000_000),
  direction: z.enum(["in", "out"]),
  /** 물류센터에 맡기기(54부터 물자 거래소 건물 넣기, 55부터 꺼내기도 — 기획 대조 2273. 창고 시설 넣기는 무시) */
  via: haulViaSchema.optional(),
});

/**
 * 건물·영토 비콘 공격(프로토콜 12, 질문 381, D-175·D-5043·기획 336 ③): 내 유닛(unitIds, 그 건물·비콘 칸의 2차맵에 있는 것)으로 남의 시설
 * (buildingId) 또는 다른 세력의 영토 비콘(beaconId)을 넥서스로 하는 공성 전투를 연다(빨리감기, 결과는 실시간으로 끝나는 시각에 적용).
 * 넥서스 내구도 = 지금 내구도 점이고, 전투가 깎은 만큼 상태(ppm)가 준다(0이면 폐허 = 기능 정지, 수리로 되돌린다). 답의 doneAtMs = 결과
 * 적용 시각. 수비는 그 건물 주인(비콘은 그 세력)의 근처 유닛이다
 */
export const facilityAttackMessage = z
  .object({
    t: z.literal("facility_attack"),
    id: requestId,
    buildingId: rowId.optional(),
    beaconId: rowId.optional(),
    unitIds: units.min(1),
  })
  .refine((message) => (message.buildingId === undefined) !== (message.beaconId === undefined));

/**
 * 면적 모듈 하나 붙이기(프로토콜 41, 기획 D-567 "모듈을 추가하여 건물의 목장이나 밭 등의 면적을 넓힌다"): 내 건물 채집소(농장·목장·약초원 — 선택
 * 방식)에 밭·목장·약초밭 면적 모듈을 하나 더한다. 자리 = 레벨 × 설정 칸 plot_module_slots_per_level, 재료 = 그 시설 레벨 1 짓기 재료(건물이 선
 * 도시 창고 등에서 뺀다 — 짓기와 같은 자리·같은 레벨 0 재료 규칙). 45부터 짓기처럼 작업이 걸린다(D-569 1765 "모듈은 짓는 시간·재료" — 시간 = 그
 * 시설 레벨 1 짓는 시간 × 일꾼 단축, unitIds = 내 유닛, 없어도 된다). 답의 doneAtMs = 붙는 시각. 41~44판 기기는 unitIds 없이 보낸다
 */
export const facilityPlotMessage = z.object({
  t: z.literal("facility_plot"),
  id: requestId,
  buildingId: rowId,
  unitIds: units.optional(),
});

/**
 * 주거 건물 층 하나 올리기(프로토콜 145 — FLOOR_PROTOCOL_VERSION, 사용자 결정 D-591 1 "층을 올려 거주 수 증가"): 내 주거 건물(생활 단계 시설)의 층을 하나 더
 * 올린다(사는 곳 정원 = 층 × 설정 칸). 짓기처럼 작업이 걸린다: 재료·시간 = 지금 레벨 짓기 재료·시간 × 지금 층 수 × 설정 칸 ‰(기술 기본값 [임시]), 일꾼 = 내 유닛(없어도
 * 된다). 최고 층이면 floor_full. 답의 doneAtMs = 층이 오르는 시각
 */
export const facilityFloorMessage = z.object({
  t: z.literal("facility_floor"),
  id: requestId,
  buildingId: rowId,
  unitIds: units.optional(),
});

/**
 * 면적 모듈 하나 떼기(프로토콜 45, 기획 D-569 1765 "모듈 떼기 가능"): 붙은 모듈 하나를 바로 뗀다. 재료는 돌려주지 않는다 [임시, 질문 1861].
 * 붙은 모듈이 없으면 no_plot, 그 건물에 작업이 걸려 있으면 job_running
 */
export const facilityPlotRemoveMessage = z.object({
  t: z.literal("facility_plot_remove"),
  id: requestId,
  buildingId: rowId,
});

/**
 * 기르는 티어 고르기(프로토콜 45, 기획 D-569 1761 "최고 티어 아래에서 골라 기름"): 내 건물 채집소가 기를 티어(0~최고 = 2 × 레벨 − 1). null = 기본
 * (최고 티어 — 레벨을 올리면 따라 오른다). 최고 티어 위면 tier_locked. 다음 수확 묶음부터 든다
 */
export const facilityGatherTierMessage = z.object({
  t: z.literal("facility_gather_tier"),
  id: requestId,
  buildingId: rowId,
  tier: z.number().int().min(0).max(9).nullable(),
});

/**
 * 짓는 중 알박기 고르기 바꾸기(판 54, 기획 D-577): 빈 2차맵에 짓는 중인 내 정부(행정) 건물의 고르기(facility_build claim과 같은 꼴)를 바꾼다.
 * 다 지어질 때 발효한다(그때의 고르기로 도시가 선다). 다 지었거나 멈춘 건물(남의 도시가 먼저 섬)은 not_buildable, 알박기 정부가 아니면
 * not_facility. 결과는 facility_result
 */
export const facilityClaimMessage = z.object({
  t: z.literal("facility_claim"),
  id: requestId,
  buildingId: rowId,
  claim: z.object({
    mode: z.enum(["nation", "independent"]),
    regime: z.enum(["dictatorship", "democracy", "capitalism"]).optional(),
  }),
});

/** 개발 시험: 하던 작업(짓기·레벨업·수리·장비 수리) 바로 끝내기(권한 secondMap: dev-test) */
export const devFacilityFinishMessage = z
  .object({
    t: z.literal("dev_facility_finish"),
    id: requestId,
    buildingId: rowId.optional(),
    beaconId: rowId.optional(),
  })
  .refine((message) => (message.buildingId === undefined) !== (message.beaconId === undefined));

// ---------- 서버 → 기기 ----------

export const FACILITY_RESULT_CODES = [
  "sign_in_required",
  /** 세계가 준비 중이거나 저장 대기열이 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  /** 남의 건물·유닛·물건이거나 개발 명령 권한 없음 */
  "forbidden",
  "unknown_map",
  /** 팩에 없는 시설·아이템 */
  "unknown_facility",
  "unknown_item",
  /** 2차맵에 지을 수 없는 시설(칸 크기·건설 재료가 없음, 영토 비콘은 beacon_place) */
  "not_buildable",
  /** 배치(2차맵 칸) 문제 */
  "out_of_bounds",
  "overlaps_building",
  "overlaps_road",
  "blocked_terrain",
  "overlaps_unit",
  "building_limit",
  /** 재료가 모자람 */
  "insufficient_materials",
  "unknown_building",
  /** 시설이 아닌 건물(관리자 시험 건물) */
  "not_facility",
  "unknown_beacon",
  /** 이미 짓는·올리는·고치는 중 */
  "job_running",
  /** 짓는 중이라 아직 쓸 수 없다 */
  "under_construction",
  "max_level",
  /** 고칠 것이 없다(가득·닳지 않음) */
  "not_damaged",
  /** 30% 미만이라 기능 정지(N50) */
  "facility_disabled",
  /** 이 시설은 장비를 고치지 않거나 이 장비 칸·종류를 받지 않음 */
  "cannot_repair",
  "unknown_unit",
  /** 그 유닛이 다른 작업·계약 중 */
  "unit_busy",
  "unknown_holding",
  /** 장비가 아님(내구도 없음) */
  "not_equipment",
  /** 입고 있는 장비(먼저 벗는다) */
  "equipped",
  /** 이미 고치는 중 */
  "holding_busy",
  /** 파괴된 장비(분해만, F12) */
  "broken",
  /** 창고 시설이 아니거나(창고 단계·내 건물) 넣을 수 없는 자산(12) */
  "not_storage",
  /** 창고 용량(무게)을 넘는다(12) */
  "storage_full",
  /** 물건을 둘 자리가 없다: 그 2차맵에 도시가 없고(도시 창고 없음) 내 유닛도 없다(12) */
  "no_place",
  /** 내 것이거나 내 세력 것이라 칠 수 없다(12, facility_attack) */
  "own_target",
  /** 이미 부서졌다(상태 0%, 폐허, 12) */
  "target_ruined",
  /** 공격 유닛이 그 건물·비콘 칸의 2차맵에 없다(12) */
  "out_of_reach",
  /** 도시 시가지(안전지대, D-146) 안이라 칠 수 없다 — 시가지 안 건물은 공성 시간에만(D-174·D-184, 12) */
  "safe_zone",
  /** 행정 건물은 주인 없는 폐허 자리에만 짓는다(D-510, 13 — 더 낮은 판 연결은 not_buildable) */
  "not_ruin",
  /** 그 폐허는 이미 주인이 있다(먼저 지은 쪽이 주인, D-510, 13 — 더 낮은 판 연결은 not_buildable) */
  "ruin_claimed",
  /**
   * 물가 조건(질문 947 나, 팩 needsWaterWithin — 낚시터): 건물 칸 둘레 N 배치 칸 안에 물 칸이 없다(21 — 더 낮은 판 연결은 blocked_terrain)
   */
  "needs_water",
  /**
   * 돈이 모자람: 주인이 제 사업장 창고 물건을 꺼낼 때도 값을 낸다(D-555 1507, 34 — 더 낮은 판 연결은 insufficient_materials,
   * docs/adr/2026-11-15-business-ledger.md)
   */
  "insufficient_funds",
  /** 면적 모듈 자리가 가득(레벨 × 레벨당 자리, 41 — facility_plot의 답에만) */
  "plot_full",
  /** 뗄 면적 모듈이 없다(45 — facility_plot_remove의 답에만) */
  "no_plot",
  /** 고른 티어가 그 건물 레벨의 최고 티어 위다(45 — facility_gather_tier의 답에만) */
  "tier_locked",
  /**
   * 사업장 창고 물건은 판매만(기획 D-569 1781): 주인도 꺼내지 못하고 business_buy로 판매가에 산다(46 — 더 낮은 판 연결은 forbidden,
   * SALE_ONLY_PROTOCOL_VERSION)
   */
  "sale_only",
  /** 잠긴 거래소 건물(유닛 거래소 = 기능 전, 증권 거래소 = 출시 뒤, 47 — 더 낮은 판 연결은 forbidden, EXCHANGE_PROTOCOL_VERSION) */
  "exchange_locked",
  /** 그 도시에 같은 종류 거래소 건물이 이미 있다(도시마다 하나, D-117, 47 — 더 낮은 판 연결은 forbidden) */
  "exchange_exists",
  /** 그 공방에 외주 수리를 맡을 일꾼이 없다(48 — 더 낮은 판 연결은 unit_busy, OUTSOURCE_PROTOCOL_VERSION) */
  "no_shop_worker",
  /** 그 공방 주인이 외주 수리를 받지 않는다(시간당 요금 0, 48 — 더 낮은 판 연결은 cannot_repair) */
  "service_closed",
  /** 더 올릴 층이 없다(설정 칸 최고 층, 145 — facility_floor의 답에만) */
  "floor_full",
  "internal_error",
] as const;
export type FacilityResultCode = (typeof FACILITY_RESULT_CODES)[number];

const facilityResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("facility_result"),
    id: requestId,
    ok: z.literal(true),
    /** facility_build면 새 건물 ID */
    buildingId: rowId.optional(),
    /** 작업이 생겼으면 끝나는 시각(ms). facility_attack이면 전투 결과를 적용하는 시각 */
    doneAtMs: z.number().int().nonnegative().optional(),
  }),
  z.object({
    t: z.literal("facility_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(FACILITY_RESULT_CODES),
  }),
]);

export const facilityClientMessages = [
  facilityBuildMessage,
  facilityUpgradeMessage,
  facilityRepairMessage,
  equipmentRepairMessage,
  devFacilityGrantMessage,
  devFacilityFinishMessage,
  storageMoveMessage,
  facilityAttackMessage,
  facilityPlotMessage,
  facilityPlotRemoveMessage,
  facilityGatherTierMessage,
  facilityClaimMessage,
  facilityFloorMessage,
] as const;
export const facilityServerMessages = [facilityResultMessage] as const;
