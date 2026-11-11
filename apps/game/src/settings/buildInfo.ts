// 설정 → 앱 정보의 빌드 글 — 사용자 지적 2026-11-11 "빌드번호가 직관적이지 않은 무작위수같다. 순차적으로 증가하는형태가 좋을듯".
// 차례로 늘어나는 번호(CI 실행 번호, vite.config.ts __APP_BUILD_NUMBER__)를 앞에, 커밋 앞자리(__APP_BUILD__ — 접속 인사·성능 보고가 쓰는 값)를
// 괄호 안에 둔다: "빌드 307 (8370909)". 번호가 없으면(개발 실행 dev, 손으로 만든 이미지) 앞의 글 그대로 "빌드 dev".
// 순수 함수(시험 대상). 화면 문구는 SettingsPage.tsx가 메시지 키로 만든다.

/** 괄호 안에 보이는 커밋 앞자리 글자 수(git 짧은 해시와 같게) */
export const SHORT_BUILD_LENGTH = 7;

export interface BuildInfo {
  /** 차례 번호(없으면 null) */
  readonly number: string | null;
  /** 커밋 앞자리(번호가 있으면 SHORT_BUILD_LENGTH자, 없으면 받은 그대로 — dev 등) */
  readonly build: string;
}

/** build = __APP_BUILD__, number = __APP_BUILD_NUMBER__(숫자 글이 아니면 없는 것으로 본다) */
export function buildInfo(build: string, number: string): BuildInfo {
  const trimmed = number.trim();
  if (!/^\d+$/.test(trimmed)) return { number: null, build };
  return { number: trimmed, build: build.slice(0, SHORT_BUILD_LENGTH) };
}
