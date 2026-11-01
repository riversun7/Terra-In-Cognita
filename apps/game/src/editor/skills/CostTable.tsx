// 행동별 소모 화면(D-491) — 스태미나·MP를 쓰는 행동을 한 표로: 걷기·퇴각(무료, D-418), 무기마다 기본 공격, 유닛 종류마다 맨손 기본 공격,
// 건물 공격(기본 공격 값), 회피 기동(미구현), 스킬마다 자원·소모. 줄마다 [적용]이 그 줄만 서버 묶음으로 보낸다(바로 듦, D-461).
// 여기 값은 기본값이고 실제 소모 배율(STA 점수, N13)은 설정 칸 쪽이다(work/formulas가 식으로 연다).
import {
  ACTION_COST_MAX,
  type ActionCostRow,
  SKILL_RESOURCES,
  type SkillEditorChange,
  type SkillJson,
} from "@terra/shared/skillEditor";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { NumberField, SelectField } from "../content/contentEditorFields.tsx";
import { KIND_TEXT, ORIGIN_TEXT, RESOURCE_TEXT, actionText, statusText } from "./skillMessages.ts";

type Locale = "ko" | "en";

function WeaponRow({
  row,
  locale,
  busy,
  onApply,
}: {
  row: Extract<ActionCostRow, { kind: "weapon" | "natural" }>;
  locale: Locale;
  busy: boolean;
  onApply: (change: SkillEditorChange, name: string) => void;
}) {
  const [stamina, setStamina] = useState(row.staminaCost);
  const [mp, setMp] = useState(row.mpCost);
  const name = row.name[locale];
  const changed = stamina !== row.staminaCost || mp !== row.mpCost;
  const category = row.kind === "weapon" ? "items" : "unit_kinds";
  return (
    <tr data-key={row.key} data-kind={row.kind} data-changed={changed ? "" : undefined}>
      <th scope="row">
        <span className="sk-cost-name">{name}</span>
        <span className="sk-cost-id">{row.id}</span>
        <span className="sk-cost-kind">{KIND_TEXT[row.kind]()}</span>
        {row.origin !== "pack" ? (
          <span className="sk-chip sk-chip-edited">{ORIGIN_TEXT[row.origin]()}</span>
        ) : null}
      </th>
      <td className="sk-col-kind">{KIND_TEXT[row.kind]()}</td>
      <td>
        <NumberField
          className="sk-cost-input"
          hideLabel
          label={m.dev_skills_cost_value_label({ name, what: m.dev_skills_col_stamina() })}
          value={stamina}
          min={0}
          max={ACTION_COST_MAX}
          onChange={(value) => setStamina(value ?? 0)}
        />
      </td>
      <td>
        <NumberField
          className="sk-cost-input"
          hideLabel
          label={m.dev_skills_cost_value_label({ name, what: m.dev_skills_col_mp() })}
          value={mp}
          min={0}
          max={ACTION_COST_MAX}
          onChange={(value) => setMp(value ?? 0)}
        />
        {row.basic === "physical" ? (
          <span className="sk-cost-note">{m.dev_skills_mp_basic_hint()}</span>
        ) : null}
      </td>
      <td>
        <button
          type="button"
          className="button-small sk-cost-apply"
          aria-disabled={busy || !changed}
          onClick={
            busy || !changed
              ? undefined
              : () =>
                  onApply({ op: "set_cost", category, id: row.id, staminaCost: stamina, mpCost: mp }, name)
          }
        >
          {m.dev_skills_col_apply()}
        </button>
      </td>
    </tr>
  );
}

function SkillRow({
  row,
  entry,
  locale,
  busy,
  onApply,
  onOpen,
}: {
  row: Extract<ActionCostRow, { kind: "skill" }>;
  entry: SkillJson | undefined;
  locale: Locale;
  busy: boolean;
  onApply: (change: SkillEditorChange, name: string) => void;
  onOpen: (id: string) => void;
}) {
  const [resource, setResource] = useState(row.resource);
  const [cost, setCost] = useState(row.cost);
  const name = row.name[locale];
  const changed = resource !== row.resource || cost !== row.cost;
  return (
    <tr
      data-key={row.key}
      data-kind="skill"
      data-changed={changed ? "" : undefined}
      data-off={row.enabled ? undefined : ""}
    >
      <th scope="row">
        <button
          type="button"
          className="sk-link"
          onClick={() => onOpen(row.id)}
          title={m.dev_skills_open_skill()}
        >
          {name}
        </button>
        <span className="sk-cost-id">{row.id}</span>
        <span className="sk-cost-kind">{KIND_TEXT.skill()}</span>
        {row.origin !== "pack" ? (
          <span className="sk-chip sk-chip-edited">{ORIGIN_TEXT[row.origin]()}</span>
        ) : null}
        {row.enabled ? null : <span className="sk-chip">{m.dev_skills_disabled()}</span>}
      </th>
      <td className="sk-col-kind">{KIND_TEXT.skill()}</td>
      <td colSpan={2}>
        <div className="sk-cost-skill">
          <SelectField
            className="sk-cost-input"
            hideLabel
            label={m.dev_skills_cost_resource_label({ name })}
            value={resource}
            options={SKILL_RESOURCES.map((value) => ({ value, label: RESOURCE_TEXT[value]() }))}
            onChange={setResource}
          />
          <NumberField
            className="sk-cost-input"
            hideLabel
            label={m.dev_skills_cost_value_label({ name, what: m.dev_skills_field_cost() })}
            value={cost}
            min={0}
            max={ACTION_COST_MAX}
            onChange={(value) => setCost(value ?? 0)}
          />
        </div>
      </td>
      <td>
        <button
          type="button"
          className="button-small sk-cost-apply"
          aria-disabled={busy || !changed || !entry}
          onClick={
            busy || !changed || !entry
              ? undefined
              : () => onApply({ op: "put_skill", entry: { ...entry, resource, cost } }, name)
          }
        >
          {m.dev_skills_col_apply()}
        </button>
      </td>
    </tr>
  );
}

export function CostTable({
  rows,
  skills,
  revision,
  locale,
  busy,
  onApply,
  onOpenSkill,
}: {
  rows: readonly ActionCostRow[];
  skills: ReadonlyMap<string, SkillJson>;
  revision: number;
  locale: Locale;
  busy: boolean;
  onApply: (change: SkillEditorChange, name: string) => void;
  onOpenSkill: (id: string) => void;
}) {
  return (
    <section className="sk-costs" aria-labelledby="sk-costs-title">
      <h2 id="sk-costs-title" className="sk-heading">
        {m.dev_skills_costs_table()}
      </h2>
      <p className="field-hint">{m.dev_skills_costs_lead()}</p>
      <div className="sk-table-wrap">
        <table className="sk-cost-table">
          <thead>
            <tr>
              <th scope="col">{m.dev_skills_col_action()}</th>
              <th scope="col" className="sk-col-kind">
                {m.dev_skills_col_kind()}
              </th>
              <th scope="col">{m.dev_skills_col_stamina()}</th>
              <th scope="col">{m.dev_skills_col_mp()}</th>
              <th scope="col">{m.dev_skills_col_apply()}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              if (row.kind === "fixed")
                return (
                  <tr key={row.key} data-key={row.key} data-kind="fixed" data-status={row.status}>
                    <th scope="row">{actionText(row.key)}</th>
                    <td className="sk-col-kind">{KIND_TEXT.fixed()}</td>
                    <td colSpan={3}>
                      <span className={`sk-chip sk-status-${row.status}`}>{statusText(row.status)}</span>
                    </td>
                  </tr>
                );
              // 판이 바뀌면(저장·다른 사람) 줄의 입력을 서버 값으로 다시 맞춘다
              const key = `${row.key}@${revision}`;
              return row.kind === "skill" ? (
                <SkillRow
                  key={key}
                  row={row}
                  entry={skills.get(row.id)}
                  locale={locale}
                  busy={busy}
                  onApply={onApply}
                  onOpen={onOpenSkill}
                />
              ) : (
                <WeaponRow key={key} row={row} locale={locale} busy={busy} onApply={onApply} />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
