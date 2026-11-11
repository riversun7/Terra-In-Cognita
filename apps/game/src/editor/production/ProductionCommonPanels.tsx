// 생산 편집기 공용 탭 — 스탯 매핑(여섯 시설의 주·보조 스탯을 한 표에서, 스탯마다 주 하나·보조 하나인지 알림), 개요(여섯 가지 한 표: 스탯·사다리·
// 표본 스탯의 시간당 기대 산출), 가공 시설(레시피 읽기만). 사용자 표(2026-11-11): 광산 STR/VIT · 벌목장 DEX/STR · 약초원 INT/WIS ·
// 농장 VIT/INT · 목장 WIS/AGI · 낚시터 AGI/DEX(옛 gather_type_config = 기획 43 §4).
import {
  type BuildingEditorFacility,
  type BuildingEditorGatherRules,
  type BuildingEditorItem,
  FACILITY_STAT_IDS,
  type FacilityJson,
} from "@terra/shared/buildingEditor";
import type { GatherBand } from "@terra/shared/gatherMath";
import { PRIMARY_STATS } from "@terra/shared/roster";
import { statCoverage } from "@terra/shared/unitGuide";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { SelectField } from "../content/contentEditorFields.tsx";
import { Badge } from "../content/contentEditorLayout.tsx";
import { type ProductionTypeRow, ladderOf, sampleStats, typePreview, withGather } from "./productionModel.ts";
import { GROUP_TEXT, MODE_TEXT, STAT_CODE, decimal, percentOfPm, statOption } from "./productionText.ts";

const STAT_OPTIONS = PRIMARY_STATS.filter((stat) =>
  (FACILITY_STAT_IDS as readonly string[]).includes(stat),
).map((stat) => ({ value: stat, label: statOption(stat) }));

/** 스탯 매핑: 시설마다 주·보조 스탯 고르기 + 스탯마다 쓰임(주 하나·보조 하나가 아니면 알린다 — 막지 않는다) */
export function ProductionMappingPanel({
  rows,
  locale,
  onEdit,
  onOpen,
}: {
  rows: readonly ProductionTypeRow[];
  locale: "ko" | "en";
  onEdit: (row: ProductionTypeRow, entry: FacilityJson) => void;
  onOpen: (facility: string) => void;
}) {
  const coverage = statCoverage(rows.map((row) => row.type));
  const nameOf = (facility: string): string =>
    rows.find((row) => row.type.facility === facility)?.draft.name[locale] ?? facility;
  const names = (list: readonly string[]): string =>
    list.length === 0 ? m.dev_prod_cover_none() : list.map(nameOf).join(" · ");
  return (
    <div className="pd-mapping" data-balanced={coverage.balanced ? "" : undefined}>
      <section className="ce-panel pd-section" aria-labelledby="pd-mapping-title">
        <h2 id="pd-mapping-title" className="ce-panel-title">
          {m.dev_prod_mapping_title()}
        </h2>
        <p className="field-hint">{m.dev_prod_mapping_lead()}</p>
        {coverage.balanced ? (
          <p className="pd-ok" role="status" data-cover="ok">
            {m.dev_prod_cover_ok()}
          </p>
        ) : (
          <p className="pd-warn" role="status" data-cover="warn">
            {m.dev_prod_cover_warn()}
          </p>
        )}
        <div className="dev-table-wrap">
          <table className="dev-table pd-map-table">
            <thead>
              <tr>
                <th scope="col">{m.dev_prod_col_type()}</th>
                <th scope="col">{m.dev_prod_col_group()}</th>
                <th scope="col">{m.dev_buildings_field_primary()}</th>
                <th scope="col">{m.dev_buildings_field_secondary()}</th>
                <th scope="col">{m.dev_buildings_field_mode()}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.type.facility}
                  data-facility={row.type.facility}
                  data-staged={row.staged ? "" : undefined}
                >
                  <th scope="row">
                    <button type="button" className="pd-linkish" onClick={() => onOpen(row.type.facility)}>
                      {row.draft.name[locale]}
                    </button>
                  </th>
                  <td>{GROUP_TEXT[row.type.group]()}</td>
                  <td>
                    <SelectField
                      label={m.dev_prod_map_primary_of({ name: row.draft.name[locale] })}
                      className="pd-map-primary"
                      hideLabel
                      value={row.gather.primary}
                      options={STAT_OPTIONS}
                      onChange={(value) => onEdit(row, withGather(row.draft, { primary: value }))}
                    />
                  </td>
                  <td>
                    <SelectField
                      label={m.dev_prod_map_secondary_of({ name: row.draft.name[locale] })}
                      className="pd-map-secondary"
                      hideLabel
                      value={row.gather.secondary}
                      options={STAT_OPTIONS}
                      onChange={(value) => onEdit(row, withGather(row.draft, { secondary: value }))}
                    />
                  </td>
                  <td>
                    {MODE_TEXT[row.type.mode]()}
                    {row.gather.catch ? ` · ${m.dev_prod_mode_catch()}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="ce-panel pd-section" aria-labelledby="pd-cover-title">
        <h2 id="pd-cover-title" className="ce-panel-title">
          {m.dev_prod_cover_title()}
        </h2>
        <div className="dev-table-wrap">
          <table className="dev-table pd-cover-table">
            <thead>
              <tr>
                <th scope="col">{m.dev_prod_col_stat()}</th>
                <th scope="col">{m.dev_prod_cover_primary()}</th>
                <th scope="col">{m.dev_prod_cover_secondary()}</th>
                <th scope="col">{m.dev_prod_cover_state()}</th>
              </tr>
            </thead>
            <tbody>
              {coverage.rows.map((cover) => {
                const ok = cover.primaryOf.length === 1 && cover.secondaryOf.length === 1;
                return (
                  <tr key={cover.stat} data-stat={cover.stat} data-ok={ok ? "" : undefined}>
                    <th scope="row" className="pd-stat" data-stat={cover.stat}>
                      {statOption(cover.stat)}
                    </th>
                    <td data-count={cover.primaryOf.length}>{names(cover.primaryOf)}</td>
                    <td data-count={cover.secondaryOf.length}>{names(cover.secondaryOf)}</td>
                    <td>
                      {ok ? (
                        <Badge tone="created">{m.dev_prod_cover_state_ok()}</Badge>
                      ) : (
                        <Badge tone="changed">
                          {m.dev_prod_cover_state_bad({
                            primary: cover.primaryOf.length,
                            secondary: cover.secondaryOf.length,
                          })}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {coverage.sameStat.length > 0 ? (
          <p className="pd-warn" role="status">
            {m.dev_prod_cover_same({ names: coverage.sameStat.map(nameOf).join(" · ") })}
          </p>
        ) : null}
      </section>
    </div>
  );
}

/** 개요: 여섯 가지 한 표(스탯·방식·사다리·수확량·성공 확률) + 표본 스탯(주 = 보조)에서 가장 자주 나오는 티어와 시간당 기대 산출 */
export function ProductionOverviewPanel({
  rows,
  items,
  bands,
  rules,
  levelBonus,
  locale,
  onOpen,
}: {
  rows: readonly ProductionTypeRow[];
  items: readonly BuildingEditorItem[];
  bands: readonly GatherBand[];
  rules: BuildingEditorGatherRules;
  levelBonus: number;
  locale: "ko" | "en";
  onOpen: (facility: string) => void;
}) {
  const samples = sampleStats(rules.defaultStat);
  return (
    <section className="ce-panel pd-section pd-overview" aria-labelledby="pd-overview-title">
      <h2 id="pd-overview-title" className="ce-panel-title">
        {m.dev_prod_overview_title()}
      </h2>
      <p className="field-hint">{m.dev_prod_overview_lead({ stat: rules.defaultStat })}</p>
      <div className="dev-table-wrap">
        <table className="dev-table pd-overview-table">
          <thead>
            <tr>
              <th scope="col">{m.dev_prod_col_type()}</th>
              <th scope="col">{m.dev_prod_col_stats()}</th>
              <th scope="col">{m.dev_buildings_field_mode()}</th>
              <th scope="col">{m.dev_prod_col_ladder()}</th>
              <th scope="col">{m.dev_prod_col_yield()}</th>
              {samples.map((stat) => (
                <th scope="col" key={stat} className="pd-sample-head">
                  {m.dev_prod_col_sample({ stat })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const ladder = ladderOf(items, row.gather.subcategory);
              const counts = ladder.map((tier) => tier.length);
              const total = counts.reduce((sum, count) => sum + count, 0);
              const tiers = counts.flatMap((count, tier) => (count > 0 ? [tier] : []));
              return (
                <tr key={row.type.facility} data-facility={row.type.facility}>
                  <th scope="row">
                    <button type="button" className="pd-linkish" onClick={() => onOpen(row.type.facility)}>
                      {row.draft.name[locale]}
                    </button>
                    <span className="pd-muted pd-block">{GROUP_TEXT[row.type.group]()}</span>
                  </th>
                  <td>
                    <code className="dev-code" translate="no">
                      {STAT_CODE[row.gather.primary]()} / {STAT_CODE[row.gather.secondary]()}
                    </code>
                  </td>
                  <td>
                    {MODE_TEXT[row.type.mode]()}
                    {row.gather.catch ? (
                      <span className="pd-muted pd-block">
                        {m.dev_prod_overview_catch({
                          base: percentOfPm(row.gather.catch.basePm, locale),
                          max: percentOfPm(row.gather.catch.maxPm, locale),
                        })}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {total === 0
                      ? m.dev_prod_ladder_empty()
                      : m.dev_prod_overview_ladder({
                          count: total,
                          from: tiers[0] ?? 0,
                          to: tiers.at(-1) ?? 0,
                        })}
                  </td>
                  <td>
                    {m.dev_prod_overview_yield({
                      base: row.gather.yieldBase ?? 1,
                      rate: row.gather.yieldPerStatPm ?? rules.yieldPerStatPm,
                      cap: row.gather.yieldCap === undefined ? "∞" : String(row.gather.yieldCap),
                    })}
                  </td>
                  {samples.map((stat) => {
                    const preview = typePreview({
                      gather: row.gather,
                      primary: stat,
                      secondary: stat,
                      level: 1,
                      bands,
                      ladderCounts: counts,
                      rules,
                      levelBonus,
                    });
                    return (
                      <td
                        key={stat}
                        className="pd-sample"
                        data-stat={stat}
                        data-per-hour={Math.round(preview.perHour * 1000)}
                      >
                        <strong className="pd-num">{decimal(preview.perHour, locale)}</strong>
                        <span className="pd-muted pd-block">
                          {preview.topTier === null
                            ? m.dev_prod_result_nothing()
                            : m.dev_prod_result_top({ tier: preview.topTier })}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="field-hint">{m.dev_prod_overview_note()}</p>
    </section>
  );
}

/** 가공 시설 한 탭: 그 시설의 레시피(읽기만 — 레시피 편집은 아직 없다) */
export function ProductionProcessPanel({
  row,
  items,
  locale,
}: {
  row: BuildingEditorFacility;
  items: readonly BuildingEditorItem[];
  locale: "ko" | "en";
}) {
  const itemName = (id: string): string => items.find((item) => item.id === id)?.name[locale] ?? id;
  const stacks = (list: readonly { readonly item: string; readonly qty: number }[]): string =>
    list.length === 0 ? "—" : list.map((stack) => `${itemName(stack.item)} ×${stack.qty}`).join(" + ");
  return (
    <div className="pd-process" data-facility={row.entry.id}>
      <div className="pd-head">
        <h2 className="pd-head-title" id="pd-process-title">
          {row.entry.name[locale]}
        </h2>
        <code className="dev-code" translate="no">
          {row.entry.id}
        </code>
        <Badge tone="off">{m.dev_prod_group_process()}</Badge>
        <span className="ce-inline-actions pd-head-actions">
          <AppLink
            to={{ route: "dev_buildings", search: { facility: row.entry.id } }}
            className="button-small"
          >
            {m.dev_prod_open_building()}
          </AppLink>
        </span>
      </div>
      <section className="ce-panel pd-section" aria-labelledby="pd-recipes-title">
        <h3 id="pd-recipes-title" className="ce-panel-title">
          {m.dev_prod_recipes_title({ count: row.recipes.length })}
        </h3>
        {row.recipes.length === 0 ? (
          <p className="field-hint">{m.dev_prod_recipes_empty()}</p>
        ) : (
          <div className="dev-table-wrap">
            <table className="dev-table pd-recipes">
              <thead>
                <tr>
                  <th scope="col">{m.dev_prod_col_recipe()}</th>
                  <th scope="col">{m.dev_prod_col_inputs()}</th>
                  <th scope="col">{m.dev_prod_col_outputs()}</th>
                  <th scope="col">{m.dev_prod_col_work()}</th>
                </tr>
              </thead>
              <tbody>
                {row.recipes.map((recipe) => (
                  <tr key={recipe.id} data-recipe={recipe.id} data-off={recipe.enabled ? undefined : ""}>
                    <th scope="row">
                      {recipe.name[locale]}
                      {recipe.enabled ? null : <Badge tone="off">{m.dev_prod_recipe_off()}</Badge>}
                    </th>
                    <td>{stacks(recipe.inputs)}</td>
                    <td>{stacks(recipe.outputs)}</td>
                    <td>{recipe.work}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="field-hint">{m.dev_prod_recipes_note({ slots: row.entry.slotsPerLevel })}</p>
      </section>
    </div>
  );
}
