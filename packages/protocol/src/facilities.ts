// 건물(시설) 명령 (프로토콜 10부터, 창고 옮기기는 12부터) — docs/adr/2026-11-07-buildings-runtime.md, 기획 49 N50·M14·M15·N54,
// D-171·D-508·D-509·D-514·D-516(361·382)
// - 바꾸는 명령: 짓기(facility_build), 레벨업(facility_upgrade), 건물·영토 비콘 수리(facility_repair), 공방 장비 수리(equipment_repair),
//   개발 시험(dev_facility_grant: 재료 받기, dev_facility_finish: 하던 작업 바로 끝내기 — 권한 secondMap: dev-test).
//   창고 옮기기(storage_move, 프로토콜 11): 도시 창고·화물 ↔ 창고 시설, 건물 창고(임대 몫) → 도시 창고. 조회는 tRPC facilities.overview다.
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
 * 빼고, 시간 = 기준 × 티어 × 잃은 ÷ 최대 × 장인 보정, 끝나면 고쳐진다(최대 내구도 감소 F11·파괴 F12)
 */
export const equipmentRepairMessage = z.object({
  t: z.literal("equipment_repair"),
  id: requestId,
  buildingId: rowId,
  holdingId: rowId,
  unitIds: units.min(1),
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
] as const;
export const facilityServerMessages = [facilityResultMessage] as const;
