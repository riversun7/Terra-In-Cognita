// 설정 화면 — 사이드 메뉴의 [설정]·주소 /settings로 연다(지연 로딩되는 별도 조각, shell/routeViews.tsx의 React.lazy).
// ADR 2026-10-28-design-system, 2026-10-29-app-shell 4절
// 테마 4개(미리 보기), "기기 설정에 맞추기", 언어, 시세 색(D-442), 메뉴(하단 탭 모양·메뉴 순서 — shell/NavigationSettings.tsx).
// 바꾸면 바로 걸고 기기에 저장한 뒤 계정에도 올린다(settings.ts). 시세 색만 기기에만 저장한다(계정 칸 없음).
// - 테마는 기본 라디오 단추 묶음이다(화살표 키로 옮기고 고른다). 고른 표시는 지금 화면에 걸린 테마다(기기를 따르는 중이어도).
// - 테마를 고르면 "기기 설정에 맞추기"는 꺼진다. 스위치를 끄면 지금 보이는 테마가 그대로 남는다.
import { THEMES, type Theme } from "@terra/shared";
import type { ChangeEvent } from "react";
import { useId } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { NavigationSettings } from "../shell/NavigationSettings.tsx";
import { LanguageSelect } from "../ui/LanguageSelect.tsx";
import { useMountFocus } from "../ui/useMountFocus.ts";
import {
  MARKET_COLOR_CHOICES,
  type MarketColorChoice,
  isMarketColorChoice,
  languageMarketColors,
} from "./marketColors.ts";
import { chooseMarketColors, chooseTheme, setFollowSystem, useSettings } from "./settings.ts";
import "./settings.css";

/** 테마 이름과 한 줄 설명(메시지 키). 테마가 늘면 여기서 타입 오류가 난다 */
const THEME_TEXT = {
  pastel: { name: m.theme_pastel, note: m.theme_pastel_note },
  dark: { name: m.theme_dark, note: m.theme_dark_note },
  contrast: { name: m.theme_contrast, note: m.theme_contrast_note },
  station: { name: m.theme_station, note: m.theme_station_note },
} satisfies Record<Theme, { name: () => string; note: () => string }>;

function ThemeOption({ theme, checked }: { theme: Theme; checked: boolean }) {
  const nameId = useId();
  const noteId = useId();
  return (
    <label className="theme-option">
      <input
        type="radio"
        name="theme"
        value={theme}
        className="theme-radio visually-hidden"
        checked={checked}
        onChange={() => chooseTheme(theme)}
        aria-labelledby={nameId}
        aria-describedby={noteId}
      />
      <span className="theme-card">
        {/* 미리 보기: 그 테마의 바탕·판·글자·버튼 색(꾸밈) */}
        <span className="theme-preview" data-theme-preview={theme} aria-hidden="true">
          <span className="preview-dots">
            <span />
            <span />
            <span />
          </span>
          <span className="preview-panel">
            <span className="preview-line" />
            <span className="preview-button" />
          </span>
        </span>
        <span className="theme-name-row">
          <span className="theme-name" id={nameId}>
            {THEME_TEXT[theme].name()}
          </span>
          <span className="radio-mark" aria-hidden="true" />
        </span>
        <span className="theme-note" id={noteId}>
          {THEME_TEXT[theme].note()}
        </span>
      </span>
    </label>
  );
}

/** 시세 색 고르기 글. "언어 기본"은 지금 언어가 고르는 관례를 괄호로 보인다 */
function marketChoiceText(choice: MarketColorChoice): string {
  if (choice === "korean") return m.settings_market_colors_korean();
  if (choice === "western") return m.settings_market_colors_western();
  const style =
    languageMarketColors(getLocale()) === "korean"
      ? m.settings_market_colors_korean_short()
      : m.settings_market_colors_western_short();
  return m.settings_market_colors_language({ style });
}

/** 시세 색 고르기가 바뀌면 기기에 저장한다 */
function changeMarketColors(event: ChangeEvent<HTMLSelectElement>): void {
  if (isMarketColorChoice(event.target.value)) chooseMarketColors(event.target.value);
}

/** 시세 색(D-442): 언어 기본 / 한국식 / 서양식. 고르지 않았으면 언어 기본 */
function MarketColorsSelect({ value }: { value: MarketColorChoice }) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="field settings-language settings-market">
      <label htmlFor={id} className="field-label">
        {m.settings_market_colors()}
      </label>
      <p id={hintId} className="field-hint">
        {m.settings_market_colors_hint()}
      </p>
      <select
        id={id}
        name="market-colors"
        value={value}
        onChange={changeMarketColors}
        aria-describedby={hintId}
      >
        {MARKET_COLOR_CHOICES.map((choice) => (
          <option key={choice} value={choice}>
            {marketChoiceText(choice)}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function SettingsPage({ onClose }: { onClose: () => void }) {
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const { device, theme } = useSettings();
  const followId = useId();
  const followNameId = useId();
  const followHintId = useId();

  return (
    <section className="screen settings" aria-labelledby="settings-title">
      <div className="screen-header">
        <h1 id="settings-title" className="screen-title" ref={headingRef} tabIndex={-1}>
          {m.settings_title()}
        </h1>
        <button type="button" className="button-small" onClick={onClose}>
          {m.settings_back()}
        </button>
      </div>
      <fieldset className="settings-section">
        <legend className="section-title">{m.settings_theme_legend()}</legend>
        <div className="theme-grid">
          {THEMES.map((option) => (
            <ThemeOption key={option} theme={option} checked={theme === option} />
          ))}
        </div>
      </fieldset>
      <label className="setting-row" htmlFor={followId}>
        <span className="setting-text">
          <span className="setting-name" id={followNameId}>
            {m.settings_follow_system()}
          </span>
          <span className="setting-hint" id={followHintId}>
            {m.settings_follow_system_hint()}
          </span>
        </span>
        <input
          id={followId}
          type="checkbox"
          name="follow-system"
          role="switch"
          className="switch-input visually-hidden"
          checked={device.followSystem}
          onChange={(event) => setFollowSystem(event.target.checked)}
          aria-labelledby={followNameId}
          aria-describedby={followHintId}
        />
        <span className="switch-track" aria-hidden="true" />
      </label>
      <LanguageSelect variant="field" />
      <MarketColorsSelect value={device.marketColors ?? "language"} />
      <NavigationSettings />
    </section>
  );
}
