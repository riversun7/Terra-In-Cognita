// 생산 종류 한 탭(벌목장·광산·약초원·농장·목장·낚시터) — 스탯 짝(주·보조), 방식·수확량·성공 확률, 시설 값(자리·창고), 사다리(티어마다 아이템),
// 미리 보기("스탯 X/Y인 유닛 → 유효 스탯 → 구간 → 티어 확률·시간당 기대 산출"). 고친 칸은 바로 담긴다(부모가 묶음으로 적용).
// 미리 보기 셈은 판정과 같은 식이다(productionModel.ts typePreview → @terra/shared/gatherMath). 기대값은 표시용.
import {
  type BuildingEditorGatherRules,
  type BuildingEditorItem,
  type BuildingEditorSubcategory,
  FACILITY_LEVEL_MAX,
  FACILITY_LIMITS,
  FACILITY_STAT_IDS,
  type FacilityCatchJson,
  type FacilityGatherJson,
  type FacilityJson,
} from "@terra/shared/buildingEditor";
import { FACILITY_RUNTIME_LIMITS } from "@terra/shared/facilityRuntime";
import { type GatherBand, gatherSubcategories } from "@terra/shared/gatherMath";
import { PRIMARY_STATS, type PrimaryStat } from "@terra/shared/roster";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { CheckField, NumberField, SelectField } from "../content/contentEditorFields.tsx";
import { Badge } from "../content/contentEditorLayout.tsx";
import { type ProductionTypeRow, ladderOf, typePreview, withGather } from "./productionModel.ts";
import { GROUP_TEXT, MODE_TEXT, STAT_CODE, decimal, percentOfPm, statOption } from "./productionText.ts";

/** 옛 낚시 값(fishing_config 0.30·0.80·0.50, 합 200) — 성공 확률을 켤 때의 출발값 */
const OLD_CATCH: FacilityCatchJson = { basePm: 300, maxPm: 800, statPm: 500, fullStat: 200 };
/** 미리 보기 스탯 칸 범위(확률표 마지막 구간 220 위까지) */
const PREVIEW_STAT_MAX = 300;

const STAT_OPTIONS = PRIMARY_STATS.filter((stat) =>
  (FACILITY_STAT_IDS as readonly string[]).includes(stat),
).map((stat) => ({ value: stat, label: statOption(stat) }));

const code = (stat: PrimaryStat): string => STAT_CODE[stat]();

function bandText(bands: readonly GatherBand[], index: number): string {
  const band = bands[index];
  if (!band) return "—";
  const next = bands[index + 1];
  return next
    ? m.dev_gather_stat_range({ from: band.from, to: next.from - 1 })
    : m.dev_gather_stat_from({ from: band.from });
}

export function ProductionTypePanel({
  row,
  items,
  subcategories,
  bands,
  rules,
  levelBonus,
  locale,
  unbalanced,
  onEdit,
  onRevert,
  onUnstage,
}: {
  row: ProductionTypeRow;
  items: readonly BuildingEditorItem[];
  /** 중분류 이름(사다리 중분류 줄) */
  subcategories: readonly BuildingEditorSubcategory[];
  /** 화면에 보일 확률표(담은 변경을 얹은 것) */
  bands: readonly GatherBand[];
  rules: BuildingEditorGatherRules;
  levelBonus: number;
  locale: "ko" | "en";
  /** 스탯 짝이 고르지 않을 때 이 시설에 붙일 알림(없으면 null) */
  unbalanced: string | null;
  onEdit: (entry: FacilityJson) => void;
  onRevert: () => void;
  onUnstage: () => void;
}) {
  const { draft, gather, type } = row;
  const [primary, setPrimary] = useState(rules.defaultStat);
  const [secondary, setSecondary] = useState(rules.defaultStat);
  const [level, setLevel] = useState(1);
  const ladder = ladderOf(items, gather);
  // 사다리에 드는 중분류(주 + 함께 내는 것, 질문 946 나) — 이름이 없으면 ID
  const ladderSubs = gatherSubcategories(gather)
    .map((id) => subcategories.find((sub) => sub.id === id)?.name[locale] ?? id)
    .join(" + ");
  const itemCount = ladder.reduce((sum, tier) => sum + tier.length, 0);
  const preview = typePreview({
    gather,
    primary,
    secondary,
    level,
    bands,
    ladderCounts: ladder.map((tier) => tier.length),
    rules,
    levelBonus,
  });
  const patch = (next: Partial<FacilityGatherJson>): void => onEdit(withGather(draft, next));
  const setCatch = (next: Partial<FacilityCatchJson>): void =>
    patch({ catch: { ...(gather.catch ?? OLD_CATCH), ...next } });
  const maxLevel = draft.maxLevel ?? FACILITY_LEVEL_MAX;
  const select = type.mode === "select";
  const need = (tier: number): number =>
    Math.max(rules.tierProgressBase, rules.tierProgressBase + tier * rules.tierProgressStep);
  return (
    <div
      className="pd-type"
      data-facility={draft.id}
      data-mode={type.mode}
      data-staged={row.staged ? "" : undefined}
    >
      <div className="pd-head">
        <h2 className="pd-head-title" id="pd-type-title">
          {draft.name[locale]}
        </h2>
        <code className="dev-code" translate="no">
          {draft.id}
        </code>
        <Badge tone="created">{GROUP_TEXT[type.group]()}</Badge>
        <Badge tone="off">{MODE_TEXT[type.mode]()}</Badge>
        {row.row.origin === "edited" ? <Badge tone="changed">{m.dev_prod_origin_edited()}</Badge> : null}
        <span className="ce-inline-actions pd-head-actions">
          <AppLink to={{ route: "dev_buildings", search: { facility: draft.id } }} className="button-small">
            {m.dev_prod_open_building()}
          </AppLink>
          {row.staged ? (
            <button type="button" className="button-small pd-unstage" onClick={onUnstage}>
              {m.dev_prod_unstage()}
            </button>
          ) : null}
          {row.row.origin === "edited" ? (
            <button type="button" className="button-small pd-revert" onClick={onRevert}>
              {m.dev_prod_revert()}
            </button>
          ) : null}
        </span>
      </div>

      <section className="ce-panel pd-section" aria-labelledby="pd-stats-title" data-section="stats">
        <h3 id="pd-stats-title" className="ce-panel-title">
          {m.dev_prod_section_stats()}
        </h3>
        <div className="pd-fields">
          <SelectField
            label={m.dev_buildings_field_primary()}
            className="pd-primary"
            value={gather.primary}
            options={STAT_OPTIONS}
            onChange={(value) => patch({ primary: value })}
            hint={m.dev_prod_primary_hint()}
          />
          <SelectField
            label={m.dev_buildings_field_secondary()}
            className="pd-secondary"
            value={gather.secondary}
            options={STAT_OPTIONS}
            onChange={(value) => patch({ secondary: value })}
            hint={m.dev_prod_secondary_hint()}
          />
          <SelectField
            label={m.dev_buildings_field_mode()}
            className="pd-mode"
            value={type.mode}
            options={[
              { value: "roll", label: MODE_TEXT.roll() },
              { value: "select", label: MODE_TEXT.select() },
            ]}
            onChange={(value) => patch({ mode: value === "roll" ? undefined : value })}
            hint={select ? m.dev_prod_mode_select_hint() : m.dev_prod_mode_roll_hint()}
          />
        </div>
        {gather.primary === gather.secondary ? (
          <p className="pd-warn" role="status" data-warn="same">
            {m.dev_prod_warn_same_stat()}
          </p>
        ) : null}
        {unbalanced === null ? null : (
          <p className="pd-warn" role="status" data-warn="coverage">
            {unbalanced}
          </p>
        )}
      </section>

      <section className="ce-panel pd-section" aria-labelledby="pd-yield-title" data-section="yield">
        <h3 id="pd-yield-title" className="ce-panel-title">
          {m.dev_prod_section_yield()}
        </h3>
        <p className="field-hint">
          {m.dev_prod_yield_formula({
            secondary: code(gather.secondary),
            divisor: rules.progressDivisor,
            primary: code(gather.primary),
          })}
        </p>
        <div className="pd-fields">
          <NumberField
            label={m.dev_buildings_field_yield_base()}
            className="pd-yield-base"
            value={gather.yieldBase}
            min={FACILITY_LIMITS.yieldBase.min}
            max={FACILITY_LIMITS.yieldBase.max}
            soft={[0, 10]}
            optional
            onChange={(value) => patch({ yieldBase: value })}
          />
          <NumberField
            label={m.dev_buildings_field_yield_rate()}
            className="pd-yield-rate"
            value={gather.yieldPerStatPm}
            min={FACILITY_LIMITS.yieldPerStatPm.min}
            max={FACILITY_LIMITS.yieldPerStatPm.max}
            soft={[0, 300]}
            unit="‰"
            optional
            onChange={(value) => patch({ yieldPerStatPm: value })}
          />
          <NumberField
            label={m.dev_buildings_field_yield_cap()}
            className="pd-yield-cap"
            value={gather.yieldCap}
            min={FACILITY_LIMITS.yieldCap.min}
            max={FACILITY_LIMITS.yieldCap.max}
            soft={[1, 20]}
            optional
            onChange={(value) => patch({ yieldCap: value })}
          />
        </div>
        <div className="pd-catch-on">
          <CheckField
            label={m.dev_prod_catch_on()}
            checked={gather.catch !== undefined}
            onChange={(on) => patch({ catch: on ? OLD_CATCH : undefined })}
            hint={m.dev_prod_catch_hint()}
          />
        </div>
        {gather.catch ? (
          <div className="pd-fields" data-part="catch">
            <NumberField
              label={m.dev_prod_catch_base()}
              className="pd-catch-base"
              value={gather.catch.basePm}
              min={FACILITY_LIMITS.catchPm.min}
              max={FACILITY_LIMITS.catchPm.max}
              unit="‰"
              onChange={(value) => setCatch({ basePm: value ?? 0 })}
            />
            <NumberField
              label={m.dev_prod_catch_max()}
              className="pd-catch-max"
              value={gather.catch.maxPm}
              min={FACILITY_LIMITS.catchPm.min}
              max={FACILITY_LIMITS.catchPm.max}
              unit="‰"
              onChange={(value) => setCatch({ maxPm: value ?? 0 })}
            />
            <NumberField
              label={m.dev_prod_catch_stat()}
              className="pd-catch-stat"
              value={gather.catch.statPm}
              min={FACILITY_LIMITS.catchPm.min}
              max={FACILITY_LIMITS.catchPm.max}
              unit="‰"
              onChange={(value) => setCatch({ statPm: value ?? 0 })}
            />
            <NumberField
              label={m.dev_prod_catch_full()}
              className="pd-catch-full"
              value={gather.catch.fullStat}
              min={FACILITY_LIMITS.catchFullStat.min}
              max={FACILITY_LIMITS.catchFullStat.max}
              soft={[1, 400]}
              onChange={(value) => setCatch({ fullStat: value ?? 1 })}
            />
          </div>
        ) : null}
      </section>

      <section className="ce-panel pd-section" aria-labelledby="pd-site-title" data-section="site">
        <h3 id="pd-site-title" className="ce-panel-title">
          {m.dev_prod_section_site()}
        </h3>
        <div className="pd-fields">
          <NumberField
            label={m.dev_prod_field_slots()}
            className="pd-slots"
            value={draft.slotsPerLevel}
            min={FACILITY_LIMITS.slotsPerLevel.min}
            max={FACILITY_LIMITS.slotsPerLevel.max}
            soft={[0, 50]}
            onChange={(value) => onEdit({ ...draft, slotsPerLevel: value ?? 0 })}
          />
          <NumberField
            label={m.dev_prod_field_storage()}
            className="pd-storage"
            value={draft.storageKg}
            min={FACILITY_RUNTIME_LIMITS.storageKg.min}
            max={FACILITY_RUNTIME_LIMITS.storageKg.max}
            soft={[1, 2000]}
            unit="kg"
            optional
            onChange={(value) => {
              const { storageKg: _old, ...rest } = draft;
              onEdit(value === undefined ? rest : { ...rest, storageKg: value });
            }}
          />
        </div>
        <p className="field-hint">{m.dev_prod_site_note()}</p>
      </section>

      <section className="ce-panel pd-section" aria-labelledby="pd-ladder-title" data-section="ladder">
        <h3 id="pd-ladder-title" className="ce-panel-title">
          {m.dev_prod_section_ladder({ count: itemCount })}
        </h3>
        <p className="field-hint" data-part="ladder-subs">
          {m.dev_prod_ladder_subs({ subs: ladderSubs })}
        </p>
        <div className="dev-table-wrap">
          <table className="dev-table pd-ladder">
            <thead>
              <tr>
                <th scope="col">{m.dev_prod_col_tier()}</th>
                <th scope="col">{m.dev_prod_col_items()}</th>
                <th scope="col">{m.dev_prod_col_need()}</th>
                <th scope="col">{m.dev_prod_col_chance()}</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((tierItems, tier) => (
                // oxlint-disable-next-line react/no-array-index-key -- 줄 = 티어 번호(차례가 바뀌지 않는다)
                <tr key={tier} data-tier={tier} data-empty={tierItems.length === 0 ? "" : undefined}>
                  <th scope="row" className="pd-tier">
                    T{tier}
                  </th>
                  <td className="pd-ladder-items">
                    {tierItems.length === 0
                      ? m.dev_prod_ladder_empty()
                      : tierItems.map((item) => item.name[locale]).join(" · ")}
                  </td>
                  <td>{m.dev_prod_need_value({ progress: need(tier) })}</td>
                  <td data-pm={preview.tierPm[tier] ?? 0}>
                    {(preview.tierPm[tier] ?? 0) === 0 ? "—" : percentOfPm(preview.tierPm[tier] ?? 0, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="field-hint">
          <AppLink to={{ route: "dev_items" }} className="pd-link">
            {m.dev_prod_open_items()}
          </AppLink>{" "}
          {m.dev_prod_ladder_note()}
        </p>
      </section>

      <section
        className="ce-panel pd-section pd-preview"
        aria-labelledby="pd-preview-title"
        data-section="preview"
      >
        <h3 id="pd-preview-title" className="ce-panel-title">
          {m.dev_prod_section_preview()}
        </h3>
        <div className="pd-fields">
          <NumberField
            label={m.dev_prod_preview_primary({ stat: code(gather.primary) })}
            className="pd-preview-primary"
            value={primary}
            min={0}
            max={PREVIEW_STAT_MAX}
            onChange={(value) => setPrimary(value ?? 0)}
          />
          <NumberField
            label={m.dev_prod_preview_secondary({ stat: code(gather.secondary) })}
            className="pd-preview-secondary"
            value={secondary}
            min={0}
            max={PREVIEW_STAT_MAX}
            onChange={(value) => setSecondary(value ?? 0)}
          />
          <NumberField
            label={m.dev_prod_preview_level()}
            className="pd-preview-level"
            value={level}
            min={1}
            max={maxLevel}
            onChange={(value) => setLevel(value ?? 1)}
          />
        </div>
        <dl
          className="pd-result"
          data-stat={preview.stat}
          data-band={preview.bandIndex}
          data-select-tier={preview.selectTier ?? undefined}
          data-top-tier={preview.topTier ?? undefined}
          data-catch={preview.catchPm ?? undefined}
          data-per-hour={Math.round(preview.perHour * 1000)}
        >
          <div className="pd-result-row">
            <dt>{m.dev_prod_result_stat()}</dt>
            <dd>
              <strong className="pd-num">{preview.stat}</strong>{" "}
              <span className="pd-muted">
                {m.dev_prod_result_stat_formula({
                  primary: `${code(gather.primary)} ${primary}`,
                  secondary: `${code(gather.secondary)} ${secondary}`,
                  bonus: levelBonus * (level - 1),
                })}
              </span>
            </dd>
          </div>
          <div className="pd-result-row">
            <dt>{select ? m.dev_prod_result_unlock() : m.dev_prod_result_band()}</dt>
            <dd>
              {select ? (
                <strong className="pd-num">T{preview.selectTier ?? 0}</strong>
              ) : (
                <strong className="pd-num">{bandText(bands, preview.bandIndex)}</strong>
              )}
            </dd>
          </div>
          {preview.catchPm === null ? null : (
            <div className="pd-result-row">
              <dt>{m.dev_prod_result_catch()}</dt>
              <dd>
                <strong className="pd-num">{percentOfPm(preview.catchPm, locale)}</strong>
              </dd>
            </div>
          )}
          <div className="pd-result-row">
            <dt>{m.dev_prod_result_speed()}</dt>
            <dd>
              <strong className="pd-num">×{preview.progress}</strong>{" "}
              <span className="pd-muted">{m.dev_prod_result_yield({ count: preview.yieldPerLot })}</span>
            </dd>
          </div>
          <div className="pd-result-row">
            <dt>{m.dev_prod_result_time()}</dt>
            <dd>
              <strong className="pd-num">
                {m.dev_prod_minutes({ value: decimal(preview.minutesPerLot, locale) })}
              </strong>
            </dd>
          </div>
          <div className="pd-result-row pd-result-main">
            <dt>{m.dev_prod_result_per_hour()}</dt>
            <dd>
              <strong className="pd-num pd-per-hour">{decimal(preview.perHour, locale)}</strong>{" "}
              <span className="pd-muted">
                {preview.topTier === null
                  ? m.dev_prod_result_nothing()
                  : m.dev_prod_result_top({ tier: preview.topTier })}
              </span>
            </dd>
          </div>
        </dl>
        <div className="pd-chances" role="img" aria-label={m.dev_prod_chances_label()}>
          {preview.tierPm.map((pm, tier) =>
            pm === 0 ? null : (
              // oxlint-disable-next-line react/no-array-index-key -- 칸 = 티어 번호
              <span key={tier} className="pd-chance" data-tier={tier} style={{ flexGrow: pm }}>
                T{tier} {percentOfPm(pm, locale)}
              </span>
            ),
          )}
          {preview.emptyPm === 0 ? null : (
            <span className="pd-chance pd-chance-empty" style={{ flexGrow: preview.emptyPm }}>
              {m.dev_prod_chance_empty({ share: percentOfPm(preview.emptyPm, locale) })}
            </span>
          )}
        </div>
        <p className="field-hint">{m.dev_prod_preview_note()}</p>
      </section>
    </div>
  );
}
