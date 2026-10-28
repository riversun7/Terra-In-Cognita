// 팩 폴더 읽기 — 폴더 안의 모든 것을 PackSource로 모은다(모르는 파일도 2단계가 알리도록 빼지 않는다)
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { ContentIssue } from "../issue.ts";
import type { ContentPack, PackSource } from "../pack.ts";
import { CATEGORIES, type CategoryRegistry } from "../schema/categories.ts";
import { validatePack } from "../validate/pack.ts";
import { contentVersionOf } from "../version.ts";
import { hashPack } from "./hash.ts";

/** 팩 폴더를 읽는다. 팩 ID는 폴더 이름. 하위 폴더는 이름 끝에 "/"를 붙여 넣는다 */
export function readPackDir(dir: string): PackSource {
  const files = new Map<string, string>();
  const entries = readdirSync(dir, { withFileTypes: true }).toSorted((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    if (entry.isFile()) files.set(entry.name, readFileSync(path.join(dir, entry.name), "utf8"));
    else files.set(`${entry.name}/`, "");
  }
  return { packId: path.basename(path.resolve(dir)), files };
}

export interface LoadedPack {
  /** 폴더를 읽지 못했으면 없다 */
  source: PackSource | undefined;
  issues: ContentIssue[];
  /** 1·2·4a단계를 모두 통과했을 때만 아래 값이 있다 */
  pack: ContentPack | undefined;
  /** "<팩 ID>@<팩 버전>" */
  version: string | undefined;
  /** 정규 JSON의 SHA-256 */
  hash: string | undefined;
}

/** 팩 폴더를 읽고 1·2·4a단계를 검사한다 (서버 시작, 검사 스크립트) */
export function loadContentPack(dir: string, registry: CategoryRegistry = CATEGORIES): LoadedPack {
  let source: PackSource;
  try {
    source = readPackDir(dir);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : String(error);
    return {
      source: undefined,
      issues: [
        {
          stage: "schema",
          level: "error",
          path: dir,
          message: `팩 폴더를 읽지 못했습니다(${code}). 경로를 확인하세요.`,
        },
      ],
      pack: undefined,
      version: undefined,
      hash: undefined,
    };
  }
  const { issues, pack } = validatePack(source, registry);
  if (!pack) return { source, issues, pack, version: undefined, hash: undefined };
  return {
    source,
    issues,
    pack,
    version: contentVersionOf(pack.manifest.packId, pack.manifest.version),
    hash: hashPack(source.files),
  };
}
