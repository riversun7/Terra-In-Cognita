// 건물 편집기 편집 판 — 시설 하나: 머리(이름·ID·출처·고친 사람), 기본(이름·켜기·단계·최고 레벨·레벨당 자리·오염), 건설 재료(레벨 구간·
// 레벨 표, BuildingLevels), 채집(스탯 짝·사다리 중분류·방식·수확량), 레시피(읽기만, 아이템 편집기로 가는 고리), 검사 문제.
// 옛 관리자 건물 편집기의 편집 폼(기본 정보 | 생산·저장·주거 | 계층·군사·기타)에서 우리 자료에 있는 칸만 둔다(ADR 3절 표).
import type {
  BuildingEditorFacility,
  BuildingEditorListResponse,
  FacilityGatherJson,
  FacilityJson,
} from "@terra/shared/buildingEditor";
import {
  FACILITY_LEVEL_MAX,
  FACILITY_LIMITS,
  FACILITY_STAGE_IDS,
  FACILITY_STAT_IDS,
  GATHER_MODE_IDS,
} from "@terra/shared/buildingEditor";
import type { ContentIssueView } from "@terra/shared/contentEdit";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { CheckField, NumberField, SelectField, TextField } from "../content/contentEditorFields.tsx";
import { BuildingLevels } from "./BuildingLevels.tsx";
import { MODE_TEXT, ORIGIN_TEXT, STAGE_TEXT, STAT_TEXT, issueText, issueWhere } from "./buildingMessages.ts";
import { newGather, setGather } from "./buildingModel.ts";

function GatherSection({
  list,
  entry,
  locale,
  onEdit,
}: {
  list: BuildingEditorListResponse;
  entry: FacilityJson;
  locale: "ko" | "en";
  onEdit: (next: FacilityJson) => void;
}) {
  const gather = entry.gather;
  const set = (next: FacilityGatherJson): void => onEdit(setGather(entry, next));
  const stats = FACILITY_STAT_IDS.map((value) => ({ value, label: STAT_TEXT[value]() }));
  const subs = list.subcategories
    .filter((sub) => sub.major === "raw" || sub.id === gather?.subcategory)
    .map((sub) => ({ value: sub.id, label: `${sub.name[locale]} (${sub.id})` }));
  return (
    <section className="be-panel be-section" aria-labelledby="be-gather-title">
      <h3 id="be-gather-title" className="be-heading">
        {m.dev_buildings_section_gather()}
      </h3>
      {gather ? (
        <>
          <p className="field-hint">{m.dev_buildings_gather_hint({ bonus: list.gatherLevelBonus })}</p>
          <div className="be-grid">
            <SelectField
              label={m.dev_buildings_field_primary()}
              value={gather.primary}
              options={stats}
              onChange={(primary) => set({ ...gather, primary })}
            />
            <SelectField
              label={m.dev_buildings_field_secondary()}
              value={gather.secondary}
              options={stats}
              onChange={(secondary) => set({ ...gather, secondary })}
            />
            <SelectField
              label={m.dev_buildings_field_subcategory()}
              value={gather.subcategory}
              options={subs}
              onChange={(subcategory) => set({ ...gather, subcategory })}
            />
            <SelectField
              label={m.dev_buildings_field_mode()}
              value={gather.mode ?? "roll"}
              options={GATHER_MODE_IDS.map((value) => ({ value, label: MODE_TEXT[value]() }))}
              onChange={(mode) => set({ ...gather, mode: mode === "roll" ? undefined : mode })}
            />
            <NumberField
              label={m.dev_buildings_field_yield_base()}
              optional
              value={gather.yieldBase}
              min={FACILITY_LIMITS.yieldBase.min}
              max={FACILITY_LIMITS.yieldBase.max}
              onChange={(yieldBase) => set({ ...gather, yieldBase })}
            />
            <NumberField
              label={m.dev_buildings_field_yield_rate()}
              optional
              value={gather.yieldPerStatPm}
              min={FACILITY_LIMITS.yieldPerStatPm.min}
              max={FACILITY_LIMITS.yieldPerStatPm.max}
              onChange={(yieldPerStatPm) => set({ ...gather, yieldPerStatPm })}
            />
            <NumberField
              label={m.dev_buildings_field_yield_cap()}
              optional
              value={gather.yieldCap}
              min={FACILITY_LIMITS.yieldCap.min}
              max={FACILITY_LIMITS.yieldCap.max}
              onChange={(yieldCap) => set({ ...gather, yieldCap })}
            />
          </div>
          <button type="button" className="button-small" onClick={() => onEdit(setGather(entry, undefined))}>
            {m.dev_buildings_remove_gather()}
          </button>
        </>
      ) : (
        <div className="be-actions">
          <p className="field-hint">{m.dev_buildings_no_gather()}</p>
          {entry.stage === "gather" ? (
            <button
              type="button"
              className="button-small"
              onClick={() => onEdit(newGather(entry, list.subcategories))}
            >
              {m.dev_buildings_new_gather()}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function RecipeSection({
  list,
  row,
  locale,
}: {
  list: BuildingEditorListResponse;
  row: BuildingEditorFacility;
  locale: "ko" | "en";
}) {
  const nameOf = new Map(list.items.map((item) => [item.id, item.name[locale]]));
  const stacks = (lines: readonly { item: string; qty: number }[]) =>
    lines.map((stack, index) => (
      <span key={stack.item}>
        {index > 0 ? " · " : null}
        <AppLink to={{ route: "dev_items", search: { item: stack.item } }} className="be-item-link">
          {nameOf.get(stack.item) ?? stack.item}
        </AppLink>{" "}
        {stack.qty}
      </span>
    ));
  return (
    <section className="be-panel be-section" aria-labelledby="be-recipes-title">
      <h3 id="be-recipes-title" className="be-heading">
        {m.dev_buildings_section_recipes()}
      </h3>
      {row.recipes.length === 0 ? <p className="field-hint">{m.dev_buildings_no_recipes()}</p> : null}
      <ul className="be-plain-list be-recipes">
        {row.recipes.map((recipe) => (
          <li key={recipe.id} data-recipe={recipe.id}>
            <p>
              <strong>{recipe.name[locale]}</strong> <span className="dev-code">{recipe.id}</span>
              {recipe.enabled ? null : (
                <>
                  {" "}
                  <span className="dev-badge be-badge-off">{m.dev_content_disabled()}</span>
                </>
              )}
            </p>
            <p className="be-recipe-line">
              {recipe.inputs.length === 0 ? m.dev_buildings_recipe_none_input() : stacks(recipe.inputs)}
              {" → "}
              {stacks(recipe.outputs)}
              {` · ${m.dev_buildings_recipe_work({ work: recipe.work })}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BuildingDetail({
  list,
  row,
  draft,
  locale,
  staged,
  reverting,
  issues,
  checking,
  onEdit,
  onRevert,
  onUnstage,
  onBack,
}: {
  list: BuildingEditorListResponse;
  row: BuildingEditorFacility;
  draft: FacilityJson;
  locale: "ko" | "en";
  staged: boolean;
  reverting: boolean;
  issues: readonly ContentIssueView[];
  checking: boolean;
  onEdit: (next: FacilityJson) => void;
  onRevert: () => void;
  onUnstage: () => void;
  onBack: () => void;
}) {
  // 되돌리기를 담았으면 팩 값을 보이고 고치지 않는다(담기 취소로 돌아온다)
  const edit = reverting ? () => undefined : onEdit;
  const override = row.override;
  return (
    <article className="be-detail" aria-labelledby="be-detail-title" data-facility={row.entry.id}>
      <div className="be-detail-head">
        <button type="button" className="button-small be-back-list" onClick={onBack}>
          {m.dev_buildings_back_list()}
        </button>
        <h2 id="be-detail-title" className="be-title">
          {draft.name[locale]} <span className="dev-code">{row.entry.id}</span>
        </h2>
        <span className="dev-badge" data-origin={row.origin}>
          {ORIGIN_TEXT[row.origin]()}
        </span>
        <div className="be-actions">
          {staged ? (
            <button type="button" className="button-small be-unstage" onClick={onUnstage}>
              {m.dev_buildings_unstage()}
            </button>
          ) : null}
          {row.origin === "edited" && !reverting ? (
            <button type="button" className="button-small be-revert" onClick={onRevert}>
              {m.dev_buildings_revert()}
            </button>
          ) : null}
        </div>
      </div>
      {override ? (
        <p className="field-hint">
          {m.dev_buildings_override_by({
            who: override.updatedBy ?? m.dev_content_history_system(),
            when: new Date(override.updatedAt).toLocaleString(locale),
          })}
          {override.note ? ` · ${override.note}` : ""}
        </p>
      ) : null}
      {reverting ? (
        <p className="field-hint be-reverting" role="status">
          {m.dev_buildings_reverting()}
        </p>
      ) : null}
      {issues.length > 0 || checking ? (
        <section className="be-panel be-issues" aria-labelledby="be-issues-title">
          <h3 id="be-issues-title" className="be-heading">
            {m.dev_buildings_issues_title()}
          </h3>
          {checking ? <p className="field-hint">{m.dev_buildings_checking()}</p> : null}
          <ul className="be-plain-list">
            {issues.map((issue) => (
              <li key={`${issue.path ?? ""}-${issue.code ?? ""}`} data-level={issue.level}>
                <span className="dev-code">{issueWhere(issue)}</span> {issueText(issue)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <fieldset className="be-fieldset" disabled={reverting}>
        <legend className="visually-hidden">{m.dev_buildings_section_basic()}</legend>
        <section className="be-panel be-section" aria-labelledby="be-basic-title">
          <h3 id="be-basic-title" className="be-heading">
            {m.dev_buildings_section_basic()}
          </h3>
          <div className="be-grid">
            <TextField
              label={m.dev_buildings_field_name_ko()}
              value={draft.name.ko}
              maxLength={FACILITY_LIMITS.nameMax}
              onChange={(ko) => edit({ ...draft, name: { ...draft.name, ko } })}
            />
            <TextField
              label={m.dev_buildings_field_name_en()}
              value={draft.name.en}
              maxLength={FACILITY_LIMITS.nameMax}
              onChange={(en) => edit({ ...draft, name: { ...draft.name, en } })}
            />
            <SelectField
              label={m.dev_buildings_field_stage()}
              value={draft.stage}
              options={FACILITY_STAGE_IDS.map((value) => ({ value, label: STAGE_TEXT[value]() }))}
              onChange={(stage) => edit({ ...draft, stage })}
            />
            <NumberField
              label={m.dev_buildings_field_max_level()}
              optional
              value={draft.maxLevel}
              min={1}
              max={FACILITY_LEVEL_MAX}
              onChange={(maxLevel) => edit({ ...draft, maxLevel })}
            />
            <NumberField
              label={m.dev_buildings_field_slots()}
              value={draft.slotsPerLevel}
              min={FACILITY_LIMITS.slotsPerLevel.min}
              max={FACILITY_LIMITS.slotsPerLevel.max}
              onChange={(slotsPerLevel) => {
                if (slotsPerLevel !== undefined) edit({ ...draft, slotsPerLevel });
              }}
            />
            <NumberField
              label={m.dev_buildings_field_pollution()}
              optional
              value={draft.pollution}
              min={FACILITY_LIMITS.pollution.min}
              max={FACILITY_LIMITS.pollution.max}
              onChange={(pollution) => edit({ ...draft, pollution })}
            />
          </div>
          <CheckField
            label={m.dev_buildings_field_enabled()}
            hint={m.dev_buildings_field_enabled_hint()}
            checked={draft.enabled}
            onChange={(enabled) => edit({ ...draft, enabled })}
          />
        </section>
        <BuildingLevels list={list} entry={draft} locale={locale} onEdit={edit} />
        <GatherSection list={list} entry={draft} locale={locale} onEdit={edit} />
      </fieldset>
      <RecipeSection list={list} row={row} locale={locale} />
    </article>
  );
}
