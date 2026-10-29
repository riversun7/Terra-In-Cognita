// 콘텐츠 팩 불러오기 — 서버 시작 때 1·2·4a단계(스키마·참조·ID 변경표)를 검사한다 (PLAN 7장).
// 하나라도 틀리면 시작하지 않는다 → 컨테이너가 healthy가 되지 않아 배포가 직전 버전으로 되돌린다(ops/deploy.sh 7단계).
import { type ContentPack, formatIssue, hasErrors } from "@terra/content";
import { loadContentPack } from "@terra/content/node";

export interface ServerContent {
  /** "<팩 ID>@<팩 버전>" — /health, WebSocket welcome, tRPC system.info */
  version: string;
  /** 정규 JSON의 SHA-256 — /health (배포 점검이 CI 값과 비교) */
  hash: string;
  /** 기획 확정 전 임시 팩인지 */
  placeholder: boolean;
}

export type ContentLoadResult =
  /** pack: 검증을 통과한 항목(행성 원본을 만든다, src/planet/sources.ts planetSpecsFromPack) */
  | { ok: true; content: ServerContent; pack: ContentPack; warnings: string[] }
  | { ok: false; lines: string[] };

export function loadServerContent(dir: string): ContentLoadResult {
  const loaded = loadContentPack(dir);
  const lines = loaded.issues.map((issue) => formatIssue(issue, `${dir}/`));
  if (hasErrors(loaded.issues) || !loaded.pack || !loaded.version || !loaded.hash) {
    return { ok: false, lines: [...lines, `콘텐츠 팩 검증 실패(${dir}) — 서버를 시작하지 않습니다`] };
  }
  return {
    ok: true,
    content: {
      version: loaded.version,
      hash: loaded.hash,
      placeholder: loaded.pack.manifest.placeholder === true,
    },
    pack: loaded.pack,
    warnings: lines,
  };
}
