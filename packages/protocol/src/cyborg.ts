// 사이보그 만들기 메시지 (프로토콜 4부터) — ADR 2026-11-01-first-login-cyborg 4절, 기획 D-6039·D-6040·D-140.
// - 바꾸는 명령은 이 둘뿐이다: 초기 스탯 굴리기(cyborg_roll), 만들고 시작 도시에 놓기(cyborg_create).
//   조회(지금 굴림·성향·세력·도시·이름 확인)는 tRPC cyborg.*다.
// - 서버가 판정한다: 굴림 값·남은 횟수(서버 저장), 이름 규칙·고유, 외형 ID, 세력·도시, 놓을 자리. 기기는 결과만 보인다.
// - 결과는 cyborg_result 하나로 온다(id = 요청 id). 오류는 문장이 아니라 코드다(기기가 번역).
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 성향·외형 ID 목록은 서버가 확인하고, 여기서는 모양만 본다.
import { z } from "zod";

/** 사이보그 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const CYBORG_PROTOCOL_VERSION = 4;

const u32 = z.number().int().nonnegative().max(0xffff_ffff);
/** 기기가 정하는 요청 번호(2차맵 명령과 같은 규칙) */
const requestId = u32;
/** 목록 ID 모양(영어 소문자 snake_case). 목록에 있는지는 서버가 본다 */
const listId = z
  .string()
  .min(2)
  .max(32)
  .regex(/^[a-z][a-z0-9_]*$/);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const stat = z.number().int().min(0).max(1000);

/** 외형 = 부위 ID 넷 + 색 ID 둘(D-6040 기술 전달). 다른 칸은 받지 않는다 */
export const cyborgAppearanceSchema = z.strictObject({
  head: listId,
  face: listId,
  body: listId,
  limbs: listId,
  primary: listId,
  accent: listId,
});

/** 1차 스탯 여섯 */
export const cyborgStatsSchema = z.strictObject({
  str: stat,
  dex: stat,
  agi: stat,
  vit: stat,
  int: stat,
  wis: stat,
});

// ---------- 기기 → 서버 ----------

/** 성향을 골라 초기 스탯을 굴린다. 남은 굴림 하나를 쓴다(성향을 바꿔 굴려도 하나, D-445 169) */
export const cyborgRollMessage = z.object({
  t: z.literal("cyborg_roll"),
  id: requestId,
  temperament: listId,
});

/** 만들고 시작 도시에 놓는다. 초기 스탯은 마지막 굴림이다(기기가 보내지 않는다) */
export const cyborgCreateMessage = z.object({
  t: z.literal("cyborg_create"),
  id: requestId,
  /** 친 이름(서버가 NFC·앞뒤 공백 제거 뒤 검사한다) */
  name: z.string().min(1).max(64),
  appearance: cyborgAppearanceSchema,
  factionId: rowId,
  cityId: rowId,
});

// ---------- 서버 → 기기 ----------

/** 만들기 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const CYBORG_RESULT_CODES = [
  "sign_in_required",
  /** 세계가 준비 중이거나 저장 대기열이 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  /** 이미 사이보그가 있다(계정당 하나, D-096) */
  "already_created",
  /** 굴리지 않고 만들려 함 */
  "roll_required",
  /** 굴림을 다 썼다(마지막 값으로 만들 수 있다) */
  "rolls_exhausted",
  "unknown_temperament",
  /** 이름 규칙에 맞지 않음(packages/shared cyborgName) */
  "name_invalid",
  /** 사칭 목록에 걸림 */
  "name_reserved",
  /** 이미 있는 이름(대소문자 무시) */
  "name_taken",
  "appearance_invalid",
  /** 가입할 수 없는 세력 */
  "unknown_faction",
  /** 그 세력의 시작 도시가 아님(또는 그 2차맵이 이 서버에 없음) */
  "unknown_city",
  /** 시작 도시 둘레에 놓을 빈 칸이 없음 */
  "no_room",
  "internal_error",
] as const;
export type CyborgResultCode = (typeof CYBORG_RESULT_CODES)[number];

/** 굴림 결과: 성향·스탯·남은 굴림 */
export const cyborgRollSchema = z.object({
  temperament: listId,
  stats: cyborgStatsSchema,
  rollsLeft: z.number().int().nonnegative().max(1000),
  rollsMax: z.number().int().positive().max(1000),
});
export type CyborgRollWire = z.infer<typeof cyborgRollSchema>;

const cyborgResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("cyborg_result"),
    id: requestId,
    ok: z.literal(true),
    /** cyborg_roll이면 새 굴림 */
    roll: cyborgRollSchema.optional(),
  }),
  z.object({
    t: z.literal("cyborg_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(CYBORG_RESULT_CODES),
  }),
]);

export const cyborgClientMessages = [cyborgRollMessage, cyborgCreateMessage] as const;
export const cyborgServerMessages = [cyborgResultMessage] as const;
