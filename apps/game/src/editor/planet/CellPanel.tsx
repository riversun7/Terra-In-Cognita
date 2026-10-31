// 칸 정보창 — D-214 정보창의 1단계(ADR 38 7절). 누른 점의 위도·경도로 미리보기 결과의 칸을 찾아 정확한 값을 보인다.
// - 값은 cellReport.ts(결과 배열), 바이옴 판정 설명은 생성기 도우미 explainBiome(설명 묶음 하나로 붙인다).
// - 창은 칸 값과 설명 묶음 목록만 받는다: 특수 지형 설명이 오면 묶음을 더한다(ADR 38 7절).
// - 출처: 팩 버전, 생성기 판, 바이옴 ID. 정의 해시는 공개본만, 초안은 "초안(굽지 않음)".
// - 맨 위는 쉬운 문장 두세 개(cellStory.ts: 고른 바이옴, 정한 조건, 아깝게 놓친 바이옴). 값 표·판정 표·출처는
//   [자세히 보기](details, 처음 접힘) 아래에 둔다(사용자 의견 2026-10-31 "날것의 데이터").
import {
  BIOME_NEAR_MISS,
  type BiomeConditionCheck,
  type BiomeExplanation,
  type BiomeRuleCheck,
  type PlanetBiome,
  explainBiome,
} from "@terra/planet/generator";
import { m } from "../../paraglide/messages.js";
import { type CellExplainer, type CellReport, type CellValues, cellReport } from "./cellReport.ts";
import { type CellStory, cellStory } from "./cellStory.ts";
import { CONDITION_LABELS, DEPTH_LABELS, formatNumber, localName } from "./editorMessages.ts";
import type { LatLon } from "./flatMapRender.ts";
import type { PreviewEntry } from "./previewTypes.ts";

/** 설명 묶음(지금은 바이옴 판정 하나) */
export type CellSection = { readonly kind: "biome"; readonly explanation: BiomeExplanation };

/** 바이옴 판정 설명 묶음: 저장 값으로 다시 판정하고 저장 바이옴과 견준다 */
export const explainBiomeSection: CellExplainer<CellSection> = (values, biomes) => ({
  kind: "biome",
  explanation: explainBiome(
    {
      water: values.waterBits,
      temperatureC: values.temperatureC,
      humidity: values.humidity,
      elevationM: values.elevationM,
    },
    biomes,
    values.biomeIndex,
  ),
});

const EXPLAINERS: readonly CellExplainer<CellSection>[] = [explainBiomeSection];

/** 결과·점 → 칸 보고(못 읽으면 null) */
export function reportAt(entry: PreviewEntry, point: LatLon): CellReport<CellSection> | null {
  try {
    return cellReport(entry.result.fields, entry.input.biomes, point.latDeg, point.lonDeg, EXPLAINERS);
  } catch {
    return null;
  }
}

export interface CellPanelProps {
  readonly report: CellReport<CellSection> | null;
  readonly entry: PreviewEntry | null;
  readonly role: "draft" | "base";
  readonly stale: boolean;
  /** 바이옴 표 번호 → 바이옴 항목(이름) */
  readonly biomeEntries: readonly unknown[];
  readonly contentVersion: string;
  /** 공개본 정의 해시(공개본만 보인다) */
  readonly definitionHash: string;
}

function biomeName(biomes: readonly PlanetBiome[], entries: readonly unknown[], index: number): string {
  const id = biomes[index]?.id ?? String(index);
  const entry = entries.find(
    (item) => typeof item === "object" && item !== null && Reflect.get(item, "id") === id,
  );
  const name: unknown = entry ? Reflect.get(entry, "name") : null;
  return localName(name, id);
}

function waterText(values: CellValues): string {
  const { water } = values;
  const parts: string[] = [];
  if (water.ocean) {
    parts.push(
      m.planet_editor_water_ocean({ depth: water.depthClass ? DEPTH_LABELS[water.depthClass]() : "–" }),
    );
  }
  if (water.lake) parts.push(m.planet_editor_water_lake());
  if (water.river) parts.push(m.planet_editor_water_river({ order: String(values.riverOrder) }));
  if (water.coast) parts.push(m.planet_editor_water_coast());
  return parts.length > 0 ? parts.join(" · ") : m.planet_editor_water_none();
}

function rangeText(condition: BiomeConditionCheck): string {
  const min = condition.min === null ? null : formatNumber(condition.min);
  const max = condition.max === null ? null : formatNumber(condition.max);
  if (min !== null && max !== null) return m.planet_editor_range_both({ min, max });
  if (min !== null) return m.planet_editor_range_min({ min });
  return m.planet_editor_range_max({ max: max ?? "" });
}

function conditionState(condition: BiomeConditionCheck): string {
  if (condition.pass) return m.planet_editor_cond_pass();
  const miss = formatNumber(condition.miss);
  return condition.near ? m.planet_editor_cond_near({ miss }) : m.planet_editor_cond_fail({ miss });
}

function ruleState(rule: BiomeRuleCheck, chosen: number): { text: string; state: string } {
  if (rule.index === chosen && rule.pass) return { text: m.planet_editor_rule_chosen(), state: "chosen" };
  if (rule.pass) return { text: m.planet_editor_rule_pass(), state: "pass" };
  if (rule.near) return { text: m.planet_editor_rule_near(), state: "near" };
  return { text: m.planet_editor_rule_fail(), state: "fail" };
}

function Explanation({
  explanation,
  biomes,
  entries,
}: {
  explanation: BiomeExplanation;
  biomes: readonly PlanetBiome[];
  entries: readonly unknown[];
}) {
  return (
    <section className="pe-section pe-explain" aria-label={m.planet_editor_explain_title()}>
      <h2 className="section-title">{m.planet_editor_explain_title()}</h2>
      {explanation.kind === "ocean" ? (
        <p>
          {m.planet_editor_explain_ocean({
            depth: explanation.depthClass ? DEPTH_LABELS[explanation.depthClass]() : "–",
          })}
          {explanation.fellBack ? ` ${m.planet_editor_explain_ocean_fallback()}` : ""}
        </p>
      ) : null}
      {explanation.kind === "lake" ? <p>{m.planet_editor_explain_lake()}</p> : null}
      {explanation.kind === "land" ? (
        <>
          <p>{m.planet_editor_explain_land()}</p>
          <ol className="pe-rules">
            {explanation.rules.map((rule) => {
              const state =
                rule.index === explanation.chosen && explanation.fellBack
                  ? { text: m.planet_editor_rule_chosen(), state: "chosen" }
                  : ruleState(rule, explanation.chosen);
              return (
                <li key={rule.index} className="pe-rule" data-state={state.state} data-biome={rule.id}>
                  <div className="pe-rule-head">
                    <span className="pe-rule-name">{biomeName(biomes, entries, rule.index)}</span>
                    <span className="pe-rule-state">{state.text}</span>
                  </div>
                  {rule.conditions.length === 0 ? (
                    <p className="field-hint">{m.planet_editor_rule_always()}</p>
                  ) : (
                    <ul className="pe-conditions">
                      {rule.conditions.map((condition) => (
                        <li
                          key={condition.axis}
                          data-pass={condition.pass}
                          data-near={condition.near}
                          className="pe-condition"
                        >
                          {CONDITION_LABELS[condition.axis]()} {formatNumber(condition.value)} (
                          {rangeText(condition)}){" — "}
                          {conditionState(condition)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
          {explanation.fellBack ? <p>{m.planet_editor_explain_fallback()}</p> : null}
          <p className="field-hint">
            {m.planet_editor_explain_near_note({
              temperature: formatNumber(BIOME_NEAR_MISS.temperatureC),
              humidity: formatNumber(BIOME_NEAR_MISS.humidity),
              elevation: formatNumber(BIOME_NEAR_MISS.realElevationM),
            })}
          </p>
        </>
      ) : null}
      <p className="pe-explain-stored" data-matches={explanation.matchesStored === true}>
        {explanation.matchesStored === false && explanation.stored !== null
          ? m.planet_editor_explain_differs({ stored: biomeName(biomes, entries, explanation.stored) })
          : m.planet_editor_explain_matches()}
      </p>
    </section>
  );
}

/** 습도 0~255 → % 정수 */
const humidityPercent = (value: number): number => Math.round((value / 255) * 100);

/** 조건 축의 값 + 단위(습도는 %, 고도는 실제 m) */
function axisValue(axis: BiomeConditionCheck["axis"], value: number): string {
  switch (axis) {
    case "temperatureC":
      return m.planet_editor_value_celsius({ value: formatNumber(value) });
    case "humidity":
      return m.planet_editor_value_percent({ value: formatNumber(humidityPercent(value)) });
    case "realElevationM":
      return m.planet_editor_value_meters({ value: formatNumber(value) });
    default:
      return formatNumber(value);
  }
}

/** 바꿀 양 + 단위(습도는 % 한 자리 반올림, 1% 아래는 1%) */
function amountText(axis: BiomeConditionCheck["axis"], amount: number): string {
  if (axis === "humidity") {
    return m.planet_editor_value_percent({ value: formatNumber(Math.max(1, humidityPercent(amount))) });
  }
  return axisValue(axis, amount);
}

function storyRange(condition: BiomeConditionCheck): string {
  const axis = CONDITION_LABELS[condition.axis]();
  const min = condition.min === null ? null : axisValue(condition.axis, condition.min);
  const max = condition.max === null ? null : axisValue(condition.axis, condition.max);
  if (min !== null && max !== null) return m.planet_editor_story_range_both({ axis, min, max });
  if (min !== null) return m.planet_editor_story_range_min({ axis, min });
  return m.planet_editor_story_range_max({ axis, max: max ?? "" });
}

const NEAR_TEXT = {
  temperatureC: {
    higher: m.planet_editor_story_near_temperature_higher,
    lower: m.planet_editor_story_near_temperature_lower,
  },
  humidity: {
    higher: m.planet_editor_story_near_humidity_higher,
    lower: m.planet_editor_story_near_humidity_lower,
  },
  realElevationM: {
    higher: m.planet_editor_story_near_elevation_higher,
    lower: m.planet_editor_story_near_elevation_lower,
  },
} as const;

/** 조건 값 목록 "기온 12°C, 습도 65%" */
function conditionValues(items: readonly BiomeConditionCheck[]): string {
  return items
    .map((condition) =>
      m.planet_editor_story_value({
        axis: CONDITION_LABELS[condition.axis](),
        value: axisValue(condition.axis, condition.value),
      }),
    )
    .join(", ");
}

/** 쉬운 문장들(고른 바이옴 → 정한 조건 → 아깝게 놓친 바이옴) */
function storyLines(story: CellStory, values: CellValues, name: (index: number) => string): string[] {
  const biome = name(story.biome);
  const lines = [m.planet_editor_story_biome({ biome })];
  if (story.kind === "ocean") {
    lines.push(
      m.planet_editor_story_ocean({ depth: story.depthClass ? DEPTH_LABELS[story.depthClass]() : "–" }),
    );
    return lines;
  }
  if (story.kind === "lake") {
    lines.push(m.planet_editor_story_lake());
    return lines;
  }

  if (story.deciding) {
    lines.push(
      m.planet_editor_story_fit({
        values: conditionValues(story.deciding),
        biome,
        ranges: story.deciding.map(storyRange).join(", "),
      }),
    );
  } else {
    const facts = [
      m.planet_editor_story_value({
        axis: CONDITION_LABELS.temperatureC(),
        value: axisValue("temperatureC", values.temperatureC),
      }),
      m.planet_editor_story_value({
        axis: CONDITION_LABELS.humidity(),
        value: axisValue("humidity", values.humidity),
      }),
      m.planet_editor_story_value({
        axis: CONDITION_LABELS.realElevationM(),
        value: axisValue("realElevationM", values.realElevationM),
      }),
    ];
    lines.push(m.planet_editor_story_fallback({ values: facts.join(", ") }));
  }
  const near = story.nearMiss;
  if (near?.kind === "one") {
    lines.push(
      NEAR_TEXT[near.condition.axis][near.direction]({
        amount: amountText(near.condition.axis, near.amount),
        biome: name(near.biome),
      }),
    );
  } else if (near?.kind === "many") {
    lines.push(m.planet_editor_story_near_many({ biome: name(near.biome) }));
  }
  return lines;
}

export function CellPanel({
  report,
  entry,
  role,
  stale,
  biomeEntries,
  contentVersion,
  definitionHash,
}: CellPanelProps) {
  if (!report || !entry) {
    return <p className="status pe-cell-none">{m.planet_editor_cell_none()}</p>;
  }
  const { values } = report;
  const biomeSection = report.sections.find((section) => section.kind === "biome");
  const story = biomeSection ? cellStory(biomeSection.explanation) : null;
  const biomes = entry.input.biomes;
  const { location } = values;
  const rows: [string, string][] = [
    [m.planet_editor_cell_key(), String(location.key)],
    [
      m.planet_editor_cell_position(),
      m.planet_editor_cell_position_value({
        face: String(location.face),
        i: String(location.i),
        j: String(location.j),
      }),
    ],
    [
      m.planet_editor_cell_latlon(),
      m.planet_editor_cell_latlon_value({
        lat: formatNumber(values.latDeg, 2),
        lon: formatNumber(values.lonDeg, 2),
      }),
    ],
    [
      m.planet_editor_cell_elevation(),
      m.planet_editor_cell_elevation_value({
        game: formatNumber(values.elevationM),
        real: formatNumber(values.realElevationM),
      }),
    ],
    [m.planet_editor_cell_water(), waterText(values)],
    [
      m.planet_editor_cell_temperature(),
      m.planet_editor_value_celsius({ value: formatNumber(values.temperatureC) }),
    ],
    [
      m.planet_editor_cell_precipitation(),
      m.planet_editor_cell_precipitation_value({ value: formatNumber(values.precipitationMm) }),
    ],
    [m.planet_editor_cell_humidity(), m.planet_editor_cell_of_255({ value: formatNumber(values.humidity) })],
    [m.planet_editor_cell_forest(), m.planet_editor_cell_of_255({ value: formatNumber(values.forest) })],
    [m.planet_editor_cell_biome(), biomeName(biomes, biomeEntries, values.biomeIndex)],
  ];
  return (
    <div className="pe-stack pe-cell" data-cell-key={String(location.key)}>
      <p className="field-hint">
        {m.planet_editor_cell_result({
          level: String(entry.level),
          role: role === "draft" ? m.planet_editor_role_draft() : m.planet_editor_role_base(),
        })}
        {stale ? ` · ${m.planet_editor_stale()}` : ""}
      </p>
      {story ? (
        <div className="pe-story" data-story={story.kind}>
          {storyLines(story, values, (index) => biomeName(biomes, biomeEntries, index)).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
      <details className="pe-details">
        <summary className="pe-details-summary">{m.planet_editor_details_toggle()}</summary>
        <dl className="pe-facts pe-cell-values">
          {rows.map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {values.water.ocean ? <p className="field-hint">{m.planet_editor_depth_note()}</p> : null}
        {report.sections.map((section) =>
          section.kind === "biome" ? (
            <Explanation
              key="biome"
              explanation={section.explanation}
              biomes={biomes}
              entries={biomeEntries}
            />
          ) : null,
        )}
        <section className="pe-section">
          <h2 className="section-title">{m.planet_editor_source()}</h2>
          <p className="pe-source" translate="no">
            {m.planet_editor_source_value({
              content: contentVersion,
              generator: String(values.generatorVersion),
              biome: values.biomeId ?? "–",
            })}
          </p>
          <p className="pe-source" translate="no">
            {role === "base"
              ? m.planet_editor_source_hash({ hash: definitionHash })
              : m.planet_editor_source_draft()}
          </p>
        </section>
      </details>
    </div>
  );
}
