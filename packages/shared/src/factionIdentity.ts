// 플레이어 세력 정체성(이름·약어·시그니처 컬러·마크) — 규칙·자료 모양. 서버(apps/server/src/factionIdentity/)와 화면
// (apps/game/src/faction/identity/)이 같이 쓴다. docs/adr/2026-11-11-faction-identity.md.
// 사용자 결정(2026-11-11, 질문 905 답): "플레이어도 npc 세력 구성처럼 세력생성시 동일하게 생성과정 필요. 용량제한걸고 크롭한부분만
// 저장하는 방법?" — NPC 국가와 같은 과정(이름·약어·색·마크 만들기 또는 올려서 자르기)을 플레이어 세력에도 쓴다.
// - 이름 규칙 = 사이보그 이름 규칙(D-328 → D-134): 한글·영문·숫자, 한글 1자 = 2칸으로 3~16칸, 서버에서 하나(대소문자 무시), 사칭 막기
//   + 실존 국가·도시 이름 막기(D-328, 목록은 [임시] — 같은 자리에 자료로 더한다). 한 언어로 넣고 번역하지 않는다(D-328 해석).
// - 약어(지도 태그): 글자·숫자, 새로 정하는 약어는 설정 칸 S20 폭(출발값 2~4자, D-328 — 질문 928 나). 이미 정한 5자 약어는 그대로 둔다
//   (저장 폭은 @terra/shared/factionProfile과 같은 2~5자). 세계에서 하나.
// - 정체성을 처음 정하면 그것이 곧 가문 창설이다(질문 926 나 — 세력 행을 만들고, 창설자는 자기 NPC 국가의 시민으로 남는다, D-216).
// - 색: 지도 바탕 두 가지에서 읽기 쉬운 색 20개 가운데 하나(플레이어는 색 값을 직접 넣지 않는다).
// - 마크: 만든 마크(@terra/shared/nationEmblem 사양) 또는 올린 그림(256 × 256 PNG, 바이트 상한 — 기기가 잘라 만든 것만).
// 진입점은 @terra/shared/factionIdentity다(첫 화면 묶음에 들어가지 않게 index.ts에서 내보내지 않는다).
import { type CyborgNameProblem, parseCyborgName } from "./cyborgName.ts";
import type { NameStyleId } from "./nameGen.ts";
import { NATION_EMBLEM_UPLOAD } from "./nationEditor.ts";
import {
  EMBLEM_CHARGES,
  EMBLEM_DIVISIONS,
  EMBLEM_SCHEME_COUNT,
  EMBLEM_SHAPES,
  type NationEmblemSpec,
  contrastOf,
} from "./nationEmblem.ts";

/** 올리는 마크: NPC 국가 마크와 같은 크기·바이트 상한(정사각 256px PNG, 20만 바이트) */
export const FACTION_EMBLEM_UPLOAD = NATION_EMBLEM_UPLOAD;

/**
 * 올린 PNG에 있어도 되는 청크(그 밖의 청크가 있으면 서버가 거절한다 — 글·EXIF·색 프로파일 같은 덧붙임 자료를 받지 않는다).
 * 기기는 올리기 전에 이 목록 밖 청크를 덜어 낸다(브라우저마다 캔버스가 덧붙이는 청크가 다르다)
 */
export const FACTION_EMBLEM_CHUNKS: ReadonlySet<string> = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "gAMA",
  "sRGB",
]);

/** base64 글 길이 상한(바이트 상한의 4/3 + 채움) */
export const FACTION_EMBLEM_BASE64_MAX = Math.ceil(FACTION_EMBLEM_UPLOAD.maxBytes / 3) * 4;

/**
 * 이름·약어를 다시 바꾸려면 기다리는 시간의 출발값(D-328 "바꾸려면 실제 며칠을 기다린다", 49 S20 — 질문 932 가). 실제 값은 설정 칸
 * house_rename_wait_ms(서버가 읽는다). 이 상수는 설정 칸이 없는 서버·시험의 기본값이다
 */
export const FACTION_RENAME_WAIT_MS = 7 * 24 * 60 * 60 * 1000;

/** 약어 글자 수 폭 */
export interface FactionShortRange {
  readonly min: number;
  readonly max: number;
}

/** 저장할 수 있는 약어 폭(표 검사 faction_identities_short·faction_profiles_short와 같다 — 옛 5자 약어도 담는다) */
export const FACTION_SHORT_LIMITS: FactionShortRange = { min: 2, max: 5 };

/** 새로 정하는 약어 폭의 출발값(D-328 "태그 2~4자", 49 S20 — 실제 값은 설정 칸 s20_short_min·s20_short_max) */
export const FACTION_SHORT_DEFAULT_RANGE: FactionShortRange = { min: 2, max: 4 };

/** 설정 칸 값을 저장 폭 안으로 좁힌다(최소 ≤ 최대) */
export function clampShortRange(range: FactionShortRange): FactionShortRange {
  const min = Math.min(Math.max(Math.trunc(range.min), FACTION_SHORT_LIMITS.min), FACTION_SHORT_LIMITS.max);
  const max = Math.min(Math.max(Math.trunc(range.max), min), FACTION_SHORT_LIMITS.max);
  return { min, max };
}

/** 사유 글(운영자가 마크를 내릴 때 주인에게 보이는 글) 길이 상한 */
export const FACTION_NOTICE_REASON_MAX = 200;

/**
 * 고를 수 있는 시그니처 컬러 20개 — 밝은·어두운 지도 바탕 모두와 대비 2 이상인 중간 밝기 색(시작 국가 설정 편집기의 고르기 판과 같다,
 * 시험이 대비를 본다). 색 표지·지도 이름표에만 쓰는 그림 자료다(화면 글자색이 아니다)
 */
export const FACTION_IDENTITY_COLORS = [
  "#c0392b",
  "#d35400",
  "#b9770e",
  "#8a7a12",
  "#5d8a1e",
  "#27ae60",
  "#16a085",
  "#0f8fa8",
  "#2980b9",
  "#0984e3",
  "#4a69bd",
  "#6c5ce7",
  "#8e44ad",
  "#b03a94",
  "#e84393",
  "#c2185b",
  "#a04848",
  "#8d6e63",
  "#607d8b",
  "#5f6f52",
] as const;

export const isIdentityColor = (value: string): boolean =>
  (FACTION_IDENTITY_COLORS as readonly string[]).includes(value);

/** 지도 바탕 두 가지(밝은·어두운 테마의 지도 판) [임시] — 이름표 미리 보기가 쓴다 */
export const MAP_LABEL_LIGHT = "#f4f1ea";
export const MAP_LABEL_DARK = "#12161c";

/** 색 표지 위에 놓을 글 색(흰 글·검은 글 가운데 더 대비되는 쪽) */
export function labelTextOn(color: string): string {
  const light = "#ffffff";
  const dark = "#111418";
  return contrastOf(color, light) >= contrastOf(color, dark) ? light : dark;
}

/**
 * [임시] 실존 국가·도시 이름(D-328 "실존 국가·도시 이름은 막는다", 예: '대한민국'·'서울'). 열쇠(소문자)가 이 가운데 하나와 같으면 막는다.
 * 목록은 출발값이다 — 기획이 목록을 정하면 같은 자리에 더한다(질문 929). 외부 목록을 들일 때는 라이선스를 본다(질문 171과 같다)
 */
export const FACTION_NAME_REAL_PLACES: ReadonlySet<string> = new Set([
  "대한민국",
  "한국",
  "북한",
  "조선",
  "일본",
  "중국",
  "미국",
  "러시아",
  "영국",
  "프랑스",
  "독일",
  "서울",
  "부산",
  "평양",
  "도쿄",
  "베이징",
  "뉴욕",
  "런던",
  "파리",
  "korea",
  "japan",
  "china",
  "america",
  "usa",
  "russia",
  "england",
  "britain",
  "france",
  "germany",
  "seoul",
  "busan",
  "tokyo",
  "beijing",
  "newyork",
  "london",
  "paris",
]);

export type FactionNameProblem = CyborgNameProblem | "real_place";

export type FactionNameResult =
  | { readonly ok: true; readonly display: string; readonly key: string }
  | { readonly ok: false; readonly problem: FactionNameProblem };

/** 세력 이름을 정규화하고 검사한다(사이보그 이름 규칙 + 실존 지명). 고유한지는 서버가 본다 */
export function parseFactionName(input: string): FactionNameResult {
  const parsed = parseCyborgName(input);
  if (!parsed.ok) return parsed;
  if (FACTION_NAME_REAL_PLACES.has(parsed.key)) return { ok: false, problem: "real_place" };
  return parsed;
}

/** 약어에 쓸 수 있는 글자: 한글 완성형·영문·숫자(이름과 같은 글자 — 모양이 비슷한 다른 나라 글자를 받지 않는다) */
const SHORT_ALLOWED = /^[0-9A-Za-z가-힣]+$/u;
const SHORT_HAS_LETTER = /[A-Za-z가-힣]/u;
/** [임시] 사칭으로 막는 약어(열쇠 = 소문자, 전체가 같을 때) */
export const FACTION_SHORT_RESERVED: ReadonlySet<string> = new Set([
  "gm",
  "dev",
  "admin",
  "staff",
  "npc",
  "운영",
  "관리자",
  "운영자",
]);

export type FactionShortProblem =
  | "empty"
  | "invalid"
  | "too_short"
  | "too_long"
  | "needs_letter"
  | "reserved";

export type FactionShortResult =
  | { readonly ok: true; readonly display: string; readonly key: string }
  | { readonly ok: false; readonly problem: FactionShortProblem };

/**
 * 약어를 정규화하고 검사한다: 앞뒤 공백 제거 → NFC → 글자 → 길이(range, 기본 = 저장 폭 2~5자) → 사칭 → 소문자 열쇠.
 * 새로 정하는 약어는 설정 칸 폭(FACTION_SHORT_DEFAULT_RANGE 출발값)으로 부른다 — 이미 정한 약어를 그대로 두는 저장은 저장 폭으로 본다
 */
export function parseFactionShort(
  input: string,
  range: FactionShortRange = FACTION_SHORT_LIMITS,
): FactionShortResult {
  if (input.length > 32) return { ok: false, problem: "invalid" };
  const display = input.trim().normalize("NFC");
  if (display.length === 0) return { ok: false, problem: "empty" };
  if (!SHORT_ALLOWED.test(display)) return { ok: false, problem: "invalid" };
  const bounds = clampShortRange(range);
  if (display.length < bounds.min) return { ok: false, problem: "too_short" };
  if (display.length > bounds.max) return { ok: false, problem: "too_long" };
  if (!SHORT_HAS_LETTER.test(display)) return { ok: false, problem: "needs_letter" };
  const key = display.toLowerCase();
  if (FACTION_SHORT_RESERVED.has(key)) return { ok: false, problem: "reserved" };
  return { ok: true, display, key };
}

/** 마크 사양이 목록 안의 값인가(서버가 받기 전에 본다) */
export function isEmblemSpec(value: {
  readonly shape: string;
  readonly division: string;
  readonly charge: string;
  readonly scheme: number;
}): value is NationEmblemSpec {
  return (
    (EMBLEM_SHAPES as readonly string[]).includes(value.shape) &&
    (EMBLEM_DIVISIONS as readonly string[]).includes(value.division) &&
    (EMBLEM_CHARGES as readonly string[]).includes(value.charge) &&
    Number.isInteger(value.scheme) &&
    value.scheme >= 0 &&
    value.scheme < EMBLEM_SCHEME_COUNT
  );
}

// ── 조회·저장 모양(tRPC factionIdentity) ──

/** 세력 정체성 한 줄(게임 화면이 그리는 값) */
export interface FactionIdentityView {
  readonly name: string;
  readonly shortName: string;
  readonly color: string;
  readonly emblem: NationEmblemSpec;
  /** 올린 그림 해시(있으면 그림이 먼저) */
  readonly uploaded: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** 운영자가 마크를 내렸을 때 주인에게 보이는 알림 */
export interface FactionIdentityNotice {
  readonly kind: "emblem_removed";
  /** 운영자가 적은 사유(없으면 null) */
  readonly reason: string | null;
  readonly at: number;
}

/** 그림을 올릴 수 없는 까닭: 세계 스위치가 꺼짐 / 이 계정은 올리기가 막힘 */
export type FactionUploadBlock = "switch_off" | "account_blocked";

/** 창설한 가문(세력 행, kind = player — 질문 926 나). 창설자는 자기 NPC 국가의 시민으로 남는다(D-216 이중 소속) */
export interface FactionHouseView {
  /** 가문 세력 행 ID */
  readonly factionId: number;
  readonly foundedAt: number;
  /** 가문이 든 나라(창설할 때 창설자의 나라 — factions.born_of). 없으면 null */
  readonly nationId: number | null;
}

export interface FactionIdentityMine {
  /** 아직 정하지 않았으면 null */
  readonly identity: FactionIdentityView | null;
  /** 가문을 창설했으면 그 가문(정체성만 저장하고 창설을 마치지 못했으면 null) */
  readonly house: FactionHouseView | null;
  /** 가문 창설 비용(10진 글자 최소 단위, 설정 칸 house_found_cost — 출발값 0). 기기가 본 값을 창설 명령에 실어 보낸다 */
  readonly foundCost: string;
  /** 새로 정하는 약어의 글자 수 폭(설정 칸 S20) */
  readonly shortRange: FactionShortRange;
  /** 그림 올리기(null = 올릴 수 있다) */
  readonly uploadBlock: FactionUploadBlock | null;
  readonly notice: FactionIdentityNotice | null;
  /** 이름·약어를 바꿀 수 있는 가장 이른 시각(지났거나 처음이거나 창설 전이면 null — 대기는 창설한 가문에만) */
  readonly renameAt: number | null;
  /**
   * 운영자가 이름을 여러 번 되돌려 이름·약어 바꾸기가 막혔나(질문 1006 나 — 운영자가 풀 때까지). 막혀도 색·마크는 지금 이름 그대로 저장한다.
   * 옛 서버는 이 칸을 보내지 않는다(없으면 false)
   */
  readonly renameBlocked?: boolean | undefined;
  /** 이름 만들기·기본 마크의 씨앗(계정마다 다르고 늘 같다) */
  readonly seed: number;
  /** 이름 만들기 말씨(내 나라 프리셋의 말씨, 없으면 null) */
  readonly nameStyle: NameStyleId | null;
}

/** 이름·약어 확인 결과(칸마다 문제 코드, 없으면 null) */
export interface FactionIdentityCheck {
  readonly name: FactionNameProblem | "taken" | null;
  readonly shortName: FactionShortProblem | "taken" | null;
}

/** 올린 그림을 어떻게 할지: 그대로 / 지우고 만든 마크 / 새 그림(256 × 256 PNG base64) */
export type FactionEmblemUploadInput =
  | { readonly mode: "keep" }
  | { readonly mode: "none" }
  | { readonly mode: "new"; readonly pngBase64: string };

export interface FactionIdentityInput {
  readonly name: string;
  readonly shortName: string;
  readonly color: string;
  readonly emblem: NationEmblemSpec;
  readonly upload: FactionEmblemUploadInput;
}

/** 저장을 받지 않은 까닭(error.data.reason) */
export const FACTION_IDENTITY_REASONS = [
  "name_invalid",
  "name_taken",
  "short_invalid",
  "short_taken",
  "color_invalid",
  "emblem_invalid",
  "rename_wait",
  "rename_blocked",
  "upload_off",
  "upload_blocked",
  "emblem_not_png",
  "emblem_wrong_size",
  "emblem_too_large",
  "emblem_bad_chunk",
  "emblem_bad_data",
  "no_upload",
  "rate_limited",
] as const;
export type FactionIdentityReason = (typeof FACTION_IDENTITY_REASONS)[number];

// ── 신고(질문 930 나) ──

/**
 * 다른 가문의 마크·이름 신고 결과: 받음 / 이미 신고함(세지 않는다) / 오늘 신고 수를 다 씀(설정 칸 house_report_daily) / 내 가문 / 없는 가문
 */
export type FactionReportStatus = "reported" | "already" | "limit" | "own" | "unknown";

export interface FactionReportResult {
  readonly status: FactionReportStatus;
}

// ── 운영자 콘솔 "마크 관리" ──

/** 목록 차례: 최근 올린 차례 / 신고가 많은 차례 */
export const OPS_EMBLEM_SORTS = ["recent", "reports"] as const;
export type OpsEmblemSort = (typeof OPS_EMBLEM_SORTS)[number];

export interface OpsEmblemRow {
  readonly userId: string;
  /** 가문 세력 행 ID(창설 전이면 null) */
  readonly factionId: number | null;
  /** 받은 신고 수(운영자가 넘기거나 마크를 내리면 0으로) */
  readonly reports: number;
  /** 지금까지 마크를 내린 횟수(설정 칸 house_takedown_block 이상이면 올리기가 저절로 막힌다 — 질문 934 나) */
  readonly takedowns: number;
  /** 주인 로그인 아이디·사이보그 이름(없으면 null) */
  readonly loginId: string;
  readonly cyborgName: string | null;
  readonly name: string;
  readonly shortName: string;
  readonly color: string;
  readonly emblem: NationEmblemSpec;
  /** 지금 올린 그림(없으면 null) */
  readonly uploaded: { readonly hash: string; readonly bytes: number; readonly at: number } | null;
  /** 이 계정의 그림 올리기를 막았나 */
  readonly uploadBlocked: boolean;
  /** 운영자가 이름을 되돌린 횟수(설정 칸 house_name_reset_block 이상이면 이름 바꾸기가 저절로 막힌다 — 질문 1006 나) */
  readonly nameResets: number;
  /** 이름·약어 바꾸기를 막았나 */
  readonly renameBlocked: boolean;
  /** 마지막으로 내린 기록(주인이 아직 확인하지 않은 알림) */
  readonly notice: FactionIdentityNotice | null;
}

export interface OpsEmblemList {
  /** 플레이어 마크 올리기 허용(세계 스위치) */
  readonly uploadAllowed: boolean;
  /** 올린 그림이 있는 세력(최근 올린 차례) + 올리기가 막혔거나 내린 알림이 남은 세력 */
  readonly rows: readonly OpsEmblemRow[];
  /** 정체성을 정한 플레이어 세력 수 */
  readonly total: number;
  /** 마크를 이만큼 내리면 올리기가 저절로 막힌다(설정 칸, 0 = 끔) */
  readonly autoBlockAt: number;
  /** 이름을 이만큼 되돌리면 이름 바꾸기가 저절로 막힌다(설정 칸 house_name_reset_block, 0 = 끔) */
  readonly renameBlockAt: number;
}
