// 콘텐츠 팩 형식 버전 (docs/adr/2026-10-28-content-pack-format.md)

/**
 * 이 코드가 읽는 팩 형식 버전. manifest.json의 formatVersion과 같아야 한다.
 * 기존 팩이 더는 통과하지 못하게 스키마를 바꾸면 올리고, 팩도 같은 커밋에서 함께 고친다.
 * 팩 내용의 버전(manifest.json version)과는 다르다.
 */
export const CONTENT_FORMAT_VERSION = 1;

/** 기기·서버가 주고받는 콘텐츠 버전 문자열: "<팩 ID>@<팩 버전>" (예: core@3) */
export function contentVersionOf(packId: string, version: number): string {
  return `${packId}@${version}`;
}
