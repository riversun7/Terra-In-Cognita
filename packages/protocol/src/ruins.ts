// 폐허 복원 메시지(프로토콜 13부터) — 기획 D-510(정부를 먼저 지은 쪽이 주인, 복원 사업으로 지분 투자 모집)·D-339·D-343·D-344,
// docs/adr/2026-11-07-ruins-restoration.md.
// - 정부 짓기는 건물 짓기(facilities.ts facility_build, 시설 단계 government)다: 주인 없는 폐허 자리에서 짓기 시작하면 주인이 된다
//   (13판 연결의 답에만 새 코드 not_ruin·ruin_claimed, 더 낮은 판은 not_buildable).
// - 바꾸는 명령: 모금 열기(restoration_open: 주인만 — 열면 누구나 넣는다), 넣기(restoration_fund: 주인은 언제든, 모금이 열렸으면 누구나 —
//   남은 몫까지만 받는다, 목표를 채우면 도시가 되살아난다), 개발 시험 폐허 만들기(dev_make_ruin, dev·admin). 조회(폐허 목록·주인·모금·내 몫)는
//   tRPC ruins.overview다.
// - 프로토콜 15(폐허 2, 기획 답 480 다·485 다): 새 결과 코드 not_built(정부 건물을 다 짓고 서 있어야 모금을 열고 넣는다)·expired(모금 기한이
//   지났다 — 하루 끝에 돌려준다)는 15판 연결의 답에만 간다. 더 낮은 판은 not_claimed를 받는다(그 판 기기는 모르는 코드라 메시지를 풀지 못한다).
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 폐허·잔고 확인은 서버가 하고, 여기서는 모양만 본다.
import { z } from "zod";

/** 폐허 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const RUINS_PROTOCOL_VERSION = 13;
/** 결과 코드 not_built·expired를 받는 가장 낮은 프로토콜 버전(폐허 2). 더 낮은 판 연결은 not_claimed를 받는다 */
export const RUINS_DEADLINE_PROTOCOL_VERSION = 15;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const amount = z.string().regex(/^(0|[1-9][0-9]{0,30})$/);
const positiveAmount = z.string().regex(/^[1-9][0-9]{0,30}$/);

// ---------- 기기 → 서버 ----------

/** 내가 주인인 폐허의 복원 사업에서 모금을 연다(열면 누구나 넣는다, D-343) */
export const restorationOpenMessage = z.object({
  t: z.literal("restoration_open"),
  id: requestId,
  ruin: rowId,
});

/** 폐허 복원 사업에 넣는다(amount = 10진 문자열 최소 단위, 남은 몫까지만 받는다) */
export const restorationFundMessage = z.object({
  t: z.literal("restoration_fund"),
  id: requestId,
  ruin: rowId,
  amount: positiveAmount,
});

/** 개발 시험: 내 시작 도시 둘레에 주인 없는 폐허를 하나 만든다(dev·admin) */
export const devMakeRuinMessage = z.object({
  t: z.literal("dev_make_ruin"),
  id: requestId,
});

// ---------- 서버 → 기기 ----------

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const RESTORATION_RESULT_CODES = [
  "sign_in_required",
  /** 세계·NPC 사회가 준비 중이거나 저장 대기열이 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 권한 없음(개발 시험 명령) */
  "forbidden",
  /** 사이보그가 아직 없다(나라가 없다) */
  "no_cyborg",
  /** 없는 폐허(이미 복원됐거나 다른 행성) */
  "unknown_ruin",
  /** 아직 주인이 없다(정부를 먼저 지어야 한다) */
  "not_claimed",
  /** 주인이 아니다(모금 열기) */
  "not_owner",
  /** 이미 모금이 열렸다 */
  "already_open",
  /** 모금이 열리지 않았다(주인만 넣는다) */
  "not_open",
  /** 화폐가 모자람 */
  "insufficient_funds",
  /** 넣을 수 없는 값(남은 몫이 없음 등) */
  "invalid_amount",
  /** 도시가 드는 세력이 없다 */
  "no_faction",
  /** 폐허를 둘 자리가 없다(개발 시험) */
  "no_place",
  /** 정부 건물이 아직 다 지어지지 않았거나 0%·사라졌다(프로토콜 15, 기획 답 480 다·487 다) */
  "not_built",
  /** 모금 기한이 지났다(프로토콜 15, 기획 답 485 다 — 하루 끝에 낸 값을 돌려주고 주인 없음) */
  "expired",
] as const;
/** 15판에서 더한 결과 코드(더 낮은 판 연결은 not_claimed로 바꿔 보낸다) */
export const RUINS_DEADLINE_CODES: readonly RestorationResultCode[] = ["not_built", "expired"];
export type RestorationResultCode = (typeof RESTORATION_RESULT_CODES)[number];

const restorationResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("restoration_result"),
    id: requestId,
    ok: z.literal(true),
    /** 명령을 받은 폐허(개발 시험이면 새 폐허) */
    ruinId: rowId.optional(),
    /** 넣기: 받은 값(10진 문자열)과 지금까지 모인 값 */
    accepted: amount.optional(),
    raised: amount.optional(),
    /** 넣기로 목표를 채워 도시가 되살아났나 */
    restored: z.boolean().optional(),
  }),
  z.object({
    t: z.literal("restoration_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(RESTORATION_RESULT_CODES),
  }),
]);

export const ruinsClientMessages = [
  restorationOpenMessage,
  restorationFundMessage,
  devMakeRuinMessage,
] as const;
export const ruinsServerMessages = [restorationResultMessage] as const;
