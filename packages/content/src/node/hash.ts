// 팩 해시 — 정규 JSON의 SHA-256(16진수 64자). /health의 contentHash, 배포 점검의 비교 값
import { createHash } from "node:crypto";
import { canonicalPackJson } from "../canonical.ts";
import { parsePackFiles } from "../pack.ts";

/** 줄 바꿈·들여쓰기·키 순서·항목 순서만 다르면 같은 해시가 나온다 */
export function hashPack(files: ReadonlyMap<string, string>): string {
  return createHash("sha256")
    .update(canonicalPackJson(parsePackFiles(files)))
    .digest("hex");
}
