// 배 메시지(프로토콜 27부터, 만드는 시간은 28) — docs/adr/2026-11-13-boats.md, 기획 D-540(1221 "지도 위 배부터")·D-541.
// - 바꾸는 명령: 배 만들기(boat_build: 다 지은 부두에서 배 하나를 만들어 둘레 물 칸에 세운다), 타기(boat_board: 내 유닛이 내 배에 탄다 — 멀면 배 옆 땅까지
//   걸어간 뒤 탄다), 내리기(boat_leave: 그 배의 승객 모두가 배 둘레 땅 칸에 내린다). 배를 움직이는 것은 보통 이동 명령(move_unit)이다 — 서버가 배는 물 길로 푼다.
// - 결과의 ok는 그 일이 되었거나(만들기·내리기·바로 탄 타기) 걷기를 시작했다(먼 타기)는 뜻이다.
// 배 체계 개편(프로토콜 30, 기획 D-547 — docs/adr/2026-11-15-shipyard-harbor.md): 만들기는 조선소에서(배 종류 boatType), 수리(boat_repair: 조선소 도크에서 —
// 멀면 배가 조선소로 간 뒤 시작), 집 정박장(boat_berth: 정박장 자리를 잡고 배가 그리로 간다, buildingId null = 집 비우기), 교역 부두 시간 사기(boat_dock_time),
// 배 시설 주인 설정(harbor_policy: 받기 범위·요금·조선소 모듈). 새 결과 코드는 30판 연결에만 가고 29판 연결은 옛 코드로 낮춘다(서버 boats/gateway.ts).
// D-559(프로토콜 37 — docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15) D-559"): 다 된 배는 조선소 도크에 들고 꺼내기(boat_release, 남의 배는 장기 보관료),
// 조선소 모듈 묶음(harbor_policy modules), 연료 보급(boat_refuel)·오버히트(boat_overheat)·보직(boat_crew)·표류한 배 빼앗기(boat_seize). 새 결과 코드는 37판 연결에만,
// 36판 연결은 legacyBoatCode가 옛 코드로 낮춘다.
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 소유·거리·재료 판정은 서버가 하고, 여기서는 모양만 본다.
import { z } from "zod";

/** 배 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const BOAT_PROTOCOL_VERSION = 27;
/**
 * 배 B2(docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)", 기획 D-541 1271 나): 만드는 시간이 생겨 boat_result에 readyAtMs(배가 뜨는 시각)와
 * 결과 코드 dock_busy(그 부두가 이미 배를 만드는 중)가 생겼다. dock_busy는 이 판 연결에만 가고 27판 연결은 busy를 받는다(readyAtMs는 선택 칸)
 */
export const BOAT_B2_PROTOCOL_VERSION = 28;
/** 배 체계 개편(조선소·정박장·교역 부두·수리·주인 설정 — D-547). 새 메시지·결과 코드는 이 판부터 */
export const HARBOR_PROTOCOL_VERSION = 30;
/** D-559(도크 출고·모듈 묶음·연료·오버히트·보직·빼앗기). 새 메시지·결과 코드는 이 판부터 */
export const VOYAGE_PROTOCOL_VERSION = 37;

/** 받기 범위(@terra/shared/harbor HARBOR_ACCESS와 같다 — 이 꾸러미는 shared를 가져오지 않는다) */
export const HARBOR_ACCESS_VALUES = ["owner", "nation", "peace"] as const;
/** 조선소 모듈(@terra/shared/harbor SHIPYARD_MODULES와 같다) */
export const SHIPYARD_MODULE_VALUES = ["docks", "build", "repair"] as const;
/** 배 보직(@terra/shared/naval CREW_POSTS와 같다) */
export const CREW_POST_VALUES = ["captain", "gunner", "engine", "deck", "pilot"] as const;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const unitId = z.number().int().positive().max(0xffff_ffff);
const buildingId = z.number().int().positive().max(0xffff_ffff);
const timeMs = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** 배 종류 ID(콘텐츠 ID 모양) */
const boatTypeId = z.string().regex(/^[a-z][a-z0-9_]{1,47}$/);

// ---------- 기기 → 서버 ----------

/**
 * 그 조선소에서 배 하나를 만든다(재료는 그 도시 창고·내 창고 시설·그 2차맵 내 유닛 화물, 운영자 모드는 재료 없이). boatType = 배 종류(30판부터, 없으면
 * 그 조선소의 처음 종류)
 */
export const boatBuildMessage = z.object({
  t: z.literal("boat_build"),
  id: requestId,
  buildingId,
  boatType: boatTypeId.optional(),
});

/** 내 배를 그 조선소에서 고친다(30판부터). 멀면 배가 조선소 옆 물로 간 뒤 시작한다 */
export const boatRepairMessage = z.object({
  t: z.literal("boat_repair"),
  id: requestId,
  boatId: unitId,
  buildingId,
});

/** 내 배의 집 정박장을 정하고 배를 그리로 보낸다(30판부터). buildingId null = 집 비우기 */
export const boatBerthMessage = z.object({
  t: z.literal("boat_berth"),
  id: requestId,
  boatId: unitId,
  buildingId: buildingId.nullable(),
});

/** 교역 부두에서 시간을 산다(30판부터). 멀면 배가 그리로 간다. 요금은 바로 낸다 */
export const boatDockTimeMessage = z.object({
  t: z.literal("boat_dock_time"),
  id: requestId,
  boatId: unitId,
  buildingId,
  hours: z.number().int().min(1).max(72),
});

/** 배 시설 주인 설정(30판부터): 받기 범위·요금(정박장 하루·교역 부두 한 시간)·조선소 모듈(null = 떼기). 빠진 칸은 그대로 */
export const harborPolicyMessage = z.object({
  t: z.literal("harbor_policy"),
  id: requestId,
  buildingId,
  access: z.enum(HARBOR_ACCESS_VALUES).optional(),
  fee: z.number().int().min(0).max(1_000_000_000).optional(),
  module: z.enum(SHIPYARD_MODULE_VALUES).nullable().optional(),
  /** 조선소 모듈 묶음(37판부터, 자리 차례 — 있으면 module보다 앞선다. 자리 수·겹침은 서버가 본다) */
  modules: z.array(z.enum(SHIPYARD_MODULE_VALUES)).max(8).optional(),
});

/** 조선소 도크에 든 내 배를 꺼낸다(37판부터). 남의 조선소면 장기 보관료를 그 조선소 금고에 낸다 */
export const boatReleaseMessage = z.object({
  t: z.literal("boat_release"),
  id: requestId,
  boatId: unitId,
});

/** 교역 부두에서 연료를 채운다(37판부터 — 시간을 사고 대어 있어야 한다) */
export const boatRefuelMessage = z.object({
  t: z.literal("boat_refuel"),
  id: requestId,
  boatId: unitId,
  buildingId,
});

/** 오버히트 켜기·끄기(37판부터) */
export const boatOverheatMessage = z.object({
  t: z.literal("boat_overheat"),
  id: requestId,
  boatId: unitId,
  on: z.boolean(),
});

/** 배에 탄 내 유닛의 보직(37판부터, null = 보직 없음) */
export const boatCrewMessage = z.object({
  t: z.literal("boat_crew"),
  id: requestId,
  boatId: unitId,
  unitId,
  post: z.enum(CREW_POST_VALUES).nullable(),
});

/** 표류하고 빈 남의 배에 내 유닛(내 배에 탄)을 함장으로 앉혀 빼앗는다(37판부터) */
export const boatSeizeMessage = z.object({
  t: z.literal("boat_seize"),
  id: requestId,
  boatId: unitId,
  unitId,
});

/** 내 유닛을 내 배에 태운다 */
export const boatBoardMessage = z.object({
  t: z.literal("boat_board"),
  id: requestId,
  unitId,
  boatId: unitId,
});

/** 그 배의 승객을 모두 내린다(배가 움직이면 그 자리에 세운다) */
export const boatLeaveMessage = z.object({
  t: z.literal("boat_leave"),
  id: requestId,
  boatId: unitId,
});

// ---------- 서버 → 기기 ----------

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const BOAT_RESULT_CODES = [
  "sign_in_required",
  /** 세계가 준비 중이거나 길 찾기가 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 내 유닛·배·부두가 아니다(시야 밖 것이 있는지 새지 않게 없는 것과 같은 답) */
  "forbidden",
  /** 띄운 2차맵에 없는 유닛·배 */
  "unknown_unit",
  /** 그 건물이 없다 */
  "unknown_building",
  /** 배를 만드는 시설(부두)이 아니다 */
  "not_dock",
  /** 부두를 다 짓지 않았거나 상태가 나빠 일하지 않는다 */
  "not_ready",
  "insufficient_materials",
  /** 부두 둘레에 배가 설 물 칸이 없다 */
  "no_water",
  /** 배가 아니다 */
  "not_boat",
  /** 유닛과 배가 다른 2차맵에 있다 */
  "wrong_map",
  /** 배·봇·수호신이거나 포로·중태·직무·건물 작업으로 움직일 수 없다 */
  "unavailable",
  /** 이미 배에 탔다 */
  "already_aboard",
  /** 배에 자리가 없다 */
  "boat_full",
  /** 배 옆 땅까지 갈 길이 없다 */
  "no_path",
  /** 내리기: 승객이 없다 */
  "empty",
  /** 내리기: 배 둘레에 내릴 땅 칸이 없다(물가로 몰고 가서 다시) */
  "no_shore",
  /** 만들기: 그 부두가 이미 배를 만드는 중(readyAtMs = 그 배가 뜨는 시각, 28판부터). 30판부터는 조선소 도크가 모두 찼다(만들기·수리) */
  "dock_busy",
  // ---------- 30판부터(배 체계 개편, D-547) ----------
  /** 조선소가 아니다(만들기·수리) */
  "not_shipyard",
  /** 정박장이 아니다 */
  "not_berth",
  /** 교역 부두가 아니다 */
  "not_trade_dock",
  /** 그 조선소가 만들지 않는 배 종류 */
  "unknown_boat_type",
  /** 정박장에 빈 정박 자리가 없다 */
  "no_berth",
  /** 교역 부두에 빈 임시 자리가 없다 */
  "trade_full",
  /** 그 시설 주인이 이 배를 받지 않는다(받기 범위) */
  "berth_denied",
  /** 시설 내구도가 기준 아래라 새 배·임시 정박·작업을 받지 않는다(1500) */
  "harbor_closed",
  /** 요금을 낼 돈이 모자라다 */
  "insufficient_funds",
  /** 고칠 것이 없다(내구도 가득) */
  "hull_full",
  /** 조선소 모듈은 레벨 2부터 */
  "module_locked",
  /** 배 시설 설정을 받지 않는 칸(예: 정박장에 모듈) */
  "invalid_policy",
  // ---------- 37판부터(D-559) ----------
  /** 도크에 든 배가 아니다(꺼내기) */
  "not_docked",
  /** 교역 부두에 시간을 사고 대어 있지 않다(연료 보급) */
  "not_moored",
  /** 연료가 가득하다 */
  "fuel_full",
  /** 연료가 없다(오버히트를 켜지 못한다) */
  "fuel_empty",
  /** 오버히트가 식는 중(readyAtMs = 다시 켤 수 있는 시각) */
  "cooling",
  /** 그 유닛이 배에 타고 있지 않다(보직·빼앗기) */
  "not_aboard",
  /** 그 보직 자리가 찼다 */
  "post_full",
  /** 내 배는 빼앗을 수 없다 */
  "own_boat",
  /** 표류하는 배가 아니다(내구도·연료가 남았다) */
  "not_drifting",
] as const;
export type BoatResultCode = (typeof BOAT_RESULT_CODES)[number];

const boatResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("boat_result"),
    id: requestId,
    ok: z.literal(true),
    /** 만들기: 새 배의 유닛 ID */
    boatId: unitId.optional(),
    /** 타기: 걸어가는 중(도착하면 탄다)이면 true */
    walking: z.boolean().optional(),
    /** 만들기: 만드는 중이면 배가 뜨는 시각(서버 ms, 28판부터 — 바로 만들었으면 없고 boatId가 있다) */
    readyAtMs: timeMs.optional(),
  }),
  z.object({
    t: z.literal("boat_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(BOAT_RESULT_CODES),
    /** dock_busy: 만드는 중인 배가 뜨는 시각(28판부터) */
    readyAtMs: timeMs.optional(),
  }),
]);

export const boatClientMessages = [
  boatBuildMessage,
  boatBoardMessage,
  boatLeaveMessage,
  boatRepairMessage,
  boatBerthMessage,
  boatDockTimeMessage,
  harborPolicyMessage,
  boatReleaseMessage,
  boatRefuelMessage,
  boatOverheatMessage,
  boatCrewMessage,
  boatSeizeMessage,
] as const;

/** 37판 결과 코드 → 36판 연결이 아는 코드(새 메시지의 답은 36판 연결이 보내지 않는다 — 만들기·수리 등 옛 메시지에서 나올 수 있는 것만 중요하다) */
export function legacyVoyageCode(code: BoatResultCode): BoatResultCode {
  switch (code) {
    case "not_docked":
    case "not_aboard":
    case "own_boat":
      return "forbidden";
    case "not_moored":
    case "fuel_full":
    case "fuel_empty":
    case "cooling":
    case "post_full":
    case "not_drifting":
      return "busy";
    default:
      return code;
  }
}

/** 30판 결과 코드 → 29판 연결이 아는 코드(새 메시지의 답은 29판 연결이 보내지 않으니 만들기·타기·내리기에서 나올 수 있는 것만 중요하다) */
export function legacyBoatCode(code: BoatResultCode): BoatResultCode {
  switch (code) {
    case "not_shipyard":
    case "not_berth":
    case "not_trade_dock":
      return "not_dock";
    case "harbor_closed":
      return "not_ready";
    case "insufficient_funds":
      return "insufficient_materials";
    case "berth_denied":
    case "invalid_policy":
    case "module_locked":
      return "forbidden";
    case "unknown_boat_type":
    case "no_berth":
    case "trade_full":
    case "hull_full":
      return "busy";
    default:
      return code;
  }
}
export const boatServerMessages = [boatResultMessage] as const;
