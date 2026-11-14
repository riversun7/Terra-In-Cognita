// 버전 줄 — 앱·서버 빌드 도장(한국 시각, 분까지 + 커밋 앞 7자)과 콘텐츠 팩 판(사용자 요청 2026-11-15 "버전확인도 할수있게
// 버전을 날짜와 시간 분까지 표시해달라", ADR docs/adr/2026-10-29-app-shell.md "바뀜 (2026-11-14, 빌드 도장)").
// 앱 도장은 빌드 설정(vite.config.ts buildStamp)이 넣은 값, 서버 도장·팩 판은 tRPC system.info(서버 /health와 같은 값)다.
// 화면 글 조립은 순수 함수(versionLine, 시험 대상)이고, 문구는 메시지 키다.
import { type BuildStamp, buildStampOf, buildStampText, buildsDiffer } from "@terra/shared/buildStamp";
import { m } from "../paraglide/messages.js";

/** 이 기기가 쓰는 앱의 빌드 도장. 개발 서버·단위 시험은 넣은 값이 없어서 둘 다 null("dev") */
export const APP_BUILD_STAMP: BuildStamp = buildStampOf(
  typeof __APP_BUILD_TIME__ === "string" ? __APP_BUILD_TIME__ : "",
  typeof __APP_BUILD_COMMIT__ === "string" ? __APP_BUILD_COMMIT__ : "",
);

/** 서버 버전 묻기 상태 */
export type ServerVersion =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "ok"; readonly build: BuildStamp; readonly contentVersion: string };

export interface VersionLine {
  /** 한 줄로 이을 조각들: 앱 · 서버 · 팩(팩은 서버 답을 받은 뒤에만) */
  readonly parts: readonly string[];
  /** 앱과 서버 커밋이 다르다 → 새 버전 안내를 붙인다 */
  readonly mismatch: boolean;
}

/** 앱 도장과 서버 상태 → 버전 줄 조각. 예: ["앱 2026-11-15 08:12 (abc1234)", "서버 2026-11-15 08:20 (def5678)", "팩 core@92"] */
export function versionLine(app: BuildStamp, server: ServerVersion): VersionLine {
  const appPart = m.settings_version_app({ stamp: buildStampText(app) });
  if (server.kind === "loading") return { parts: [appPart, m.settings_version_server_loading()], mismatch: false };
  if (server.kind === "error") return { parts: [appPart, m.settings_version_server_unknown()], mismatch: false };
  return {
    parts: [
      appPart,
      m.settings_version_server({ stamp: buildStampText(server.build) }),
      m.settings_version_pack({ pack: server.contentVersion }),
    ],
    mismatch: buildsDiffer(app, server.build),
  };
}
