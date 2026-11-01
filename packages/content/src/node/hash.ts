// 팩 해시 — 정규 JSON의 SHA-256(16진수 64자). /health의 contentHash, 배포 점검의 비교 값
import { createHash } from "node:crypto";
import { canonicalPackJson, sortKeys } from "../canonical.ts";
import { parsePackFiles } from "../pack.ts";

/** 줄 바꿈·들여쓰기·키 순서·항목 순서만 다르면 같은 해시가 나온다 */
export function hashPack(files: ReadonlyMap<string, string>): string {
  return createHash("sha256")
    .update(canonicalPackJson(parsePackFiles(files)))
    .digest("hex");
}

/** 항목 하나(팩 파일 한 줄)의 정규 JSON SHA-256 — 키 차례만 다르면 같다. 스킬 편집기 덮어쓰기의 "저장 때 팩 항목"과 내보내기 from */
export function hashEntry(entry: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(sortKeys(entry)))
    .digest("hex");
}
