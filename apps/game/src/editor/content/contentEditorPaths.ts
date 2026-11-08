// 콘텐츠 편집기 칸 경로(아이템·스킬·건물 편집기) — 칸 하나의 팩 값·지금 값·담은 값을 견주고 칸마다 되돌리기 위한 순수 함수.
// 경로는 팩 검사 위치와 같은 모양이다: 점과 대괄호("equip.stats[0].min", "build.levels[1].from"). 숫자 마디는 배열 차례다.
// docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-08 화면 개편)". 시험: contentEditorPaths.test.ts.

type Part = string | number;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 경로 → 마디("a.b[0].c" → ["a", "b", 0, "c"], "a.0" → ["a", 0]) */
export function pathParts(path: string): Part[] {
  if (path === "" || path === ".") return [];
  const parts: Part[] = [];
  for (const piece of path.split(".")) {
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(piece);
    if (!match) {
      parts.push(piece);
      continue;
    }
    const [, head = "", brackets = ""] = match;
    if (head !== "") parts.push(/^\d+$/.test(head) ? Number(head) : head);
    for (const index of brackets.matchAll(/\[(\d+)\]/g)) parts.push(Number(index[1]));
  }
  return parts;
}

/** 마디 → 경로(배열 차례는 대괄호) */
export function joinPath(parts: readonly Part[]): string {
  let out = "";
  for (const part of parts) {
    if (typeof part === "number") out += `[${part}]`;
    else out += out === "" ? part : `.${part}`;
  }
  return out;
}

const step = (value: unknown, part: Part): unknown => {
  if (typeof part === "number") return Array.isArray(value) ? value[part] : undefined;
  return isRecord(value) ? value[part] : undefined;
};

/** 경로의 값(없으면 undefined) */
export function getAt(value: unknown, path: string): unknown {
  let at = value;
  for (const part of pathParts(path)) at = step(at, part);
  return at;
}

/** 경로의 부모 칸(객체·배열)이 있어 값을 넣을 수 있는가 */
export function canSetAt(value: unknown, path: string): boolean {
  const parts = pathParts(path);
  if (parts.length === 0) return false;
  const parent = parts.slice(0, -1).reduce<unknown>(step, value);
  const last = parts.at(-1);
  if (typeof last === "number") return Array.isArray(parent) && last < parent.length;
  return isRecord(parent);
}

function setParts(value: unknown, parts: readonly Part[], next: unknown): unknown {
  const [head, ...rest] = parts;
  if (head === undefined) return next;
  if (typeof head === "number") {
    if (!Array.isArray(value) || head >= value.length) return value;
    const child = setParts(value[head], rest, next);
    // 배열 칸은 빼지 않는다(차례가 밀리지 않게): 값이 없어지면 그대로 둔다
    if (child === undefined) return value;
    return value.map((item, index) => (index === head ? child : item));
  }
  if (!isRecord(value)) return value;
  const child = setParts(value[head], rest, next);
  const out = { ...value };
  if (child === undefined) delete out[head];
  else out[head] = child;
  return out;
}

/** 경로에 값을 넣은 새 값(undefined면 객체 칸을 뺀다). 부모 칸이 없으면 그대로 돌려준다 */
export function setAt(value: unknown, path: string, next: unknown): unknown {
  return canSetAt(value, path) ? setParts(value, pathParts(path), next) : value;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * 두 값에서 다른 끝 칸 경로(객체는 키마다, 배열은 차례마다 내려간다. 길이가 다른 배열은 넘는 차례를 끝 칸으로 친다).
 * 키 차례는 보지 않는다
 */
export function leafDiff(a: unknown, b: unknown, path = ""): string[] {
  if (isRecord(a) && isRecord(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].toSorted();
    return keys.flatMap((key) => leafDiff(a[key], b[key], path === "" ? key : `${path}.${key}`));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const length = Math.max(a.length, b.length);
    return Array.from({ length }, (_, index) => leafDiff(a[index], b[index], `${path}[${index}]`)).flat();
  }
  if (isRecord(a) || isRecord(b)) {
    // 한쪽만 객체: 있는 쪽의 끝 칸을 모두 다르다고 친다(없는 묶음을 만들거나 뺐다)
    return leafDiff(isRecord(a) ? a : {}, isRecord(b) ? b : {}, path);
  }
  return same(a, b) ? [] : [path === "" ? "." : path];
}

/** 경로가 앞머리 칸 안인가("equip"이면 "equip", "equip.slot", "equip[0]"은 안, "equipment"는 밖) */
export function underPath(path: string, prefix: string): boolean {
  if (prefix === "") return true;
  return path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`);
}
