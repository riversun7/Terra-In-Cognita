// 유닛 편집 판 — 고른 유닛 하나: 유닛 프리셋 막대, 기본(이름·종류·레벨·환생·진형), 1차 6 + 스탯마다 K, 속성 12칸(계열 합·생성 규칙
// 표시, 막지 않음 D-450·D-457), 무기·장비(UnitGear), 스킬(칸 수 안, 등급, 차례 = AI 우선순위). 값은 바로 팀에 들어가고 미리 보기가 따라온다.
// 각 접이식 구간(.bl-details)은 테두리·머리 막대·안쪽 본문(.bl-details-body)으로 구분한다.
import {
  LAB_LIMITS,
  LAB_ROWS,
  type LabCatalogResponse,
  type LabPresetListResponse,
  type LabTeam,
  type LabUnit,
  labElementsFitCreation,
  labFamilyValues,
} from "@terra/shared/battleLab";
import { PRIMARY_STATS } from "@terra/shared/roster";
import { useId, useRef, useState } from "react";
import { m } from "../../../paraglide/messages.js";
import { primaryCode, primaryName } from "../balanceMessages.ts";
import { NumberField } from "./fields.tsx";
import {
  addSkill,
  moveSkill,
  removeSkill,
  unitPresets,
  withElement,
  withK,
  withPrimary,
  withSkillGrade,
} from "./labModel.ts";
import { ELEMENT_TEXT, localized, rowText, skillName } from "./labMessages.ts";
import { PresetBar } from "./PresetBar.tsx";
import { RankFields } from "./RankFields.tsx";
import { UnitGear } from "./UnitGear.tsx";

const L = LAB_LIMITS;

export function UnitEditor(props: {
  readonly unit: LabUnit;
  /** 화면 머리 글(A1 등) */
  readonly unitKey: string;
  /** 어느 팀 유닛을 고치는지(창 색 테두리 표시) */
  readonly team: LabTeam;
  readonly catalog: LabCatalogResponse;
  readonly presets: LabPresetListResponse | null;
  readonly locale: string;
  readonly onChange: (change: (unit: LabUnit) => LabUnit) => void;
  readonly onPresets: (list: LabPresetListResponse) => void;
  readonly onNotice: (line: string, tone: "success" | "error") => void;
}) {
  const { unit, catalog, locale, onChange } = props;
  const id = useId();
  const rootRef = useRef<HTMLElement>(null);
  const [adding, setAdding] = useState("");
  const kind = catalog.unitKinds.find((entry) => entry.id === unit.kind);
  const growth = kind?.growth ?? true;
  const g = catalog.growth;
  const slotRule = kind?.skillSlots ?? { base: 0, perRebirth: 0, max: 0 };
  const slots = Math.max(0, Math.min(slotRule.max, slotRule.base + unit.rebirths * slotRule.perRebirth));
  const families = labFamilyValues(unit.elements);
  const fits = labElementsFitCreation(unit.elements);
  const outOfK = PRIMARY_STATS.filter((stat) => unit.kPm[stat] < g.kMinPm || unit.kPm[stat] > g.kMaxPm);
  const addable = catalog.skills.filter((skill) => !unit.skills.some((entry) => entry.id === skill.id));

  const setAllDetails = (open: boolean): void => {
    const root = rootRef.current;
    if (!root) return;
    for (const detail of root.querySelectorAll<HTMLDetailsElement>("details.bl-details")) {
      detail.open = open;
    }
  };

  return (
    <section
      ref={rootRef}
      className="bp-panel bl-editor"
      aria-labelledby={`${id}-title`}
      data-unit={props.unitKey}
      data-team={props.team}
    >
      <div className="bp-panel-head">
        <h2 id={`${id}-title`} className="bp-title">
          {m.dev_lab_editor_title({ unit: props.unitKey })}
        </h2>
        <div className="bl-panel-tools">
          <button type="button" className="button-small" onClick={() => setAllDetails(true)}>
            {m.dev_lab_expand_all()}
          </button>
          <button type="button" className="button-small" onClick={() => setAllDetails(false)}>
            {m.dev_lab_collapse_all()}
          </button>
        </div>
      </div>
      <PresetBar
        kind="unit"
        presets={unitPresets(props.presets?.presets ?? [])}
        writable={props.presets?.writable ?? false}
        locale={locale}
        current={() => ({ kind: "unit", data: unit })}
        onLoad={(value) => {
          if (value.kind !== "unit") return;
          // 진형 줄은 파티 자리라 그대로 둔다
          onChange((current) => ({ ...value.data, row: current.row }));
        }}
        onList={props.onPresets}
        onNotice={props.onNotice}
      />

      <details className="bl-details" open>
        <summary>{m.dev_lab_section_basic()}</summary>
        <div className="bl-details-body">
          <div className="bl-grid2">
            <div className="field">
              <label className="field-label" htmlFor={`${id}-label`}>
                {m.dev_lab_label()}
              </label>
              <input
                id={`${id}-label`}
                className="input bl-label-input"
                autoComplete="off"
                maxLength={L.labelMax}
                placeholder={localized(kind?.name, locale, unit.kind)}
                value={unit.label}
                onChange={(event) => {
                  const label = event.target.value;
                  onChange((current) => ({ ...current, label }));
                }}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${id}-kind`}>
                {m.dev_lab_kind()}
              </label>
              <select
                id={`${id}-kind`}
                className="bl-kind-select"
                value={unit.kind}
                onChange={(event) => {
                  const next = event.target.value;
                  // 칸 배치가 다르니 장비·무기 아이템은 비운다(직접 값은 남긴다)
                  onChange((current) => ({
                    ...current,
                    kind: next,
                    equipment: [],
                    weapon: current.weapon.kind === "item" ? { kind: "natural" } : current.weapon,
                  }));
                }}
              >
                {catalog.unitKinds.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {localized(entry.name, locale, entry.id)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="bl-grid3">
            <NumberField
              label={m.dev_lab_level()}
              hint={growth ? m.dev_lab_level_hint({ max: g.maxLevel }) : m.dev_lab_no_growth()}
              value={unit.level}
              min={L.levelMin}
              max={L.levelMax}
              className="bl-level"
              onChange={(level) => onChange((current) => ({ ...current, level }))}
            />
            <NumberField
              label={m.dev_lab_rebirths()}
              hint={m.dev_lab_rebirths_hint()}
              value={unit.rebirths}
              min={0}
              max={L.rebirthsMax}
              onChange={(rebirths) => onChange((current) => ({ ...current, rebirths }))}
            />
            <div className="field">
              <label className="field-label" htmlFor={`${id}-row`}>
                {m.dev_lab_row()}
              </label>
              <select
                id={`${id}-row`}
                value={unit.row}
                onChange={(event) => {
                  const row = LAB_ROWS.find((entry) => entry === event.target.value) ?? "front";
                  onChange((current) => ({ ...current, row }));
                }}
              >
                {LAB_ROWS.map((row) => (
                  <option key={row} value={row}>
                    {rowText(row)}
                  </option>
                ))}
              </select>
            </div>
            <RankFields unit={unit} onChange={onChange} />
          </div>
        </div>
      </details>

      <details className="bl-details" open>
        <summary>{m.dev_lab_section_primaries()}</summary>
        <div className="bl-details-body">
          <p className="field-hint">
            {growth
              ? m.dev_lab_growth_hint({ growth: g.growthPm, kMin: g.kMinPm, kMax: g.kMaxPm })
              : m.dev_lab_no_growth()}
          </p>
          <div className="bl-scroll">
            <table className="bl-table bl-primaries">
              <thead>
                <tr>
                  <th scope="col">{m.dev_lab_col_stat()}</th>
                  <th scope="col">{m.dev_lab_col_initial()}</th>
                  <th scope="col">{m.dev_lab_col_k()}</th>
                </tr>
              </thead>
              <tbody>
                {PRIMARY_STATS.map((stat) => (
                  <tr key={stat} data-field={stat}>
                    <th scope="row" className="bl-stat-code" title={primaryName(stat)}>
                      {primaryCode(stat)}
                    </th>
                    <td>
                      <NumberField
                        label={m.dev_lab_initial_of({ stat: primaryName(stat) })}
                        hideLabel
                        value={unit.initial[stat]}
                        min={L.primaryMin}
                        max={L.primaryMax}
                        className="bl-num-compact"
                        onChange={(value) => onChange((current) => withPrimary(current, stat, value))}
                      />
                    </td>
                    <td>
                      <NumberField
                        label={m.dev_lab_k_of({ stat: primaryName(stat) })}
                        hideLabel
                        value={unit.kPm[stat]}
                        min={L.kMin}
                        max={L.kMax}
                        className={`bl-num-compact${outOfK.includes(stat) ? " bl-warn" : ""}`}
                        onChange={(value) => onChange((current) => withK(current, stat, value))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {outOfK.length > 0 ? (
            <p className="field-hint bl-warn-text">{m.dev_lab_k_out({ min: g.kMinPm, max: g.kMaxPm })}</p>
          ) : null}
        </div>
      </details>

      <details className="bl-details">
        <summary>{m.dev_lab_section_elements()}</summary>
        <div className="bl-details-body">
          <p className="bl-chip-line">
            <span className="bl-chip" data-tone={fits ? "ok" : "warn"}>
              {fits ? m.dev_lab_elements_fit() : m.dev_lab_elements_unfit()}
            </span>
          </p>
          <div className="bl-elements">
            {families.map((sum, family) => (
              // oxlint-disable-next-line react/no-array-index-key -- 계열 차례가 열쇠다(6계열 고정)
              <div key={family} className="bl-family" data-family={family}>
                {[0, 1].map((part) => {
                  const index = family * 2 + part;
                  return (
                    <NumberField
                      key={index}
                      label={ELEMENT_TEXT[index]?.() ?? String(index)}
                      value={unit.elements[index] ?? 0}
                      min={0}
                      max={L.elementMax}
                      onChange={(value) => onChange((current) => withElement(current, index, value))}
                    />
                  );
                })}
                <span className="bl-family-sum">{m.dev_lab_family_sum({ value: sum })}</span>
              </div>
            ))}
          </div>
        </div>
      </details>

      <UnitGear unit={unit} catalog={catalog} locale={locale} onChange={onChange} />

      <details className="bl-details" open>
        <summary>{m.dev_lab_section_skills({ used: Math.min(unit.skills.length, slots), slots })}</summary>
        <div className="bl-details-body">
          <p className="field-hint">{m.dev_lab_skills_hint()}</p>
          <ol className="bl-skills">
            {unit.skills.map((skill, index) => (
              <li key={skill.id} className="bl-skill" data-over={index >= slots ? "" : undefined}>
                <span className="bl-skill-name">{skillName(catalog, skill.id, locale)}</span>
                <NumberField
                  label={m.dev_lab_grade()}
                  value={skill.grade}
                  min={L.skillGradeMin}
                  max={L.skillGradeMax}
                  className="bl-grade"
                  onChange={(grade) => onChange((current) => withSkillGrade(current, skill.id, grade))}
                />
                <button
                  type="button"
                  className="button-small bl-icon"
                  aria-label={m.dev_lab_move_up()}
                  aria-disabled={index === 0}
                  onClick={() => onChange((current) => moveSkill(current, skill.id, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="button-small bl-icon"
                  aria-label={m.dev_lab_skill_remove({ name: skillName(catalog, skill.id, locale) })}
                  onClick={() => onChange((current) => removeSkill(current, skill.id))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
          {unit.skills.length > slots ? (
            <p className="field-hint bl-warn-text">{m.dev_lab_skills_over()}</p>
          ) : null}
          <div className="bl-add">
            <label className="visually-hidden" htmlFor={`${id}-skill`}>
              {m.dev_lab_skill_add()}
            </label>
            <select id={`${id}-skill`} value={adding} onChange={(event) => setAdding(event.target.value)}>
              <option value="">{m.dev_lab_skill_pick()}</option>
              {addable.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skillName(catalog, skill.id, locale)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button-small bl-skill-add"
              aria-disabled={adding === ""}
              onClick={() => {
                if (adding === "") return;
                onChange((current) => addSkill(current, adding));
                setAdding("");
              }}
            >
              {m.dev_lab_skill_add()}
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}
