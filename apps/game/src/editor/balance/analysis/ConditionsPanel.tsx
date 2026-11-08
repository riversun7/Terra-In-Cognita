// 시험 조건 — 유닛 틀(샘플·팀 프리셋·팀 A 유닛), 무기, 레벨, 총합 기준, 속성값, 스킬·장비 켬/끔, 편 인원, 한 판 제한.
// 분포 상성·영향도 두 탭이 같이 쓴다(값은 탭마다 따로). 고른 틀의 종류·K·장비·스킬·진형을 가져오고 1차만 분포가 정한다.
import { ANALYSIS_LIMITS } from "@terra/shared/balanceAnalysis";
import { m } from "../../../paraglide/messages.js";
import { NumberField } from "../lab/fields.tsx";
import { ELEMENT_TEXT } from "../lab/labMessages.ts";
import { nameIn as localName } from "../lab/labModel.ts";
import type { LabData } from "../lab/useLabData.ts";
import { type ConditionsForm, LIMIT_OPTIONS } from "./analysisModel.ts";

export function ConditionsPanel({
  form,
  onChange,
  data,
  locale,
}: {
  form: ConditionsForm;
  onChange: (next: ConditionsForm) => void;
  data: LabData;
  locale: string;
}) {
  const set = <K extends keyof ConditionsForm>(key: K, value: ConditionsForm[K]) =>
    onChange({ ...form, [key]: value });
  const weapons = data.load.status === "ready" ? data.load.catalog.weapons : [];
  const L = ANALYSIS_LIMITS;
  return (
    <fieldset className="an-panel an-conditions">
      <legend className="an-panel-title">{m.dev_an_conditions()}</legend>
      <div className="an-fields">
        <TemplateSelect
          label={m.dev_an_template()}
          value={form.templateId}
          onChange={(value) => set("templateId", value ?? form.templateId)}
          data={data}
          locale={locale}
          className="an-field-wide"
        />
        <label className="an-field" data-field="weapon">
          <span className="an-field-label">{m.dev_an_weapon()}</span>
          <select value={form.weapon} onChange={(event) => set("weapon", event.target.value)}>
            <option value="keep">{m.dev_an_weapon_keep()}</option>
            <option value="natural">{m.dev_an_weapon_natural()}</option>
            {weapons.map((weapon) => (
              <option key={weapon.id} value={weapon.id}>
                {localName(weapon.name, locale)}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          className="an-field"
          label={m.dev_an_level()}
          value={form.level}
          min={L.levelMin}
          max={L.levelMax}
          onChange={(value) => set("level", value)}
        />
        <label className="an-field an-field-wide" data-field="mode">
          <span className="an-field-label">{m.dev_an_mode()}</span>
          <select
            value={form.mode}
            onChange={(event) => set("mode", event.target.value === "level" ? "level" : "sum")}
          >
            <option value="sum">{m.dev_an_mode_sum()}</option>
            <option value="level">{m.dev_an_mode_level()}</option>
          </select>
        </label>
        <label className="an-field" data-field="elements">
          <span className="an-field-label">{m.dev_an_elements()}</span>
          <select
            value={String(form.elements)}
            onChange={(event) => {
              const value = event.target.value;
              set("elements", value === "keep" || value === "none" ? value : Number(value));
            }}
          >
            <option value="keep">{m.dev_an_elements_keep()}</option>
            <option value="none">{m.dev_an_elements_none()}</option>
            {ELEMENT_TEXT.map((text, index) => (
              <option key={text()} value={String(index)}>
                {m.dev_an_elements_one({ name: text() })}
              </option>
            ))}
          </select>
        </label>
        <label className="an-field" data-field="team">
          <span className="an-field-label">{m.dev_an_team()}</span>
          <select
            value={String(form.teamSize)}
            onChange={(event) => set("teamSize", Number(event.target.value))}
          >
            {Array.from({ length: L.teamMax }, (_, index) => index + 1).map((n) => (
              <option key={n} value={String(n)}>
                {m.dev_an_team_value({ n })}
              </option>
            ))}
          </select>
        </label>
        <label className="an-field" data-field="limit">
          <span className="an-field-label">{m.dev_an_limit()}</span>
          <select
            value={String(form.limitSec)}
            onChange={(event) => set("limitSec", Number(event.target.value))}
          >
            {LIMIT_OPTIONS.map((sec) => (
              <option key={sec} value={String(sec)}>
                {m.dev_an_seconds({ n: sec })}
              </option>
            ))}
          </select>
        </label>
        <div className="an-toggles an-field-wide">
          <label className="an-check">
            <input
              type="checkbox"
              checked={form.skills}
              onChange={(event) => set("skills", event.target.checked)}
            />
            <span>{m.dev_an_skills()}</span>
          </label>
          <label className="an-check">
            <input
              type="checkbox"
              checked={form.gear}
              onChange={(event) => set("gear", event.target.checked)}
            />
            <span>{m.dev_an_gear()}</span>
          </label>
        </div>
      </div>
      <p className="an-hint">{m.dev_an_template_hint()}</p>
    </fieldset>
  );
}

/** 유닛 틀 고르기(샘플·팀 프리셋·팀 A 유닛). allowShared면 맨 앞에 "공통 틀" */
export function TemplateSelect({
  label,
  value,
  onChange,
  data,
  locale,
  className,
  allowShared,
  hideLabel,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  data: LabData;
  locale: string;
  className?: string | undefined;
  allowShared?: boolean | undefined;
  hideLabel?: boolean | undefined;
}) {
  const presets = (data.presets?.presets ?? []).filter((preset) => preset.kind === "unit");
  const samples = presets.filter((preset) => preset.source === "sample");
  const team = presets.filter((preset) => preset.source === "team");
  const teamA = data.teams.a.units;
  return (
    <label className={`an-field${className ? ` ${className}` : ""}`}>
      <span className={hideLabel ? "visually-hidden" : "an-field-label"}>{label}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
      >
        {allowShared ? <option value="">{m.dev_an_build_template_shared()}</option> : null}
        {samples.length > 0 ? (
          <optgroup label={m.dev_an_group_samples()}>
            {samples.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {localName(preset.name, locale)}
              </option>
            ))}
          </optgroup>
        ) : null}
        {team.length > 0 ? (
          <optgroup label={m.dev_an_group_team_presets()}>
            {team.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {localName(preset.name, locale)}
              </option>
            ))}
          </optgroup>
        ) : null}
        <optgroup label={m.dev_an_group_team_a()}>
          {teamA.map((unit, index) => (
            <option key={`team_a:${String(index)}`} value={`team_a:${String(index)}`}>
              {m.dev_an_template_team({ n: index + 1, name: unit.label.trim() || unit.kind })}
            </option>
          ))}
        </optgroup>
        {/* 고른 값이 목록에 아직 없을 때(프리셋을 받기 전) 빈 칸 대신 ID를 보인다 */}
        {value !== null && !presets.some((preset) => preset.id === value) && !value.startsWith("team_a:") ? (
          <option value={value}>{value}</option>
        ) : null}
      </select>
    </label>
  );
}
