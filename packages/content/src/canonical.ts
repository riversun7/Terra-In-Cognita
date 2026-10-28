// 정규 JSON — 줄 바꿈·들여쓰기·키 순서·항목 순서가 달라도 내용이 같으면 같은 문자열.
// 팩 해시(/health의 contentHash)와 "내용이 바뀌었는데 버전을 안 올렸는지" 검사(4b)가 같이 쓴다.
import { ID_CHANGES_FILE } from "./schema/idChanges.ts";
import { MANIFEST_FILE } from "./schema/manifest.ts";

/** 객체 키를 재귀로 정렬한다. 배열 순서는 그대로 둔다 */
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => byCodeUnit(a, b))
        .map(([key, item]) => [key, sortKeys(item)]),
    );
  }
  return value;
}

/** 문자열 비교(UTF-16 코드 단위 순) — 실행 환경의 언어 설정과 무관하게 같은 순서 */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function idOf(entry: unknown): string | undefined {
  if (entry === null || typeof entry !== "object") return undefined;
  const id = (entry as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

/** 분류 파일의 entries는 ID 순으로 정렬한다(순서만 바꾼 변경은 내용 변경이 아니다) */
function sortEntries(file: unknown): unknown {
  if (file === null || typeof file !== "object") return file;
  const entries = (file as { entries?: unknown }).entries;
  if (!Array.isArray(entries) || entries.some((entry) => idOf(entry) === undefined)) return file;
  const sorted = entries.toSorted((a, b) => byCodeUnit(idOf(a) ?? "", idOf(b) ?? ""));
  return { ...file, entries: sorted };
}

/**
 * 팩 전체의 정규 JSON 문자열.
 * @param files 파일 이름 → JSON.parse 결과. 파일 이름 순으로 묶고, 분류 파일의 entries는 ID 순으로 정렬한다
 */
export function canonicalPackJson(files: Readonly<Record<string, unknown>>): string {
  const normalized: Record<string, unknown> = {};
  for (const name of Object.keys(files).toSorted(byCodeUnit)) {
    const value = files[name];
    normalized[name] = name === MANIFEST_FILE || name === ID_CHANGES_FILE ? value : sortEntries(value);
  }
  return JSON.stringify(sortKeys(normalized));
}
