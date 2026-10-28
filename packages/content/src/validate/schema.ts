// 1단계: 스키마 — JSON 문법, 필드 이름·타입·필수 값·범위, 형식 버전, 팩 ID.
// 여기서 오류가 하나라도 나면 다음 단계(2·4)는 돌리지 않는다.
import type { z } from "zod";
import type { ContentIssue } from "../issue.ts";
import { type ContentPack, type PackSource, parseJson } from "../pack.ts";
import { entriesFileSchema, type CategoryRegistry } from "../schema/categories.ts";
import { ID_PATTERN, koreanErrorMap } from "../schema/common.ts";
import { ID_CHANGES_FILE, type IdChanges, idChangesSchema } from "../schema/idChanges.ts";
import { MANIFEST_FILE, type Manifest, manifestSchema } from "../schema/manifest.ts";
import { CONTENT_FORMAT_VERSION } from "../version.ts";

export interface SchemaResult {
  issues: ContentIssue[];
  /** 오류가 없을 때만 있다 */
  pack: ContentPack | undefined;
}

/** 경로 조각을 사람이 읽는 모양으로: ["cost", 0, "item"] → cost[0].item */
export function formatPath(segments: readonly PropertyKey[]): string {
  return segments
    .map((segment, index) =>
      typeof segment === "number" ? `[${segment}]` : `${index === 0 ? "" : "."}${String(segment)}`,
    )
    .join("");
}

function syntaxIssue(file: string, error: unknown): ContentIssue {
  const raw = error instanceof Error ? error.message : String(error);
  // V8 문구 예: `Unexpected token '}', "{"a": }" is not valid JSON`, `... in JSON at position 8 (line 2 column 1)`
  const at = /\(line (\d+) column (\d+)\)/.exec(raw);
  const detail = raw
    .replace(/, ".*" is not valid JSON$/s, "")
    .replace(/ in JSON at position \d+.*$/s, "")
    .trim();
  return {
    stage: "schema",
    level: "error",
    file,
    ...(at ? { line: Number(at[1]), column: Number(at[2]) } : {}),
    message: `JSON 문법 오류입니다(${detail}). 쉼표·따옴표·괄호를 확인하세요.`,
  };
}

/** 항목 배열 안의 문제면 위치를 "ID › 항목 안 경로"로 바꾼다 (ID가 올바를 때만) */
function locate(raw: unknown, path: readonly PropertyKey[]): { id?: string; path: string } {
  if (path[0] === "entries" && typeof path[1] === "number" && raw !== null && typeof raw === "object") {
    const entries = (raw as { entries?: unknown }).entries;
    const entry: unknown = Array.isArray(entries) ? entries[path[1]] : undefined;
    const id = entry !== null && typeof entry === "object" ? (entry as { id?: unknown }).id : undefined;
    if (typeof id === "string" && ID_PATTERN.test(id)) return { id, path: formatPath(path.slice(2)) };
  }
  return { path: formatPath(path) };
}

function parseFile<T>(
  issues: ContentIssue[],
  source: PackSource,
  file: string,
  schema: z.ZodType<T>,
): { ok: true; value: T } | { ok: false } {
  const text = source.files.get(file);
  if (text === undefined) return { ok: false };
  let raw: unknown;
  try {
    raw = parseJson(text);
  } catch (error) {
    issues.push(syntaxIssue(file, error));
    return { ok: false };
  }
  const result = schema.safeParse(raw, { error: koreanErrorMap });
  if (result.success) return { ok: true, value: result.data };
  for (const issue of result.error.issues) {
    issues.push({
      stage: "schema",
      level: "error",
      file,
      ...locate(raw, issue.path),
      message: issue.message,
    });
  }
  return { ok: false };
}

function missingFile(file: string, hint: string): ContentIssue {
  return { stage: "schema", level: "error", file, message: `파일이 없습니다. ${hint}` };
}

export function checkSchema(source: PackSource, registry: CategoryRegistry): SchemaResult {
  const issues: ContentIssue[] = [];

  let manifest: Manifest | undefined;
  if (!source.files.has(MANIFEST_FILE)) {
    issues.push(missingFile(MANIFEST_FILE, "팩 폴더마다 manifest.json이 있어야 합니다."));
  } else {
    const parsed = parseFile(issues, source, MANIFEST_FILE, manifestSchema);
    if (parsed.ok) manifest = parsed.value;
  }
  if (manifest && manifest.formatVersion !== CONTENT_FORMAT_VERSION) {
    issues.push({
      stage: "schema",
      level: "error",
      file: MANIFEST_FILE,
      path: "formatVersion",
      message: `형식 버전이 코드와 다릅니다(팩 ${manifest.formatVersion}, 코드 ${CONTENT_FORMAT_VERSION}). 형식을 바꿨으면 코드와 팩을 같은 커밋에서 함께 고치세요.`,
    });
  }
  if (manifest && manifest.packId !== source.packId) {
    issues.push({
      stage: "schema",
      level: "error",
      file: MANIFEST_FILE,
      path: "packId",
      message: `팩 ID가 폴더 이름과 다릅니다(packId "${manifest.packId}", 폴더 "${source.packId}"). 둘을 같게 맞추세요.`,
    });
  }

  let idChanges: IdChanges | undefined;
  if (!source.files.has(ID_CHANGES_FILE)) {
    issues.push(missingFile(ID_CHANGES_FILE, '바꾼 ID가 없어도 {"renamed": [], "removed": []}로 둡니다.'));
  } else {
    const parsed = parseFile(issues, source, ID_CHANGES_FILE, idChangesSchema);
    if (parsed.ok) idChanges = parsed.value;
  }

  const entries = new Map<string, readonly { id: string }[]>();
  for (const [category, definition] of Object.entries(registry)) {
    const file = `${category}.json`;
    if (!source.files.has(file)) {
      entries.set(category, []);
      continue;
    }
    const parsed = parseFile(issues, source, file, entriesFileSchema(definition.entry));
    if (parsed.ok) entries.set(category, parsed.value.entries);
  }

  if (issues.length > 0 || !manifest || !idChanges) return { issues, pack: undefined };
  return { issues, pack: { manifest, idChanges, entries } };
}
