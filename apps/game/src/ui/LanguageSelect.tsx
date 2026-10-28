// 언어 고르기 — 모든 화면 아래에 둔다(로그인 전에도 영어로 바꿀 수 있게). 바꾸면 Paraglide가 새로고침한다.
import { useId } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale, isLocale, locales, setLocale } from "../paraglide/runtime.js";

/** 언어 이름은 그 언어로 쓴다(번역하지 않는다) */
const LOCALE_NAMES: Record<(typeof locales)[number], string> = { ko: "한국어", en: "English" };

function changeLocale(value: string): void {
  if (isLocale(value)) void setLocale(value);
}

export function LanguageSelect() {
  const id = useId();
  return (
    <div className="language">
      <label htmlFor={id}>{m.language()}</label>
      <select id={id} value={getLocale()} onChange={(event) => changeLocale(event.target.value)}>
        {locales.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {LOCALE_NAMES[locale]}
          </option>
        ))}
      </select>
    </div>
  );
}
