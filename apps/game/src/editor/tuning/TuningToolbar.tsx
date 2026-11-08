// 설정 칸 패널 찾기·거르기 띠 — docs/adr/2026-11-01-dev-settings-panel.md "바뀜 (2026-11-08 화면 개편)".
// 찾기(코드·ID·이름·풀이·출처, 낱말 여럿이면 모두 맞는 칸, "/" 키로 들어옴, Esc = 지우기) · [바꾼 것만] · 반영(전체·서버 즉시·시뮬만·연결 없음)
// · 단위 · 무리 · [풀이 보기]. 넓은 폭은 목록 위에 붙고(위 띠 아래) 거르기가 늘 보인다.
// 좁은 폭(휴대폰)은 찾기 + [거르기 N] 한 줄이고, 누르면 거르기 줄이 펼쳐진다(칸이 화면 위쪽에서 바로 보이게).
import type { Ref } from "react";
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { SCOPE_FILTER_TEXT, familyText, unitKeyText } from "./tuningMessages.ts";
import { ALL_FAMILIES, ALL_UNITS, SCOPE_FILTERS, type ScopeFilter, type TuningQuery } from "./tuningModel.ts";

export type ToolbarQuery = Omit<TuningQuery, "page">;

export interface TuningToolbarProps {
  query: ToolbarQuery;
  onQuery: (patch: Partial<ToolbarQuery>) => void;
  families: readonly string[];
  units: readonly string[];
  showDesc: boolean;
  onShowDesc: (show: boolean) => void;
  searchRef: Ref<HTMLInputElement>;
  /** 보이는 칸 / 이 분야 칸 */
  shown: number;
  total: number;
}

/** 켠 거르기 수(찾는 글 빼고) — 휴대폰 [거르기 N] */
export const activeFilters = (query: ToolbarQuery): number =>
  [query.changedOnly, query.scope !== "all", query.unit !== ALL_UNITS, query.family !== ALL_FAMILIES].filter(
    Boolean,
  ).length;

/** 거르기가 하나라도 걸려 있는가(찾는 글 포함) */
export const isFiltered = (query: ToolbarQuery): boolean =>
  query.text.trim() !== "" ||
  query.changedOnly ||
  query.scope !== "all" ||
  query.unit !== ALL_UNITS ||
  query.family !== ALL_FAMILIES;

export const CLEAR_FILTERS: ToolbarQuery = {
  text: "",
  changedOnly: false,
  scope: "all",
  unit: ALL_UNITS,
  family: ALL_FAMILIES,
};

export function TuningToolbar({
  query,
  onQuery,
  families,
  units,
  showDesc,
  onShowDesc,
  searchRef,
  shown,
  total,
}: TuningToolbarProps) {
  const searchId = useId();
  const unitId = useId();
  const familyId = useId();
  const scopeName = useId();
  const filtersId = useId();
  const [open, setOpen] = useState(false);
  const active = activeFilters(query);
  return (
    <div className="tp-toolbar" role="search">
      <div className="tp-search-row">
        <div className="tp-search">
          <label className="visually-hidden" htmlFor={searchId}>
            {m.dev_tuning_search_label()}
          </label>
          <input
            ref={searchRef}
            id={searchId}
            className="input tp-search-input"
            type="search"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-keyshortcuts="/"
            placeholder={m.dev_tuning_search_placeholder()}
            value={query.text}
            onChange={(event) => onQuery({ text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query.text !== "") {
                event.preventDefault();
                onQuery({ text: "" });
              }
            }}
          />
          <kbd className="tp-search-key" aria-hidden="true">
            /
          </kbd>
        </div>
        <button
          type="button"
          className="tp-chip-button tp-filters-toggle"
          aria-expanded={open}
          aria-controls={filtersId}
          data-active={active > 0 ? "" : undefined}
          onClick={() => setOpen(!open)}
        >
          {active > 0 ? m.dev_tuning_filters_count({ count: active }) : m.dev_tuning_filters()}
        </button>
      </div>
      <div id={filtersId} className="tp-filters" data-open={open}>
        <button
          type="button"
          className="tp-chip-button tp-changed-only"
          aria-pressed={query.changedOnly}
          onClick={() => onQuery({ changedOnly: !query.changedOnly })}
        >
          {m.dev_tuning_filter_changed_only()}
        </button>
        <fieldset className="tp-scope-filter">
          <legend className="visually-hidden">{m.dev_tuning_scope_label()}</legend>
          {SCOPE_FILTERS.map((option: ScopeFilter) => (
            <label key={option} className="tp-seg" data-scope={option}>
              <input
                type="radio"
                className="visually-hidden"
                name={scopeName}
                value={option}
                checked={option === query.scope}
                onChange={() => onQuery({ scope: option })}
              />
              <span>{SCOPE_FILTER_TEXT[option]()}</span>
            </label>
          ))}
        </fieldset>
        <label className="visually-hidden" htmlFor={unitId}>
          {m.dev_tuning_unit_filter_label()}
        </label>
        <select
          id={unitId}
          className="tp-filter-select tp-unit-filter"
          value={query.unit}
          onChange={(event) => onQuery({ unit: event.target.value })}
        >
          <option value={ALL_UNITS}>{m.dev_tuning_unit_all()}</option>
          {units.map((unit) => (
            <option key={unit} value={unit}>
              {unitKeyText(unit)}
            </option>
          ))}
        </select>
        <label className="visually-hidden" htmlFor={familyId}>
          {m.dev_tuning_family_label()}
        </label>
        <select
          id={familyId}
          className="tp-filter-select tp-family"
          value={query.family}
          onChange={(event) => onQuery({ family: event.target.value })}
        >
          <option value={ALL_FAMILIES}>{m.dev_tuning_family_all()}</option>
          {families.map((letter) => (
            <option key={letter} value={letter}>
              {familyText(letter)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="tp-chip-button tp-desc-toggle"
          aria-pressed={showDesc}
          onClick={() => onShowDesc(!showDesc)}
        >
          {m.dev_tuning_show_desc()}
        </button>
      </div>
      <div className="tp-result">
        <p className="tp-shown" aria-live="polite">
          {m.dev_tuning_shown({ shown, total })}
        </p>
        {isFiltered(query) ? (
          <button type="button" className="tp-link-button tp-reset" onClick={() => onQuery(CLEAR_FILTERS)}>
            {m.dev_tuning_reset_filters()}
          </button>
        ) : null}
      </div>
    </div>
  );
}
