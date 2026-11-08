// 건물 편집기 편집 판(2026-11-08 화면 개편: 공용 머리·구역·칸 견주기) — 시설 하나: 머리(이름·ID·출처·고친 사람·이전/다음·[담기 취소]·
// [팩 값으로]), 검사 문제(칸 옆에도 보인다), 기본(이름·단계·최고 레벨·레벨당 자리·오염), 건설 재료(레벨 구간·
// 레벨 표, BuildingLevels), 채집(스탯 짝·사다리 중분류·방식·수확량), 장비 수리 줄(BuildingRepair, D-512 323), 레시피(읽기만, 아이템
// 편집기로 가는 고리), 검사 문제. 기본 칸에 건물 런타임 값(2차맵 칸 크기·레벨 1 최대 내구도 M15·창고 용량 N50,
// docs/adr/2026-11-07-buildings-runtime.md)도 둔다.
// 시설에는 켜기·끄기가 없다(늘 켜짐, 사용자 답 2026-11-03 "켜고 끄는건 말이 안된다" — 쓰고 싶지 않은 재료는 다른 재료로 바꾼다).
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
import { FACILITY_RUNTIME_LIMITS } from "@terra/shared/facilityRuntime";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { type CompareSource, CompareProvider } from "../content/contentEditorCompare.tsx";
import { NumberField, SelectField, TextField } from "../content/contentEditorFields.tsx";
import { Badge, EntryHead, FormSection, SectionJump } from "../content/contentEditorLayout.tsx";
import { joinPath, pathParts } from "../content/contentEditorPaths.ts";
import { BuildingLevels } from "./BuildingLevels.tsx";
import { BuildingRepair } from "./BuildingRepair.tsx";
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
    <FormSection
      name="gather"
      className="be-section"
      title={m.dev_buildings_section_gather()}
      desc={m.dev_buildings_gather_hint({ bonus: list.gatherLevelBonus })}
      source="49 N32 · N43"
      paths={["gather"]}
    >
      {gather ? (
        <>
          <div className="be-grid">
            <SelectField
              label={m.dev_buildings_field_primary()}
              path="gather.primary"
              value={gather.primary}
              options={stats}
              onChange={(primary) => set({ ...gather, primary })}
            />
            <SelectField
              label={m.dev_buildings_field_secondary()}
              path="gather.secondary"
              value={gather.secondary}
              options={stats}
              onChange={(secondary) => set({ ...gather, secondary })}
            />
            <SelectField
              label={m.dev_buildings_field_subcategory()}
              path="gather.subcategory"
              value={gather.subcategory}
              options={subs}
              onChange={(subcategory) => set({ ...gather, subcategory })}
            />
            <SelectField
              label={m.dev_buildings_field_mode()}
              path="gather.mode"
              value={gather.mode ?? "roll"}
              options={GATHER_MODE_IDS.map((value) => ({ value, label: MODE_TEXT[value]() }))}
              onChange={(mode) => set({ ...gather, mode: mode === "roll" ? undefined : mode })}
            />
            <NumberField
              label={m.dev_buildings_field_yield_base()}
              path="gather.yieldBase"
              optional
              value={gather.yieldBase}
              min={FACILITY_LIMITS.yieldBase.min}
              max={FACILITY_LIMITS.yieldBase.max}
              onChange={(yieldBase) => set({ ...gather, yieldBase })}
            />
            <NumberField
              label={m.dev_buildings_field_yield_rate()}
              path="gather.yieldPerStatPm"
              optional
              value={gather.yieldPerStatPm}
              min={FACILITY_LIMITS.yieldPerStatPm.min}
              max={FACILITY_LIMITS.yieldPerStatPm.max}
              onChange={(yieldPerStatPm) => set({ ...gather, yieldPerStatPm })}
            />
            <NumberField
              label={m.dev_buildings_field_yield_cap()}
              path="gather.yieldCap"
              optional
              value={gather.yieldCap}
              min={FACILITY_LIMITS.yieldCap.min}
              max={FACILITY_LIMITS.yieldCap.max}
              onChange={(yieldCap) => set({ ...gather, yieldCap })}
            />
          </div>
          <div className="ce-inline-actions">
            <button type="button" onClick={() => onEdit(setGather(entry, undefined))}>
              {m.dev_buildings_remove_gather()}
            </button>
          </div>
        </>
      ) : (
        <div className="ce-inline-actions">
          <p className="field-hint">{m.dev_buildings_no_gather()}</p>
          {entry.stage === "gather" ? (
            <button type="button" onClick={() => onEdit(newGather(entry, list.subcategories))}>
              {m.dev_buildings_new_gather()}
            </button>
          ) : null}
        </div>
      )}
    </FormSection>
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
    <FormSection
      name="recipes"
      className="be-section"
      title={m.dev_buildings_section_recipes()}
      desc={m.dev_buildings_recipes_desc()}
    >
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
    </FormSection>
  );
}

const isFacilityJson = (value: unknown): value is FacilityJson =>
  typeof value === "object" && value !== null && typeof Reflect.get(value, "id") === "string";

/** 칸 경로를 같은 모양으로("build.levels.0.from" = "build.levels[0].from") */
const normalPath = (path: string): string => joinPath(pathParts(path));

/** 구역 이름(바로 가기·시험 data-section) */
const SECTIONS = [
  { name: "basic", label: m.dev_buildings_section_basic },
  { name: "build", label: m.dev_buildings_section_build },
  { name: "levels", label: m.dev_buildings_levels_title },
  { name: "gather", label: m.dev_buildings_section_gather },
  { name: "repair", label: m.dev_buildings_section_repair },
  { name: "recipes", label: m.dev_buildings_section_recipes },
] as const;

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
  onPrev,
  onNext,
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
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  // 되돌리기를 담았으면 팩 값을 보이고 고치지 않는다(담기 취소로 돌아온다)
  const edit = reverting ? () => undefined : onEdit;
  const override = row.override;
  const byPath = new Map<string, string>();
  for (const issue of issues) {
    const path = normalPath(issue.path ?? "");
    if (path !== "" && !byPath.has(path)) byPath.set(path, issueText(issue));
  }
  const source: CompareSource = {
    draft,
    current: row.entry,
    pack: row.pack,
    locked: reverting,
    apply: (next) => {
      if (isFacilityJson(next)) onEdit(next);
    },
    problemOf: (path) => byPath.get(normalPath(path)),
  };
  return (
    <article className="be-detail" aria-labelledby="be-detail-title" data-facility={row.entry.id}>
      <EntryHead
        headingId="be-detail-title"
        name={draft.name[locale]}
        id={row.entry.id}
        backClass="be-back-list"
        onBack={onBack}
        onPrev={onPrev}
        onNext={onNext}
        badges={
          <>
            {staged ? (
              <Badge tone="staged">
                {reverting ? m.dev_buildings_revert_staged() : m.dev_content_badge_staged()}
              </Badge>
            ) : null}
            <span className="dev-badge" data-origin={row.origin}>
              {ORIGIN_TEXT[row.origin]()}
            </span>
          </>
        }
        info={
          override ? (
            <p>
              {m.dev_buildings_override_by({
                who: override.updatedBy ?? m.dev_content_history_system(),
                when: new Date(override.updatedAt).toLocaleString(locale),
              })}
              {override.note ? ` · ${override.note}` : ""}
            </p>
          ) : null
        }
        actions={
          <>
            {staged ? (
              <button type="button" className="be-unstage" onClick={onUnstage}>
                {m.dev_buildings_unstage()}
              </button>
            ) : null}
            {row.origin === "edited" && !reverting ? (
              <button type="button" className="be-revert" onClick={onRevert}>
                {m.dev_buildings_revert()}
              </button>
            ) : null}
          </>
        }
      />
      {reverting ? (
        <p className="ce-confirm be-reverting" role="status">
          {m.dev_buildings_reverting()}
        </p>
      ) : null}
      {issues.length > 0 || checking ? (
        <section className="ce-panel be-issues" aria-labelledby="be-issues-title">
          <h3 id="be-issues-title" className="ce-panel-title">
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
      <SectionJump sections={SECTIONS.map((section) => ({ name: section.name, label: section.label() }))} />
      <CompareProvider source={source}>
        <fieldset className="be-fieldset" disabled={reverting}>
          <legend className="visually-hidden">{m.dev_buildings_section_basic()}</legend>
          <FormSection
            name="basic"
            className="be-section"
            title={m.dev_buildings_section_basic()}
            desc={m.dev_buildings_basic_desc()}
            source="M15 · N50"
            paths={[
              "name",
              "stage",
              "maxLevel",
              "slotsPerLevel",
              "pollution",
              "footprint",
              "durability",
              "storageKg",
            ]}
          >
            <div className="be-grid">
              <TextField
                label={m.dev_buildings_field_name_ko()}
                path="name.ko"
                value={draft.name.ko}
                maxLength={FACILITY_LIMITS.nameMax}
                onChange={(ko) => edit({ ...draft, name: { ...draft.name, ko } })}
              />
              <TextField
                label={m.dev_buildings_field_name_en()}
                path="name.en"
                value={draft.name.en}
                maxLength={FACILITY_LIMITS.nameMax}
                onChange={(en) => edit({ ...draft, name: { ...draft.name, en } })}
              />
              <SelectField
                label={m.dev_buildings_field_stage()}
                path="stage"
                value={draft.stage}
                options={FACILITY_STAGE_IDS.map((value) => ({ value, label: STAGE_TEXT[value]() }))}
                onChange={(stage) => edit({ ...draft, stage })}
              />
              <NumberField
                label={m.dev_buildings_field_max_level()}
                path="maxLevel"
                optional
                value={draft.maxLevel}
                min={1}
                max={FACILITY_LEVEL_MAX}
                onChange={(maxLevel) => edit({ ...draft, maxLevel })}
              />
              <NumberField
                label={m.dev_buildings_field_slots()}
                path="slotsPerLevel"
                desc={m.dev_buildings_slots_desc()}
                value={draft.slotsPerLevel}
                min={FACILITY_LIMITS.slotsPerLevel.min}
                max={FACILITY_LIMITS.slotsPerLevel.max}
                onChange={(slotsPerLevel) => {
                  if (slotsPerLevel !== undefined) edit({ ...draft, slotsPerLevel });
                }}
              />
              <NumberField
                label={m.dev_buildings_field_pollution()}
                path="pollution"
                optional
                value={draft.pollution}
                min={FACILITY_LIMITS.pollution.min}
                max={FACILITY_LIMITS.pollution.max}
                onChange={(pollution) => edit({ ...draft, pollution })}
              />
              <NumberField
                label={m.dev_buildings_field_footprint_w()}
                path="footprint.width"
                unit={m.dev_content_unit_tiles()}
                optional
                value={draft.footprint?.width}
                min={FACILITY_RUNTIME_LIMITS.footprint.min}
                max={FACILITY_RUNTIME_LIMITS.footprint.max}
                hint={m.dev_buildings_footprint_hint()}
                onChange={(width) =>
                  edit({
                    ...draft,
                    footprint:
                      width === undefined ? undefined : { width, height: draft.footprint?.height ?? width },
                  })
                }
              />
              <NumberField
                label={m.dev_buildings_field_footprint_h()}
                path="footprint.height"
                unit={m.dev_content_unit_tiles()}
                optional
                value={draft.footprint?.height}
                min={FACILITY_RUNTIME_LIMITS.footprint.min}
                max={FACILITY_RUNTIME_LIMITS.footprint.max}
                onChange={(height) =>
                  edit({
                    ...draft,
                    footprint:
                      height === undefined ? undefined : { width: draft.footprint?.width ?? height, height },
                  })
                }
              />
              <NumberField
                label={m.dev_buildings_field_durability()}
                path="durability"
                optional
                value={draft.durability}
                min={FACILITY_RUNTIME_LIMITS.durability.min}
                max={FACILITY_RUNTIME_LIMITS.durability.max}
                hint={m.dev_buildings_durability_hint()}
                onChange={(durability) => edit({ ...draft, durability })}
              />
              <NumberField
                label={m.dev_buildings_field_storage()}
                path="storageKg"
                optional
                value={draft.storageKg}
                min={FACILITY_RUNTIME_LIMITS.storageKg.min}
                max={FACILITY_RUNTIME_LIMITS.storageKg.max}
                hint={m.dev_buildings_storage_hint()}
                onChange={(storageKg) => edit({ ...draft, storageKg })}
              />
            </div>
          </FormSection>
          <BuildingLevels list={list} entry={draft} locale={locale} onEdit={edit} />
          <GatherSection list={list} entry={draft} locale={locale} onEdit={edit} />
          <BuildingRepair list={list} entry={draft} locale={locale} onEdit={edit} />
        </fieldset>
      </CompareProvider>
      <RecipeSection list={list} row={row} locale={locale} />
    </article>
  );
}
