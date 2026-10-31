// 화면 문구 — 게임 앱 메시지 원본(apps/game/messages/{ko,en}.json)에서 읽는다. 시험이 문장을 따로 적지 않게 한다:
// 문구를 고쳐도 시험은 그대로 통과하고, 다른 키의 문구가 보이면 실패한다.
// 값은 문자열이고 변수는 {이름}뿐이다(scripts/check-i18n.mjs). 수·남은 시간처럼 앱이 Intl로 만들어 넣는 값은
// 시험이 같은 방법으로 만들어 params로 넘긴다(브라우저 Intl과 맞추려면 page.evaluate 안에서 만든다).
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./runLock.ts";
import type { Language } from "./test.ts";

const tables = new Map<Language, ReadonlyMap<string, string>>();

function table(language: Language): ReadonlyMap<string, string> {
  const cached = tables.get(language);
  if (cached) return cached;
  const file = path.join(ROOT, "apps/game/messages", `${language}.json`);
  const data: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof data !== "object" || data === null) throw new Error(`메시지 파일 모양이 틀렸습니다: ${file}`);
  const entries = Object.entries(data).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  const loaded = new Map(entries);
  tables.set(language, loaded);
  return loaded;
}

/** 메시지 키의 문구. {이름}은 params 값으로 바꾼다. 없는 키·빠진 변수는 오류(시험이 틀린 키를 보지 않게) */
export function message(
  language: Language,
  key: string,
  params: Readonly<Record<string, string | number>> = {},
): string {
  const text = table(language).get(key);
  if (text === undefined) throw new Error(`${language}.json에 메시지 키가 없습니다: ${key}`);
  return text.replaceAll(/\{(\w+)\}/g, (_whole, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`${key}의 변수 {${name}} 값이 없습니다`);
    return String(value);
  });
}
