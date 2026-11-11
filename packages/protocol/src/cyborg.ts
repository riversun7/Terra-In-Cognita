// 사이보그 만들기 메시지 (프로토콜 4부터, 속성 분배는 5부터) — ADR 2026-11-01-first-login-cyborg 4절·"바뀜 (D-450~D-453)",
// 기획 D-6039·D-6040·D-140·D-450.
// - 바꾸는 명령: 초기 스탯 굴리기(cyborg_roll), 만들고 시작 도시에 놓기(cyborg_create, 5판부터 속성 분배 elements를 함께),
//   속성 분배가 없는 사이보그(5판 전에 만든 것)의 한 번 분배(cyborg_elements, 5판부터). 조회(지금 굴림·성향·세력·도시·이름 확인)는
//   tRPC cyborg.*다.
// - 서버가 판정한다: 굴림 값·남은 횟수(서버 저장), 이름 규칙·고유, 외형 ID, 세력·도시, 놓을 자리. 기기는 결과만 보인다.
// - 결과는 cyborg_result 하나로 온다(id = 요청 id). 오류는 문장이 아니라 코드다(기기가 번역).
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 성향·외형 ID 목록은 서버가 확인하고, 여기서는 모양만 본다.
import { z } from "zod";

/** 사이보그 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const CYBORG_PROTOCOL_VERSION = 4;
/**
 * 속성 분배(D-450)가 생긴 판: cyborg_create.elements(5판 연결은 꼭 보낸다, 서버가 본다), cyborg_elements. 4판 연결이 만든 사이보그는
 * 분배 없이 만들어지고(서버가 "분배 기다림"으로 둔다) 새 앱이 cyborg_elements로 한 번 나눈다
 */
export const CYBORG_ELEMENTS_PROTOCOL_VERSION = 5;
/**
 * 3D 외형 한 번 고르기(cyborg_look)가 생긴 판(질문 961 나, docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-11, 961·963)"): 3D 외형을
 * 고르기 전에 만든 사이보그(cyborgs.look 빈 값)가 한 번 무료로 고른다. 결과 코드 look_locked는 이 메시지의 답에만 간다
 */
export const CYBORG_LOOK_PROTOCOL_VERSION = 21;

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

/**
 * 3D 외형(2판, docs/adr/2026-11-11-character-3d.md 1·5절) = 판 번호 + 부위 ID 아홉 + 키 배율(%) + 겉 장갑 단계 + 색 ID 다섯. 모양만 본다 —
 * 목록에 있는 ID·범위 안 값인지는 서버가 @terra/shared isCharacterLook으로 본다. 다른 칸은 받지 않는다
 */
export const characterLookSchema = z.strictObject({
  v: z.literal(2),
  build: listId,
  height: z.number().int().min(1).max(1000),
  head: listId,
  face: listId,
  top: listId,
  torso: listId,
  arms: listId,
  legs: listId,
  back: listId,
  extra: listId,
  plating: z.number().int().min(0).max(100),
  skin: listId,
  primary: listId,
  secondary: listId,
  accent: listId,
  glow: listId,
});

/** 속성 한 칸 점수(0~10, D-182). 적지 않은 칸은 0 */
const elementPoint = z.number().int().min(0).max(10).optional();

/**
 * 속성 분배: 칸 이름(D-167 코드, @terra/shared cyborgElements ELEMENT_IDS와 같은 차례 — 서버 시험이 맞춰 본다) → 점수. 모양만 본다 —
 * 칸 수·합·4원소인지(N36 설정값)는 서버가 @terra/shared checkElementAllocation으로 본다. 모르는 칸은 받지 않는다.
 * (z.record 대신 칸을 적은 객체: 첫 화면 묶음에 레코드 스키마 코드를 넣지 않는다 — 첫 화면 JS 상한, ADR 37 11절)
 */
export const cyborgElementsSchema = z.strictObject({
  water: elementPoint,
  frost: elementPoint,
  fire: elementPoint,
  blaze: elementPoint,
  wind: elementPoint,
  lightning: elementPoint,
  earth: elementPoint,
  crystal: elementPoint,
  light: elementPoint,
  holy: elementPoint,
  dark: elementPoint,
  necro: elementPoint,
});

/** 속성 12칸 코드 차례(위 객체의 칸 차례와 같다 — cyborg.test.ts가 맞춰 본다) */
export const CYBORG_ELEMENT_IDS = [
  "water",
  "frost",
  "fire",
  "blaze",
  "wind",
  "lightning",
  "earth",
  "crystal",
  "light",
  "holy",
  "dark",
  "necro",
] as const satisfies readonly (keyof typeof cyborgElementsSchema.shape)[];

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
  /** 속성 분배(5판부터, D-450). 4판 기기는 보내지 않는다 → 서버가 "분배 기다림"으로 만든다 */
  elements: cyborgElementsSchema.optional(),
  /**
   * 3D 외형(선택 칸, docs/adr/2026-11-11-character-3d.md 5절). 보내면 서버가 저장하고 옛 칸 appearance는 이 외형에서 넘긴 값으로 맞춘다.
   * 더하기만 한 선택 칸이라 프로토콜 판을 올리지 않았다: 옛 서버는 모르는 칸을 버리고(z.object) 옛 기기는 보내지 않는다 — 그러면 옛 외형에서
   * 넘긴 3D 외형으로 보인다
   */
  look: characterLookSchema.optional(),
});

/** 속성 분배가 없는 내 사이보그에 한 번 나눈다(5판부터, D-450). 이미 나눴으면 elements_locked(다시 나누기는 환생 때) */
export const cyborgElementsMessage = z.object({
  t: z.literal("cyborg_elements"),
  id: requestId,
  elements: cyborgElementsSchema,
});

/**
 * 3D 외형을 고르기 전에 만든 내 사이보그가 3D 외형을 한 번 고른다(21판부터, 질문 961 나). 이미 3D 외형이 있으면 look_locked(다시 고르기는
 * 환생 때 D-352, 그 밖에는 계정 서비스 D-7032). 서버가 isCharacterLook으로 보고 저장하며, 옛 칸 appearance는 이 외형에서 넘긴 값으로 맞춘다
 */
export const cyborgLookMessage = z.object({
  t: z.literal("cyborg_look"),
  id: requestId,
  look: characterLookSchema,
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
  /** 속성 분배가 규칙(N36: 4원소 가운데 두 칸까지, 합 10)에 맞지 않거나, 5판 연결이 만들기에 분배를 빠뜨림(5판부터) */
  "elements_invalid",
  /** 이미 속성을 나눴다(cyborg_elements는 한 번, 5판부터) */
  "elements_locked",
  /** 사이보그가 아직 없다(cyborg_elements 5판부터, cyborg_look 21판부터) */
  "no_cyborg",
  /** 이미 3D 외형을 골랐다(cyborg_look은 한 번, 21판부터) */
  "look_locked",
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

export const cyborgClientMessages = [
  cyborgRollMessage,
  cyborgCreateMessage,
  cyborgElementsMessage,
  cyborgLookMessage,
] as const;
export const cyborgServerMessages = [cyborgResultMessage] as const;
