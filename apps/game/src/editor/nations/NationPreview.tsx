// 미리 보기 — 이 국가가 게임에서 어떻게 보이는지: 국가 마크(여러 크기)·이름·지도 이름표(밝은·어두운 지도 바탕)·화폐 보기·시작 수.
// 지도 바탕 두 색은 그림 자료다(테마와 무관하게 두 가지를 나란히 보인다 — nationModel MAP_LIGHT·MAP_DARK).
import type { NationPresetJson, NationSeedDefaults } from "@terra/shared/nationEditor";
import type { NationTierJson } from "@terra/shared/nationTier";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { NationEmblem } from "../../ui/NationEmblem.tsx";
import {
  MAP_DARK,
  MAP_LIGHT,
  colorOf,
  colorReadability,
  currencySample,
  emblemOf,
  startCountsOf,
} from "./nationModel.ts";

const SIZES = [16, 24, 48, 96] as const;
const SAMPLE_AMOUNT = 1234;

export function NationPreview({
  entry,
  uploaded,
  defaults,
  tiers,
  locale,
}: {
  entry: NationPresetJson;
  uploaded: string | null;
  defaults: NationSeedDefaults;
  /** 국력 등급 표(담은 값 포함) */
  tiers: readonly NationTierJson[];
  locale: "ko" | "en";
}) {
  const color = colorOf(entry);
  const readable = colorReadability(color);
  const counts = startCountsOf(entry, defaults, tiers);
  const tier = tiers.find((row) => row.id === entry.powerTier);
  const emblem = emblemOf(entry);
  const name = entry.name[locale];
  return (
    <section className="ce-panel ne-preview" aria-labelledby="ne-preview-title" data-section="preview">
      <h3 id="ne-preview-title" className="ce-panel-title">
        {m.dev_nations_preview_title()}
      </h3>
      <div className="ne-preview-body">
        <div className="ne-preview-emblems" aria-hidden="true">
          {SIZES.map((size) => (
            <NationEmblem key={size} spec={emblem} color={color} uploaded={uploaded} size={size} />
          ))}
        </div>
        <div className="ne-preview-text">
          <p className="ne-preview-name">
            <NationEmblem spec={emblem} color={color} uploaded={uploaded} size={24} />
            <strong>{name}</strong>
            {entry.shortName ? (
              <span
                className="ne-preview-short"
                style={{ background: color, color: readable.text }}
                translate="no"
              >
                {entry.shortName}
              </span>
            ) : null}
          </p>
          <p className="ne-preview-line">
            {m.dev_nations_preview_leader({
              name: entry.leaderName?.[locale] || m.dev_nations_preview_leader_none(),
            })}
          </p>
          <p className="ne-preview-line ne-preview-money" data-testid="ne-money">
            {m.dev_nations_preview_money({
              name: entry.currency.name[locale],
              sample: currencySample(entry, SAMPLE_AMOUNT, getLocale()),
            })}
          </p>
          <p className="ne-preview-line">
            {m.dev_nations_preview_counts({
              cities: counts.cities,
              housing: counts.housing,
              people: counts.population,
              facilities: counts.facilities,
            })}
          </p>
          <p className="ne-preview-line" data-testid="ne-tier-line">
            {m.dev_nations_preview_tier({
              tier: tier ? tier.name[locale] : m.dev_nations_tier_none(),
              guards: counts.totalGuards,
              people: counts.totalPopulation,
            })}
          </p>
        </div>
        <div className="ne-preview-maps">
          {[MAP_LIGHT, MAP_DARK].map((background) => (
            <span
              key={background}
              className="ne-map-label"
              style={{ background, color: background === MAP_LIGHT ? MAP_DARK : MAP_LIGHT }}
            >
              <NationEmblem spec={emblem} color={color} uploaded={uploaded} size={16} />
              <span className="ne-chip" style={{ background: color }} aria-hidden="true" />
              {name}
            </span>
          ))}
          {readable.ok ? null : (
            <p className="field-hint ne-color-warn" role="note">
              {m.dev_nations_color_warn()}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
