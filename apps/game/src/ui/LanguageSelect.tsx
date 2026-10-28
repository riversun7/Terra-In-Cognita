// 언어 고르기 — 로그인하지 않은 화면 아래(로그인 화면 포함)와 설정 화면에 둔다. 바꾸면 Paraglide가 새로고침한다.
// 고른 언어는 기기에 저장하고, 로그인했으면 계정에도 올린다. 로그인 전에 고른 언어는 로그인할 때 올린다(settings/settings.ts).
import { useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale, isLocale, locales } from "../paraglide/runtime.js";
import { chooseLocale } from "../settings/settings.ts";

/** 언어 이름은 그 언어로 쓴다(번역하지 않는다) */
const LOCALE_NAMES: Record<(typeof locales)[number], string> = { ko: "한국어", en: "English" };

interface LanguageSelectProps {
  /** footer: 화면 아래 한 줄(이름표 옆에 고르기), field: 설정 화면의 칸(이름표 위) */
  variant?: "footer" | "field";
}

export function LanguageSelect({ variant = "footer" }: LanguageSelectProps) {
  const id = useId();
  // 고른 뒤 새로고침될 때까지(계정에 올리는 동안) 고른 값을 그대로 보여 준다
  const [chosen, setChosen] = useState<string>(getLocale);

  function change(value: string): void {
    if (!isLocale(value) || chosen !== getLocale()) return;
    setChosen(value);
    void chooseLocale(value);
  }

  return (
    <div className={variant === "field" ? "field settings-language" : "language"}>
      <label htmlFor={id} className={variant === "field" ? "field-label" : undefined}>
        {m.language()}
      </label>
      <select id={id} name="locale" value={chosen} onChange={(event) => change(event.target.value)}>
        {locales.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {LOCALE_NAMES[locale]}
          </option>
        ))}
      </select>
    </div>
  );
}
