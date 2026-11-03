// 다국어 검사 — 한국어(기본)와 영어 메시지의 키·변수가 같아야 한다 (docs/adr/2026-10-28-i18n.md)
// 같은 파일에 같은 키가 두 번 있어도 막는다: JSON.parse는 뒤 값만 남겨서 화면에 엉뚱한 글이 말없이 나간다.
import { readFileSync } from "node:fs";
import { fail } from "./lib.mjs";

const DIR = "apps/game/messages";
export const LOCALES = ["ko", "en"];

/**
 * JSON 원문에서 한 객체 안에 두 번 나온 키를 찾는다(모든 깊이). 원문은 올바른 JSON이어야 한다(먼저 JSON.parse로 확인).
 * 키는 풀어서 비교한다("a"와 "a"은 같은 키). 줄 번호는 1부터.
 * @param {string} text
 * @returns {{ key: string, path: string, line: number, firstLine: number }[]}
 */
export function findDuplicateKeys(text) {
  const duplicates = [];
  // 열린 괄호 더미: 객체는 지금까지 본 키(키 → 줄)와 "다음 문자열이 키인지"를 들고 있다
  const stack = [];
  let line = 1;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\n") {
      line += 1;
    } else if (ch === '"') {
      // 문자열 끝까지(역슬래시 다음 글자는 건너뛴다). 올바른 JSON의 문자열 안에는 줄바꿈이 없다
      let end = i + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === "\\" ? 2 : 1;
      const top = stack.at(-1);
      if (top?.kind === "object" && top.expectKey) {
        const key = JSON.parse(text.slice(i, end + 1));
        const firstLine = top.keys.get(key);
        if (firstLine === undefined) top.keys.set(key, line);
        else duplicates.push({ key, path: [...top.path, key].join("."), line, firstLine });
        top.lastKey = key;
        top.expectKey = false;
      }
      i = end;
    } else if (ch === "{" || ch === "[") {
      const parent = stack.at(-1);
      const step =
        parent === undefined ? [] : parent.kind === "object" ? [parent.lastKey] : [`[${parent.index}]`];
      const path = [...(parent?.path ?? []), ...step];
      stack.push(
        ch === "{"
          ? { kind: "object", keys: new Map(), expectKey: true, lastKey: "", path }
          : { kind: "array", index: 0, path },
      );
    } else if (ch === "}" || ch === "]") {
      stack.pop();
    } else if (ch === ",") {
      const top = stack.at(-1);
      if (top?.kind === "object") top.expectKey = true;
      else if (top?.kind === "array") top.index += 1;
    }
    i += 1;
  }
  return duplicates;
}

const variables = (text) =>
  [...String(text).matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .toSorted()
    .join(",");

/**
 * 언어별 메시지 파일 원문을 보고 문제 목록을 돌려준다(첫 언어가 기준).
 * @param {{ locale: string, text: string }[]} files
 * @returns {{ errors: string[], keyCount: number }}
 */
export function checkMessages(files) {
  const errors = [];
  const parsed = [];
  for (const { locale, text } of files) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      errors.push(
        `${locale}.json: JSON이 아닙니다 — ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    for (const { path, line, firstLine } of findDuplicateKeys(text))
      errors.push(
        `${locale}.json:${line}: "${path}" 키가 ${firstLine}번째 줄에도 있습니다(JSON은 뒤 값만 남깁니다). 하나를 지우거나 이름을 바꿉니다.`,
      );
    delete data.$schema;
    parsed.push({ locale, messages: data });
  }
  if (parsed.length !== files.length) return { errors, keyCount: 0 };

  const [base, ...others] = parsed;
  for (const other of others) {
    for (const key of Object.keys(base.messages)) {
      if (!(key in other.messages)) errors.push(`${other.locale}.json: "${key}" 번역이 없습니다.`);
      else if (variables(base.messages[key]) !== variables(other.messages[key]))
        errors.push(`${other.locale}.json: "${key}"의 변수({...})가 ${base.locale}.json과 다릅니다.`);
    }
    for (const key of Object.keys(other.messages)) {
      if (!(key in base.messages))
        errors.push(`${other.locale}.json: "${key}"는 ${base.locale}.json에 없는 키입니다.`);
    }
  }
  for (const { locale, messages } of parsed) {
    for (const [key, text] of Object.entries(messages)) {
      if (typeof text !== "string" || text.trim() === "")
        errors.push(`${locale}.json: "${key}" 값이 비어 있습니다.`);
    }
  }
  return { errors, keyCount: Object.keys(base.messages).length };
}

function main() {
  const files = LOCALES.map((locale) => ({ locale, text: readFileSync(`${DIR}/${locale}.json`, "utf8") }));
  const { errors, keyCount } = checkMessages(files);
  if (errors.length > 0) fail(errors);
  console.log(`✓ 다국어 메시지 일치 (${keyCount}개 키, ${LOCALES.join("/")}, 겹친 키 없음)`);
}

if (import.meta.main) main();
