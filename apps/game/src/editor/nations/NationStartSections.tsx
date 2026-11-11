// 시작 국가 설정 편집 판의 수 구역 — 시작 조건(시작 도시 수·도시 이름·처음 창고) · 인구·유닛(주거·처음 인구·기본 시설·지도자·사람 이름) ·
// 성격(도시 직무 = NPC 도시 경제가 읽는 특산). 국가 칸이 비면 국력 등급 표 값("등급 기본값 N"), 등급도 없으면 설정 칸 값("기본값 N")이 든다
// (docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)").
// 이 수들은 앞으로 서는 시작 도시·모자란 기본 시설·처음 인구에만 든다(이미 선 것은 고치지 않는다) — docs/adr/2026-11-10-nation-editor.md 2절
import {
  NATION_LIST_LIMITS,
  NATION_SEED_LIMITS,
  type NationEditorListResponse,
  type NationPersonalityJson,
  type NationPresetJson,
} from "@terra/shared/nationEditor";
import type { ReactNode } from "react";
import { m } from "../../paraglide/messages.js";
import { NumberField, RemoveButton, SelectField } from "../content/contentEditorFields.tsx";
import { FormSection } from "../content/contentEditorLayout.tsx";
import { setPersonality, startCountsOf, tierOf } from "./nationModel.ts";

interface SectionProps {
  title: string;
  draft: NationPresetJson;
  list: NationEditorListResponse;
  onEdit: (next: NationPresetJson) => void;
}

const fallback = (value: number): string => m.dev_nations_default({ value });
/** 비우면 드는 값: 등급 값이 있으면 "등급 기본값 N", 없으면 설정 칸 "기본값 N" */
const hintOf = (base: number, tierBase: number | undefined): string =>
  tierBase === undefined ? fallback(base) : m.dev_nations_tier_default({ value: tierBase });

/** 성격 칸의 선택 정수 칸 하나(비우면 등급 표 값 → 설정 칸 기본값) */
function SeedField({
  draft,
  field,
  label,
  desc,
  min,
  max,
  base,
  tierBase,
  unit,
  onEdit,
}: {
  draft: NationPresetJson;
  field: Exclude<keyof NationPersonalityJson, "cityJobs" | "startStock">;
  label: string;
  desc?: string | undefined;
  min: number;
  max: number;
  /** 설정 칸의 지금 값 */
  base: number;
  /** 이 국가 등급 표의 값(등급이 없거나 그 칸이 등급에 없으면 undefined) */
  tierBase?: number | undefined;
  unit?: string | undefined;
  onEdit: (next: NationPresetJson) => void;
}) {
  return (
    <NumberField
      label={label}
      value={draft.personality?.[field]}
      min={min}
      max={max}
      optional
      unit={unit}
      desc={desc}
      hint={hintOf(base, tierBase)}
      onChange={(value) => onEdit(setPersonality(draft, field, value))}
      path={`personality.${field}`}
    />
  );
}

export function NationStartSection({
  title,
  draft,
  list,
  locale,
  names,
  onEdit,
}: SectionProps & { locale: "ko" | "en"; names: ReactNode }) {
  const defaults = list.defaults;
  const tier = tierOf(
    draft,
    list.tiers.map((row) => row.entry),
  );
  const stock = draft.personality?.startStock ?? [];
  const items = list.items.map((item) => ({ value: item.id, label: item.name[locale] }));
  const setStock = (next: readonly { item: string; qty: number }[]): void =>
    onEdit(setPersonality(draft, "startStock", next));
  const firstItem = list.items.find((item) => !stock.some((row) => row.item === item.id))?.id;
  return (
    <FormSection
      name="start"
      title={title}
      desc={m.dev_nations_section_start_desc()}
      source="D-6041 · D-518"
      paths={[
        "personality.startCities",
        "personality.startNecessityHours",
        "personality.startStock",
        "cityNames",
      ]}
    >
      <p className="field-hint ne-future" role="note">
        {m.dev_nations_future_note()}
      </p>
      <div className="ne-grid">
        <SeedField
          draft={draft}
          field="startCities"
          label={m.dev_nations_field_start_cities()}
          desc={m.dev_nations_field_start_cities_desc({
            min: defaults.startCitiesMin,
            max: defaults.startCitiesMax,
          })}
          min={NATION_SEED_LIMITS.startCities.min}
          max={NATION_SEED_LIMITS.startCities.max}
          base={defaults.startCitiesMin}
          tierBase={tier?.startCities}
          onEdit={onEdit}
        />
        <SeedField
          draft={draft}
          field="startNecessityHours"
          label={m.dev_nations_field_necessity_hours()}
          desc={m.dev_nations_field_necessity_hours_desc()}
          min={NATION_SEED_LIMITS.necessityHours.min}
          max={NATION_SEED_LIMITS.necessityHours.max}
          base={defaults.necessityHours}
          unit="h"
          onEdit={onEdit}
        />
      </div>
      {names}
      <fieldset className="ne-rows" data-list="startStock">
        <legend className="field-label">{m.dev_nations_field_start_stock()}</legend>
        <p className="field-hint">{m.dev_nations_field_start_stock_hint()}</p>
        {stock.map((row, index) => (
          <div key={row.item} className="ne-row">
            <SelectField
              label={m.dev_nations_field_stock_item({ index: index + 1 })}
              hideLabel
              value={row.item}
              options={
                items.some((item) => item.value === row.item)
                  ? items
                  : [{ value: row.item, label: row.item }, ...items]
              }
              onChange={(item) => setStock(stock.map((old, i) => (i === index ? { ...old, item } : old)))}
              path={`personality.startStock[${index}].item`}
            />
            <NumberField
              label={m.dev_nations_field_stock_qty({ index: index + 1 })}
              hideLabel
              value={row.qty}
              min={NATION_SEED_LIMITS.stockQty.min}
              max={NATION_SEED_LIMITS.stockQty.max}
              onChange={(qty) => {
                if (qty !== undefined) setStock(stock.map((old, i) => (i === index ? { ...old, qty } : old)));
              }}
              path={`personality.startStock[${index}].qty`}
            />
            <RemoveButton
              name={items.find((item) => item.value === row.item)?.label ?? row.item}
              onClick={() => setStock(stock.filter((_, i) => i !== index))}
            />
          </div>
        ))}
        <button
          type="button"
          className="button-small ne-stock-add"
          aria-disabled={stock.length >= NATION_LIST_LIMITS.startStock || firstItem === undefined}
          onClick={() => {
            if (firstItem !== undefined && stock.length < NATION_LIST_LIMITS.startStock)
              setStock([...stock, { item: firstItem, qty: 1 }]);
          }}
        >
          {m.dev_nations_field_stock_add()}
        </button>
      </fieldset>
    </FormSection>
  );
}

export function NationPeopleSection({
  title,
  draft,
  list,
  names,
  onEdit,
}: SectionProps & { names: ReactNode }) {
  const defaults = list.defaults;
  const tiers = list.tiers.map((row) => row.entry);
  const tier = tierOf(draft, tiers);
  const counts = startCountsOf(draft, defaults, tiers);
  const limits = NATION_SEED_LIMITS;
  const tierFacility = (id: string): number | undefined =>
    tier?.facilities.find((row) => row.facility === id)?.count;
  return (
    <FormSection
      name="people"
      title={title}
      desc={m.dev_nations_section_people_desc()}
      source="749 다 · 49 worldSeed"
      paths={[
        "personality.startHousing",
        "personality.startPopulationPm",
        "personality.startFarms",
        "personality.startLumberCamps",
        "personality.startMines",
        "personality.startStorehouses",
        "personality.startGuards",
        "personality.startTech",
        "humanNames",
      ]}
    >
      <p className="field-hint ne-future" role="note">
        {m.dev_nations_future_note()}
      </p>
      <div className="ne-grid">
        <SeedField
          draft={draft}
          field="startHousing"
          label={m.dev_nations_field_housing()}
          desc={m.dev_nations_field_housing_desc()}
          min={limits.housing.min}
          max={limits.housing.max}
          base={defaults.housing}
          tierBase={tier?.startHousing}
          onEdit={onEdit}
        />
        <SeedField
          draft={draft}
          field="startPopulationPm"
          label={m.dev_nations_field_population_pm()}
          desc={m.dev_nations_field_population_pm_desc()}
          min={limits.populationPm.min}
          max={limits.populationPm.max}
          base={defaults.populationPm}
          tierBase={tier?.startPopulationPm}
          unit="‰"
          onEdit={onEdit}
        />
      </div>
      <p className="ne-computed" data-testid="ne-population">
        {m.dev_nations_population_result({
          housing: counts.housing,
          people: counts.population,
          cities: counts.cities,
          total: counts.totalPopulation,
        })}
      </p>
      <div className="ne-grid">
        <SeedField
          draft={draft}
          field="startFarms"
          label={m.dev_nations_field_farms()}
          min={limits.facility.min}
          max={limits.facility.max}
          base={defaults.farms}
          tierBase={tierFacility("farm")}
          onEdit={onEdit}
        />
        <SeedField
          draft={draft}
          field="startLumberCamps"
          label={m.dev_nations_field_lumber_camps()}
          min={limits.facility.min}
          max={limits.facility.max}
          base={defaults.lumberCamps}
          tierBase={tierFacility("lumber_camp")}
          onEdit={onEdit}
        />
        <SeedField
          draft={draft}
          field="startMines"
          label={m.dev_nations_field_mines()}
          min={limits.facility.min}
          max={limits.facility.max}
          base={defaults.mines}
          tierBase={tierFacility("mine")}
          onEdit={onEdit}
        />
        <SeedField
          draft={draft}
          field="startStorehouses"
          label={m.dev_nations_field_storehouses()}
          min={limits.facility.min}
          max={limits.facility.max}
          base={defaults.storehouses}
          tierBase={tierFacility("storehouse")}
          onEdit={onEdit}
        />
      </div>
      <p className="field-hint">{m.dev_nations_facilities_note()}</p>
      <div className="ne-grid">
        <SeedField
          draft={draft}
          field="startGuards"
          label={m.dev_nations_field_guards()}
          desc={m.dev_nations_field_guards_desc()}
          min={limits.guards.min}
          max={limits.guards.max}
          base={0}
          tierBase={tier?.guardsPerCity}
          onEdit={onEdit}
        />
        <SeedField
          draft={draft}
          field="startTech"
          label={m.dev_nations_field_tech()}
          desc={m.dev_nations_field_tech_desc()}
          min={limits.tech.min}
          max={limits.tech.max}
          base={1}
          tierBase={tier?.startTech}
          onEdit={onEdit}
        />
      </div>
      <p className="ne-computed" data-testid="ne-guards">
        {m.dev_nations_guards_result({
          guards: counts.guards,
          cities: counts.cities,
          total: counts.totalGuards,
        })}
      </p>
      <dl className="ne-fixed">
        <div>
          <dt>{m.dev_nations_fixed_hall()}</dt>
          <dd>{m.dev_nations_fixed_one_per_city()}</dd>
        </div>
        <div>
          <dt>{m.dev_nations_fixed_leader()}</dt>
          <dd>{m.dev_nations_fixed_one_per_nation()}</dd>
        </div>
        <div>
          <dt>{m.dev_nations_fixed_cyborgs()}</dt>
          <dd>{m.dev_nations_fixed_none()}</dd>
        </div>
      </dl>
      {names}
    </FormSection>
  );
}

export function NationTraitsSection({
  title,
  draft,
  list,
  locale,
  onEdit,
}: SectionProps & { locale: "ko" | "en" }) {
  const jobs = draft.personality?.cityJobs ?? [];
  const facilities = list.facilities
    .filter((facility) => list.recipes.some((recipe) => recipe.facility === facility.id))
    .map((facility) => ({ value: facility.id, label: facility.name[locale] }));
  const recipesOf = (facility: string) =>
    list.recipes
      .filter((recipe) => recipe.facility === facility)
      .map((recipe) => ({ value: recipe.id, label: recipe.name[locale] }));
  const setJobs = (next: readonly { facility: string; recipe: string }[]): void =>
    onEdit(setPersonality(draft, "cityJobs", next));
  const first = list.recipes[0];
  return (
    <FormSection
      name="traits"
      title={title}
      desc={m.dev_nations_section_traits_desc()}
      source="531 다 · 533 다"
      paths={["personality.cityJobs"]}
    >
      <fieldset className="ne-rows" data-list="cityJobs">
        <legend className="field-label">{m.dev_nations_field_city_jobs()}</legend>
        <p className="field-hint">{m.dev_nations_field_city_jobs_hint()}</p>
        {jobs.map((job, index) => {
          const recipes = recipesOf(job.facility);
          return (
            // oxlint-disable-next-line react/no-array-index-key -- 같은 시설·레시피 줄이 둘 있을 수 있어 차례로 둔다
            <div key={index} className="ne-row">
              <SelectField
                label={m.dev_nations_field_job_facility({ index: index + 1 })}
                hideLabel
                value={job.facility}
                options={
                  facilities.some((facility) => facility.value === job.facility)
                    ? facilities
                    : [{ value: job.facility, label: job.facility }, ...facilities]
                }
                onChange={(facility) =>
                  setJobs(
                    jobs.map((old, i) =>
                      i === index ? { facility, recipe: recipesOf(facility)[0]?.value ?? old.recipe } : old,
                    ),
                  )
                }
                path={`personality.cityJobs[${index}].facility`}
              />
              <SelectField
                label={m.dev_nations_field_job_recipe({ index: index + 1 })}
                hideLabel
                value={job.recipe}
                options={
                  recipes.some((recipe) => recipe.value === job.recipe)
                    ? recipes
                    : [{ value: job.recipe, label: job.recipe }, ...recipes]
                }
                onChange={(recipe) => setJobs(jobs.map((old, i) => (i === index ? { ...old, recipe } : old)))}
                path={`personality.cityJobs[${index}].recipe`}
              />
              <RemoveButton
                name={recipes.find((recipe) => recipe.value === job.recipe)?.label ?? job.recipe}
                onClick={() => setJobs(jobs.filter((_, i) => i !== index))}
              />
            </div>
          );
        })}
        <button
          type="button"
          className="button-small ne-job-add"
          aria-disabled={jobs.length >= NATION_LIST_LIMITS.cityJobs || first === undefined}
          onClick={() => {
            if (first !== undefined && jobs.length < NATION_LIST_LIMITS.cityJobs)
              setJobs([...jobs, { facility: first.facility, recipe: first.id }]);
          }}
        >
          {m.dev_nations_field_job_add()}
        </button>
      </fieldset>
    </FormSection>
  );
}
