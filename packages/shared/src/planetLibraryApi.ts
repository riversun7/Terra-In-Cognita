// 행성 보관함 API 약속 — 서버 planetEditor.library.*와 기기 편집기가 같이 쓰는 이름 규칙·시작점 종류·이유 코드
// (ADR 2026-10-29-planet-editor-stage1 "바뀜: 행성 보관함", 사용자 결정 2026-10-31 "팀 공용 목록").
// - 보관함 행성 = 편집을 끝내 [저장]한 행성. dev·admin 모두 같은 목록을 보고, 만든 사람이 보인다. ID는 uuid라 바뀌지 않는다
//   (나중 항성계 편집기가 ID로 가리킨다).
// - 정의(definition)는 지금 편집기가 고치는 콘텐츠 팩 행성 항목 모양 그대로다. 서버가 콘텐츠 형식·생성기 입력으로 검사한다
//   (새 세부 수치가 생겨도 보관함은 고칠 것이 없다).
// - 시작점(base): 지금은 팩 행성("pack")뿐이다. 나중에 정의만 있는 표본(태양계 암석 행성 등, 서버가 굽지 않음)을 "template"로
//   더한다 — 그때 이 표와 서버 검사에 종류를 더한다.
import { hasUnstorableText } from "./settings.ts";

/** 이름 상한(코드 포인트, 앞뒤 빈칸을 뗀 뒤). DB 검사(char_length)와 같은 단위 */
export const PLANET_LIBRARY_NAME_MAX = 60;

/** 시작점 종류(지금은 팩 행성뿐. 표본을 더할 때 "template"를 더한다) */
export const PLANET_LIBRARY_BASE_KINDS = ["pack"] as const;
export type PlanetLibraryBaseKind = (typeof PLANET_LIBRARY_BASE_KINDS)[number];

/** 보관함 행성이 시작한 곳 */
export interface PlanetLibraryBase {
  readonly kind: PlanetLibraryBaseKind;
  /** 팩 행성 ID(콘텐츠 ID 규칙) */
  readonly id: string;
}

/**
 * 받지 않음·실패 이유 코드(오류 data.reason). 정의 검사는 초안과 같은 코드를 쓴다(entry_too_large·invalid_entry·
 * unknown_biome·generator_rejected). 그 밖: invalid_name(이름 규칙), unknown_base(팩에 없는 시작점),
 * planet_not_found(없거나 지운 행성), version_not_found, not_author(지우기는 만든 사람·admin만), revision_conflict
 * (다른 사람이 먼저 저장함)
 */
export const PLANET_LIBRARY_REASONS = [
  "invalid_name",
  "unknown_base",
  "planet_not_found",
  "version_not_found",
  "not_author",
  "revision_conflict",
] as const;
export type PlanetLibraryReason = (typeof PLANET_LIBRARY_REASONS)[number];

/** 코드 포인트 수(짝이 맞는 대리 문자 둘은 한 글자). 짝 없는 대리 문자는 한 글자로 센다(그런 글은 아래에서 따로 막는다) */
function codePointLength(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    const next = text.charCodeAt(index + 1);
    if (code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) index += 1;
    count += 1;
  }
  return count;
}

/** 보이지 않는 제어 문자(C0·DEL·C1)가 있는지. 줄바꿈·탭도 이름에는 넣지 않는다 */
function hasControl(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/**
 * 이름 정리·검사: 앞뒤 빈칸을 떼고 1~PLANET_LIBRARY_NAME_MAX 코드 포인트, 제어 문자 없음, DB(jsonb·text)에 담을 수 있는 글자
 * (hasUnstorableText). 맞으면 정리한 이름, 아니면 null
 */
export function normalizePlanetLibraryName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  const length = codePointLength(name);
  if (length === 0 || length > PLANET_LIBRARY_NAME_MAX) return null;
  if (hasControl(name) || hasUnstorableText({ name })) return null;
  return name;
}

export function isPlanetLibraryBase(value: unknown): value is PlanetLibraryBase {
  if (typeof value !== "object" || value === null) return false;
  const kind: unknown = Reflect.get(value, "kind");
  const id: unknown = Reflect.get(value, "id");
  const kinds: readonly unknown[] = PLANET_LIBRARY_BASE_KINDS;
  return kinds.includes(kind) && typeof id === "string" && /^[a-z][a-z0-9_]{1,47}$/.test(id);
}
