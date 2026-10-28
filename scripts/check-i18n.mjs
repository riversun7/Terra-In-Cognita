// 다국어 검사 — 한국어(기본)와 영어 메시지의 키·변수가 같아야 한다 (docs/adr/2026-10-28-i18n.md)
import { readFileSync } from "node:fs";
import { fail } from "./lib.mjs";

const DIR = "apps/game/messages";
const LOCALES = ["ko", "en"];
const load = (locale) => {
  const data = JSON.parse(readFileSync(`${DIR}/${locale}.json`, "utf8"));
  delete data.$schema;
  return data;
};
const variables = (text) =>
  [...String(text).matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .toSorted()
    .join(",");

const [base, ...others] = LOCALES.map((locale) => ({ locale, messages: load(locale) }));
const errors = [];
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
for (const { locale, messages } of [base, ...others]) {
  for (const [key, text] of Object.entries(messages)) {
    if (typeof text !== "string" || text.trim() === "")
      errors.push(`${locale}.json: "${key}" 값이 비어 있습니다.`);
  }
}
if (errors.length > 0) fail(errors);
console.log(`✓ 다국어 메시지 일치 (${Object.keys(base.messages).length}개 키, ${LOCALES.join("/")})`);
