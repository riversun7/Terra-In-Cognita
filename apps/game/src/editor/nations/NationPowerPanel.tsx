// 국력 등급 판 — 사용자 답(2026-11-11): "현재 테스트 맵에 실제 강대국 분포처럼 알아서 배치해달라".
// docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)".
// - 위: 국가마다 시작 합계(도시·처음 인구·경비대)의 막대(강한 등급 먼저) — 힘 분포가 한눈에 보인다. 담은 값이 바로 든다.
// - 아래: 등급 표(등급 다섯 줄 — 시작 도시 수·주거·처음 인구·경비대·기술·국고·도시 간격·국가 간격·시설 수). 고치면 담기고 막대의 [적용]이
//   국가 변경과 한 묶음으로 보낸다. 등급은 만들거나 지우지 않는다.
// 막대는 값 ÷ 가장 큰 값의 폭이다(색은 토큰, 수는 글로도 적는다 — 색만으로 알리지 않는다).
import type { NationEditorListResponse, NationPresetJson, NationTierRow } from "@terra/shared/nationEditor";
import { NATION_TIER_LIMITS, type NationTierJson, tierRank } from "@terra/shared/nationTier";
import { m } from "../../paraglide/messages.js";
import { NationEmblem } from "../../ui/NationEmblem.tsx";
import { NumberField, RemoveButton, SelectField } from "../content/contentEditorFields.tsx";
import { Badge } from "../content/contentEditorLayout.tsx";
import { colorOf, emblemOf, startCountsOf } from "./nationModel.ts";

export interface PowerRow {
  readonly id: string;
  readonly name: string;
  readonly entry: NationPresetJson;
  readonly uploaded: string | null;
  readonly tier: NationTierJson | undefined;
  readonly cities: number;
  readonly population: number;
  readonly guards: number;
  /** 이 서버에서 서는 차례(없으면 null) */
  readonly slot: number | null;
}

/** 요약 줄(강한 등급 먼저 → 처음 인구 많은 차례 → 목록 차례) */
export function powerRowsOf(
  nations: readonly { entry: NationPresetJson; uploaded: string | null; slot: number | null }[],
  list: Pick<NationEditorListResponse, "defaults">,
  tiers: readonly NationTierJson[],
  locale: "ko" | "en",
): PowerRow[] {
  return nations
    .map((row, index) => {
      const counts = startCountsOf(row.entry, list.defaults, tiers);
      const tier = tiers.find((item) => item.id === row.entry.powerTier);
      return {
        index,
        row: {
          id: row.entry.id,
          name: row.entry.name[locale],
          entry: row.entry,
          uploaded: row.uploaded,
          tier,
          cities: counts.cities,
          population: counts.totalPopulation,
          guards: counts.totalGuards,
          slot: row.slot,
        },
      };
    })
    .toSorted(
      (a, b) =>
        tierRank(a.row.tier?.id) - tierRank(b.row.tier?.id) ||
        b.row.population - a.row.population ||
        a.index - b.index,
    )
    .map((item) => item.row);
}

function Bar({ value, max, kind }: { value: number; max: number; kind: "cities" | "people" | "guards" }) {
  const width = max <= 0 ? 0 : Math.round((value / max) * 100);
  return (
    <span className="ne-power-bar" data-kind={kind}>
      <span className="ne-power-fill" style={{ inlineSize: `${String(width)}%` }} aria-hidden="true" />
      <span className="ne-power-value">{value}</span>
    </span>
  );
}

export function NationPowerChart({
  rows,
  locale,
  onSelect,
}: {
  rows: readonly PowerRow[];
  locale: "ko" | "en";
  onSelect: (id: string) => void;
}) {
  const max = {
    cities: Math.max(1, ...rows.map((row) => row.cities)),
    people: Math.max(1, ...rows.map((row) => row.population)),
    guards: Math.max(1, ...rows.map((row) => row.guards)),
  };
  const total = rows.reduce(
    (sum, row) => ({
      cities: sum.cities + row.cities,
      people: sum.people + row.population,
      guards: sum.guards + row.guards,
    }),
    { cities: 0, people: 0, guards: 0 },
  );
  return (
    <div className="ne-power-chart" data-testid="ne-power-chart">
      <table className="dev-table ne-power-table">
        <caption className="ne-power-caption">
          {m.dev_nations_power_caption({
            nations: rows.length,
            cities: total.cities,
            people: total.people,
            guards: total.guards,
          })}
        </caption>
        <thead>
          <tr>
            <th scope="col">{m.dev_nations_power_col_nation()}</th>
            <th scope="col">{m.dev_nations_power_col_tier()}</th>
            <th scope="col">{m.dev_nations_power_col_cities()}</th>
            <th scope="col">{m.dev_nations_power_col_people()}</th>
            <th scope="col">{m.dev_nations_power_col_guards()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-nation={row.id} data-tier={row.tier?.id ?? "none"}>
              <th scope="row">
                <button type="button" className="ne-power-name" onClick={() => onSelect(row.id)}>
                  <NationEmblem
                    spec={emblemOf(row.entry)}
                    color={colorOf(row.entry)}
                    uploaded={row.uploaded}
                    size={16}
                  />
                  <span className="ne-chip" style={{ background: colorOf(row.entry) }} aria-hidden="true" />
                  <span>{row.name}</span>
                  {row.slot === null ? null : (
                    <Badge tone="plain">{m.dev_nations_slot({ slot: row.slot })}</Badge>
                  )}
                </button>
              </th>
              <td>{row.tier ? row.tier.name[locale] : m.dev_nations_tier_none()}</td>
              <td>
                <Bar value={row.cities} max={max.cities} kind="cities" />
              </td>
              <td>
                <Bar value={row.population} max={max.people} kind="people" />
              </td>
              <td>
                <Bar value={row.guards} max={max.guards} kind="guards" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 등급 한 줄의 수 칸(이름표·범위·단위) */
const FIELDS = [
  {
    key: "startCities",
    limit: NATION_TIER_LIMITS.startCities,
    label: () => m.dev_nations_field_start_cities(),
  },
  { key: "startHousing", limit: NATION_TIER_LIMITS.housing, label: () => m.dev_nations_field_housing() },
  {
    key: "startPopulationPm",
    limit: NATION_TIER_LIMITS.populationPm,
    label: () => m.dev_nations_field_population_pm(),
    unit: "‰",
  },
  {
    key: "guardsPerCity",
    limit: NATION_TIER_LIMITS.guardsPerCity,
    label: () => m.dev_nations_field_guards(),
  },
  { key: "startTech", limit: NATION_TIER_LIMITS.startTech, label: () => m.dev_nations_field_tech() },
  {
    key: "startCreditPm",
    limit: NATION_TIER_LIMITS.startCreditPm,
    label: () => m.dev_nations_tier_credit(),
    unit: "‰",
  },
  {
    key: "cityStepCells",
    limit: NATION_TIER_LIMITS.cityStepCells,
    label: () => m.dev_nations_tier_city_step(),
  },
  {
    key: "homeGapPm",
    limit: NATION_TIER_LIMITS.homeGapPm,
    label: () => m.dev_nations_tier_home_gap(),
    unit: "‰",
  },
] as const;

export function NationTierTable({
  rows,
  drafts,
  staged,
  facilities,
  locale,
  onEdit,
  onRevert,
  onUnstage,
}: {
  rows: readonly NationTierRow[];
  /** 등급 ID → 지금 보이는 값(담은 값 포함) */
  drafts: ReadonlyMap<string, NationTierJson>;
  /** 담은 등급 ID */
  staged: ReadonlySet<string>;
  facilities: NationEditorListResponse["facilities"];
  locale: "ko" | "en";
  onEdit: (next: NationTierJson) => void;
  onRevert: (id: string) => void;
  onUnstage: (id: string) => void;
}) {
  return (
    <div className="ne-tier-grid" data-testid="ne-tier-table">
      {rows.map((row) => {
        const draft = drafts.get(row.entry.id) ?? row.entry;
        const free = facilities.filter((item) => !draft.facilities.some((used) => used.facility === item.id));
        const setFacilities = (next: NationTierJson["facilities"]): void =>
          onEdit({ ...draft, facilities: next });
        return (
          <fieldset key={draft.id} className="ne-tier-card" data-tier={draft.id}>
            <legend className="ne-tier-legend">
              <span>{draft.name[locale]}</span>
              {staged.has(draft.id) ? <Badge tone="staged">{m.dev_nations_badge_staged()}</Badge> : null}
              {row.origin === "pack" ? null : <Badge tone="changed">{m.dev_nations_badge_changed()}</Badge>}
            </legend>
            <div className="ne-tier-fields">
              {FIELDS.map((field) => (
                <NumberField
                  key={field.key}
                  label={field.label()}
                  value={draft[field.key]}
                  min={field.limit.min}
                  max={field.limit.max}
                  unit={"unit" in field ? field.unit : undefined}
                  onChange={(value) => {
                    if (value !== undefined) onEdit({ ...draft, [field.key]: value });
                  }}
                  path={`tier.${draft.id}.${field.key}`}
                />
              ))}
            </div>
            <div className="ne-rows" data-list="tierFacilities">
              <p className="field-label">{m.dev_nations_tier_facilities()}</p>
              {draft.facilities.map((item, index) => {
                const name =
                  facilities.find((entry) => entry.id === item.facility)?.name[locale] ?? item.facility;
                return (
                  <div key={item.facility} className="ne-row ne-tier-facility">
                    <NumberField
                      label={name}
                      value={item.count}
                      min={NATION_TIER_LIMITS.facilityCount.min}
                      max={NATION_TIER_LIMITS.facilityCount.max}
                      onChange={(count) => {
                        if (count !== undefined)
                          setFacilities(
                            draft.facilities.map((old, i) => (i === index ? { ...old, count } : old)),
                          );
                      }}
                      path={`tier.${draft.id}.facilities.${item.facility}`}
                    />
                    <RemoveButton
                      name={name}
                      onClick={() => setFacilities(draft.facilities.filter((_, i) => i !== index))}
                    />
                  </div>
                );
              })}
              {free.length > 0 && draft.facilities.length < NATION_TIER_LIMITS.facilities ? (
                <SelectField
                  label={m.dev_nations_tier_facility_add()}
                  value=""
                  options={[
                    { value: "", label: m.dev_nations_tier_facility_pick() },
                    ...free.map((item) => ({ value: item.id, label: item.name[locale] })),
                  ]}
                  onChange={(id) => {
                    if (id !== "") setFacilities([...draft.facilities, { facility: id, count: 1 }]);
                  }}
                  path={`tier.${draft.id}.facilities.add`}
                />
              ) : null}
            </div>
            <span className="ce-inline-actions">
              {row.origin !== "pack" ? (
                <button
                  type="button"
                  className="button-small ne-tier-revert"
                  onClick={() => onRevert(draft.id)}
                >
                  {m.dev_buildings_revert()}
                </button>
              ) : null}
              {staged.has(draft.id) ? (
                <button
                  type="button"
                  className="button-small ne-tier-unstage"
                  onClick={() => onUnstage(draft.id)}
                >
                  {m.dev_buildings_unstage()}
                </button>
              ) : null}
            </span>
          </fieldset>
        );
      })}
    </div>
  );
}
