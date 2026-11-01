// 콘텐츠 편집기 공용 모델(스킬 편집기·아이템 편집기) — 숫자 읽기, ID 규칙·복제 ID, 키 차례와 상관없는 같은 내용, 3방향 합치기, 오류 코드.
// 계산이 없는 순수 함수만 둔다(시험: contentEditorModel.test.ts). docs/adr/2026-11-01-item-editor.md 3절(WP-4a·3.10 충돌).

/** 콘텐츠 ID 규칙(AGENTS 4장, 서버 팩 검사와 같다) */
export const CONTENT_ID_PATTERN = /^[a-z][a-z0-9_]{1,47}$/;

/** 정수 입력: 범위 안 정수면 그 값, 아니면 null */
export function parseInt32(text: string, min: number, max: number): number | null {
  if (!/^-?\d+$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

/** 쓸 수 없는 ID(있는 항목 + 한 번 쓰고 지운 ID)를 피한 복제 ID: <ID>_copy, <ID>_copy2 … (48자 안) */
export function freeCopyId(base: string, taken: ReadonlySet<string>): string {
  const stem = base.slice(0, 40);
  for (let n = 1; n < 1000; n++) {
    const id = n === 1 ? `${stem}_copy` : `${stem}_copy${n}`;
    if (!taken.has(id)) return id;
  }
  return `${stem}_x`;
}

/** 영어 이름 → ID 제안(snake_case, 겹치면 _2 …). 쓸 글자가 없으면 빈 글 */
export function suggestId(english: string, taken: ReadonlySet<string>): string {
  const words = english
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");
  let stem = /^[a-z]/.test(words) ? words.slice(0, 44) : words === "" ? "" : `x_${words}`.slice(0, 44);
  stem = stem.replaceAll(/_+$/g, "");
  if (stem.length < 2) return "";
  if (!taken.has(stem)) return stem;
  for (let n = 2; n < 1000; n++) if (!taken.has(`${stem}_${n}`)) return `${stem}_${n}`;
  return "";
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 키 차례와 상관없는 JSON 글(같은 내용이면 같은 글) */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    isPlainObject(item)
      ? Object.fromEntries(Object.entries(item).toSorted(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : item,
  );
}

/** 키 차례와 상관없는 같은 내용인가 */
export const sameJson = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b);

/** 3방향 합치기 결과: 합친 값과 양쪽이 같은 칸을 다르게 바꾼 경로(점으로 이은 칸 이름, 이 경로는 내 값을 넣어 두었다) */
export interface MergeResult {
  readonly merged: unknown;
  readonly conflicts: readonly string[];
}

/**
 * 3방향 합치기(설계안 3.10): base = 내가 고치기 시작한 항목, mine = 내 초안, theirs = 지금 서버 항목. 내가 바꾼 칸만 theirs 위에 다시
 * 얹는다. 객체는 칸마다 내려가고, 배열·글·수는 통째로 본다. 양쪽이 같은 칸을 다르게 바꿨으면 충돌(내 값을 넣고 경로를 알린다)
 */
export function mergeThreeWay(base: unknown, mine: unknown, theirs: unknown, path = ""): MergeResult {
  if (sameJson(mine, theirs)) return { merged: mine, conflicts: [] };
  if (sameJson(base, mine)) return { merged: theirs, conflicts: [] };
  if (sameJson(base, theirs)) return { merged: mine, conflicts: [] };
  if (isPlainObject(base) && isPlainObject(mine) && isPlainObject(theirs)) {
    const out: Record<string, unknown> = {};
    const conflicts: string[] = [];
    const keys = [...new Set([...Object.keys(theirs), ...Object.keys(mine), ...Object.keys(base)])];
    for (const key of keys) {
      const result = mergeThreeWay(base[key], mine[key], theirs[key], path === "" ? key : `${path}.${key}`);
      if (result.merged !== undefined) out[key] = result.merged;
      conflicts.push(...result.conflicts);
    }
    return { merged: out, conflicts };
  }
  return { merged: mine, conflicts: [path === "" ? "." : path] };
}

/** 점으로 이은 경로의 값("." = 통째) */
export function valueAt(value: unknown, path: string): unknown {
  if (path === ".") return value;
  let at: unknown = value;
  for (const key of path.split(".")) at = isPlainObject(at) ? at[key] : undefined;
  return at;
}

/** 점으로 이은 경로에 값을 넣은 새 값(undefined면 그 칸을 뺀다, "." = 통째) */
export function withValueAt(value: unknown, path: string, next: unknown): unknown {
  if (path === ".") return next;
  const [head = "", ...rest] = path.split(".");
  const object = isPlainObject(value) ? { ...value } : {};
  const child = rest.length === 0 ? next : withValueAt(object[head], rest.join("."), next);
  if (child === undefined) delete object[head];
  else object[head] = child;
  return object;
}

/** tRPC 오류 → 화면 오류 정보(까닭 코드는 reasons 가운데, 아니면 공통 코드) */
export interface ContentErrorInfo<R extends string> {
  readonly key:
    | R
    | "revision_conflict"
    | "rate_limited"
    | "unauthorized"
    | "forbidden"
    | "unavailable"
    | "network"
    | "unknown";
  /** 서버가 더 나눈 줄(검사 문제 줄·바뀐 항목 키) */
  readonly details: readonly string[];
  readonly sessionEnded: boolean;
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

export function contentErrorOf<R extends string>(error: unknown, reasons: readonly R[]): ContentErrorInfo<R> {
  const data = field(error, "data");
  const code = field(data, "code");
  const reason = field(data, "reason");
  const raw = field(data, "details");
  const details = Array.isArray(raw) ? raw.filter((line): line is string => typeof line === "string") : [];
  const known = reasons.find((item) => item === reason);
  if (known !== undefined) return { key: known, details, sessionEnded: false };
  if (reason === "revision_conflict" || reason === "rate_limited")
    return { key: reason, details, sessionEnded: false };
  switch (code) {
    case "UNAUTHORIZED":
      return { key: "unauthorized", details, sessionEnded: true };
    case "FORBIDDEN":
      return { key: "forbidden", details, sessionEnded: false };
    case "NOT_FOUND":
      return { key: "unavailable", details, sessionEnded: false };
    case undefined:
      return { key: "network", details, sessionEnded: false };
    default:
      return { key: "unknown", details, sessionEnded: false };
  }
}
