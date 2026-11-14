// 빌드 도장 — 지금 도는 앱·서버가 언제(한국 시각, 분까지) 어느 커밋으로 빌드됐는지(사용자 요청 2026-11-15
// "버전확인도 할수있게 버전을 날짜와 시간 분까지 표시해달라", ADR docs/adr/2026-10-29-app-shell.md "바뀜 (2026-11-14, 빌드 도장)").
// - 빌드 설정(apps/game/vite.config.ts·apps/server/vite.config.ts)이 buildStampSource로 빌드 시각(ISO, UTC)과 커밋 앞 7자를 정해
//   define으로 넣는다. 실행 중에는 buildStampOf가 그 두 글을 한국 시각 "YYYY-MM-DD HH:mm"으로 바꾼다.
// - 개발 실행(Vite 개발 서버, tsx로 띄운 서버, 단위 시험)은 넣은 값이 없어서 둘 다 null("dev")이다. 빌드를 실패시키지 않는다.
// - 순수 함수만 둔다(Node API·현재 시각을 읽지 않는다 — 부르는 쪽이 넘긴다). 시험 대상.

/** 한국 표준시(KST) = UTC+9. 일광 절약 시간이 없어 늘 같다 */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 화면·/health에 보이는 커밋 앞자리 글자 수(git 짧은 해시와 같게) */
export const BUILD_COMMIT_LENGTH = 7;

export interface BuildStamp {
  /** 빌드 시각, 한국 시각 "YYYY-MM-DD HH:mm"(없으면 null — 개발 실행) */
  readonly time: string | null;
  /** 커밋 앞 7자(소문자 16진수, 없으면 null) */
  readonly commit: string | null;
}

/** 두 자리로 채운다 */
function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** UTC 밀리초 → 한국 시각 "YYYY-MM-DD HH:mm"(초 이하는 버린다) */
export function formatKstMinute(ms: number): string {
  const kst = new Date(ms + KST_OFFSET_MS);
  return `${String(kst.getUTCFullYear())}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())} ${pad2(kst.getUTCHours())}:${pad2(kst.getUTCMinutes())}`;
}

/** 16진수 커밋 글 → 앞 7자(소문자). 16진수가 아니면(dev 등) null */
export function shortCommit(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(trimmed)) return null;
  return trimmed.slice(0, BUILD_COMMIT_LENGTH);
}

/** 빌드 설정이 넣은 두 글(ISO 시각·커밋) → 도장. 읽을 수 없는 값은 null */
export function buildStampOf(timeIso: string, commit: string): BuildStamp {
  const trimmed = timeIso.trim();
  const ms = trimmed === "" ? Number.NaN : Date.parse(trimmed);
  return { time: Number.isFinite(ms) ? formatKstMinute(ms) : null, commit: shortCommit(commit) };
}

export interface BuildStampInput {
  /** 개발 서버(vite serve)면 true — 도장을 넣지 않는다 */
  readonly dev: boolean;
  /** 환경 변수 APP_BUILD_TIME(CI·Docker가 넘긴 ISO 시각, 없으면 undefined) */
  readonly envTime: string | undefined;
  /** 환경 변수 APP_BUILD(CI가 넘긴 커밋 앞 12자, 없으면 undefined) */
  readonly envCommit: string | undefined;
  /** 지금 시각(밀리초) — 환경 변수가 없을 때(손으로 빌드) 쓴다 */
  readonly nowMs: number;
  /** git 커밋 해시를 읽는다(실패하면 빈 글). 환경 변수가 커밋이 아닐 때만 부른다 */
  readonly gitCommit: () => string;
}

/** define으로 넣을 두 글: 빌드 시각 ISO(UTC)와 커밋 앞 7자. 모르면 빈 글(빌드는 실패하지 않는다) */
export function buildStampSource(input: BuildStampInput): { readonly time: string; readonly commit: string } {
  if (input.dev) return { time: "", commit: "" };
  const envMs =
    input.envTime === undefined || input.envTime.trim() === "" ? Number.NaN : Date.parse(input.envTime);
  const time = new Date(Number.isFinite(envMs) ? envMs : input.nowMs).toISOString();
  const commit = shortCommit(input.envCommit ?? "") ?? shortCommit(input.gitCommit()) ?? "";
  return { time, commit };
}

/** 도장 → 화면 글 "2026-11-15 08:12 (abc1234)". 하나만 있으면 그것만, 둘 다 없으면 "dev" */
export function buildStampText(stamp: BuildStamp): string {
  if (stamp.time !== null && stamp.commit !== null) return `${stamp.time} (${stamp.commit})`;
  return stamp.time ?? stamp.commit ?? "dev";
}

/** 앱과 서버가 다른 커밋으로 빌드됐는지. 어느 한쪽 커밋을 모르면(개발 실행) false */
export function buildsDiffer(app: BuildStamp, server: BuildStamp): boolean {
  return app.commit !== null && server.commit !== null && app.commit !== server.commit;
}
