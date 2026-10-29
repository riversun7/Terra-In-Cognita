// 행성 초안 API 약속 — 서버 planetEditor.drafts.save(ADR 2026-10-29-planet-editor-stage1 9절, WP-B)와 기기 편집기
// (가져오기 미리 검사, apps/game/src/editor/planet/draftExport.ts)가 같은 상한·받지 않음 코드를 쓴다.
// 서버는 틀리면 BAD_REQUEST와 아래 코드 하나를 준다(문장은 주지 않는다). 화면은 코드를 메시지 키로 바꾼다(ko·en).
// 기기 가져오기는 초안을 바꾸기 전에 같은 검사를 먼저 해서 같은 코드를 낸다. 콘텐츠 형식 전체 검사(planetEntrySchema: 이름 등)는
// 서버만 한다(게임 앱은 콘텐츠 패키지를 가져오지 않는다). 그래서 기기 검사를 통과해도 서버가 invalid_entry를 줄 수 있다.

/** 직렬화한 행성 항목(planetDraftEntryBytes)의 상한(바이트) */
export const PLANET_DRAFT_ENTRY_MAX_BYTES = 8 * 1024;

/**
 * 받지 않음 코드(검사 차례대로):
 * entry_too_large = 직렬화한 항목이 상한을 넘음, invalid_entry = 항목 모양이 틀림(콘텐츠 형식·생성기 입력 모양),
 * unknown_biome = 팩에 없는 바이옴 참조, unknown_planet = 팩에 없는 행성 ID, generator_rejected = 생성기 입력 확인
 * (validatePlanetInput) 실패
 */
export const PLANET_DRAFT_REJECT_CODES = [
  "entry_too_large",
  "invalid_entry",
  "unknown_biome",
  "unknown_planet",
  "generator_rejected",
] as const;

export type PlanetDraftRejectCode = (typeof PLANET_DRAFT_REJECT_CODES)[number];

export function isPlanetDraftRejectCode(value: unknown): value is PlanetDraftRejectCode {
  const codes: readonly unknown[] = PLANET_DRAFT_REJECT_CODES;
  return codes.includes(value);
}

/** 문자열의 UTF-8 바이트 수. 짝 없는 대리 문자는 TextEncoder처럼 U+FFFD(3바이트)로 센다 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && (text.charCodeAt(index + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

/** 행성 항목을 직렬화한 크기: JSON.stringify(들여쓰기 없음)의 UTF-8 바이트. 서버·기기가 이 함수로 잰다 */
export function planetDraftEntryBytes(entry: unknown): number {
  return utf8ByteLength(JSON.stringify(entry) ?? "");
}
