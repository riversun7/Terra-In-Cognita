// 서버 빌드 도장 — 빌드 시각(한국 시각, 분까지)과 커밋 앞 7자(ADR docs/adr/2026-10-29-app-shell.md "바뀜 (2026-11-14, 빌드 도장)").
// 값은 서버 빌드(vite.config.ts buildStamp)가 define으로 넣는다. tsx로 띄운 개발 서버·단위 시험에는 넣은 값이 없어서
// 둘 다 null이다(/health build: { time: null, commit: null }, 화면은 "dev"). /health와 tRPC system.info가 공개한다(비밀값 아님).
import { type BuildStamp, buildStampOf } from "@terra/shared/buildStamp";

// 빌드할 때만 있는 전역(define). 없으면 typeof가 "undefined"라 오류 없이 빈 글로 읽는다
declare const __SERVER_BUILD_TIME__: string | undefined;
declare const __SERVER_BUILD_COMMIT__: string | undefined;

/** 이 서버 프로세스의 빌드 도장 */
export const SERVER_BUILD: BuildStamp = buildStampOf(
  typeof __SERVER_BUILD_TIME__ === "string" ? __SERVER_BUILD_TIME__ : "",
  typeof __SERVER_BUILD_COMMIT__ === "string" ? __SERVER_BUILD_COMMIT__ : "",
);
