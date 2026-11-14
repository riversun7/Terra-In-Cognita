// 배 메시지(프로토콜 27부터) — docs/adr/2026-11-13-boats.md, 기획 D-540(1221 "지도 위 배부터").
// - 바꾸는 명령: 배 만들기(boat_build: 다 지은 부두에서 배 하나를 만들어 둘레 물 칸에 세운다), 타기(boat_board: 내 유닛이 내 배에 탄다 — 멀면 배 옆 땅까지
//   걸어간 뒤 탄다), 내리기(boat_leave: 그 배의 승객 모두가 배 둘레 땅 칸에 내린다). 배를 움직이는 것은 보통 이동 명령(move_unit)이다 — 서버가 배는 물 길로 푼다.
// - 결과의 ok는 그 일이 되었거나(만들기·내리기·바로 탄 타기) 걷기를 시작했다(먼 타기)는 뜻이다.
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 소유·거리·재료 판정은 서버가 하고, 여기서는 모양만 본다.
import { z } from "zod";

/** 배 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const BOAT_PROTOCOL_VERSION = 27;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const unitId = z.number().int().positive().max(0xffff_ffff);
const buildingId = z.number().int().positive().max(0xffff_ffff);

// ---------- 기기 → 서버 ----------

/** 그 부두에서 배 하나를 만든다(재료는 그 도시 창고·내 창고 시설·그 2차맵 내 유닛 화물, 운영자 모드는 재료 없이) */
export const boatBuildMessage = z.object({
  t: z.literal("boat_build"),
  id: requestId,
  buildingId,
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
  }),
  z.object({
    t: z.literal("boat_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(BOAT_RESULT_CODES),
  }),
]);

export const boatClientMessages = [boatBuildMessage, boatBoardMessage, boatLeaveMessage] as const;
export const boatServerMessages = [boatResultMessage] as const;
