// 2차맵 원자재 오브젝트 채집·건물 들어가기 메시지(프로토콜 17부터) — docs/adr/2026-11-07-gather-objects.md,
// 사용자 지적(2026-11-07) "숲이나 건물로 진입 등의 상호작용 불가"·"2차맵에 바이옴에 따른 원자재 채집 오브젝트 미구현상태".
// - 바꾸는 명령: 채집 시작(gather_start: 내 유닛이 그 오브젝트로 걸어가 캐고, 화물이 차면 가까운 넣는 곳에 넣고 돌아와 되풀이),
//   채집 멈추기(gather_stop: 그 자리에 선다, 든 화물은 그대로), 들어가기(unit_enter: 내 유닛이 그 건물로 걸어가 화물을 넣거나·직무를 받거나·
//   안에 머문다). 조회(오브젝트 목록·내 채집·건물 안 유닛)는 tRPC gather.*다.
// - 결과의 ok는 처음 걷기를 시작했다는 뜻이다(채집·넣기·들어가기 끝이 아니다). 진행은 tRPC gather.loops가 알린다.
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 소유·거리·자리 판정은 서버가 하고, 여기서는 모양만 본다.
import { z } from "zod";

/** 채집·들어가기 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const GATHER_PROTOCOL_VERSION = 17;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const unitId = z.number().int().positive().max(0xffff_ffff);
const buildingId = z.number().int().positive().max(0xffff_ffff);
/** 2차맵 키 = 그 1차맵 칸의 셀 키. 셀 키 검사는 서버가 한다 */
const mapKey = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/**
 * 오브젝트 번호 = 그 2차맵 안 기준 배치 칸 차례(y × 256 + x), 움직이는 어군은 65,536부터(서버 SCHOOL_ID_BASE, 프로토콜 26 — 기획 D-536).
 * 상한 2^20 − 1
 */
const objectId = z.number().int().nonnegative().max(0xf_ffff);

// ---------- 기기 → 서버 ----------

/** 내 유닛으로 그 2차맵의 오브젝트를 채집한다(이미 채집 중이면 새 오브젝트로 바꾼다) */
export const gatherStartMessage = z.object({
  t: z.literal("gather_start"),
  id: requestId,
  unitId,
  mapKey,
  objectId,
});

/** 채집을 멈춘다(그 자리에 선다) */
export const gatherStopMessage = z.object({
  t: z.literal("gather_stop"),
  id: requestId,
  unitId,
});

/** 내 유닛을 그 건물에 들어가게 한다(걸어가서: 화물 넣기 → 직무 받기 → 안에 머물기 차례로 되는 것) */
export const unitEnterMessage = z.object({
  t: z.literal("unit_enter"),
  id: requestId,
  unitId,
  buildingId,
});

// ---------- 서버 → 기기 ----------

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const GATHER_RESULT_CODES = [
  "sign_in_required",
  /** 세계가 준비 중이거나 길 찾기가 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 내 유닛이 아니거나 옮길 수 없는 유닛(수호신·봇) */
  "forbidden",
  /** 띄운 2차맵에 없는 유닛 */
  "unknown_unit",
  /** 그 2차맵에 그 오브젝트가 없다 */
  "unknown_object",
  /** 그 건물이 없다(유닛과 다른 2차맵 포함) */
  "unknown_building",
  /** 유닛이 그 오브젝트·건물과 다른 2차맵에 있다 */
  "wrong_map",
  /** 오브젝트가 떨어졌다(다시 자라는 중) */
  "depleted",
  /** 포로·중태·건물 작업·노동 계약 등으로 움직일 수 없다 */
  "unavailable",
  /** 오브젝트·건물 둘레에 설 곳이 없거나 길이 없다 */
  "no_path",
  /** 멈추기: 채집 중이 아니다 */
  "not_gathering",
] as const;
export type GatherResultCode = (typeof GATHER_RESULT_CODES)[number];

const gatherResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("gather_result"),
    id: requestId,
    ok: z.literal(true),
  }),
  z.object({
    t: z.literal("gather_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(GATHER_RESULT_CODES),
  }),
]);

export const gatherClientMessages = [gatherStartMessage, gatherStopMessage, unitEnterMessage] as const;
export const gatherServerMessages = [gatherResultMessage] as const;
