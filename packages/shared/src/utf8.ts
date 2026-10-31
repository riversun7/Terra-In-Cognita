// UTF-8 바이트 세기 — 크기 상한을 재는 곳이 같이 쓴다: 계정 설정 묶음(settings.ts, 첫 화면 모듈)과
// 행성 초안 항목(planetDraftApi.ts). 첫 화면 모듈이 행성 편집기 약속 파일을 가져오지 않게 따로 둔다.
// 이 꾸러미는 "sideEffects": false라 맨 위에서 부르는 코드를 두지 않는다(AGENTS.md 6장).

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
