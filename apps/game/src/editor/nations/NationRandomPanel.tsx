// [랜덤 국가 추가] — 사용자 요청(2026-11-11, 원문): "샘플좋다. 추가적으로 랜덤으로 프리셋을 설정하여 추가할수도 있으면 좋을듯."
// docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)". 시드 난수로 후보 하나(이름 말씨·국가·화폐·지도자 이름·약어·색·마크·등급·도시·
// 사람 이름)를 만들어 미리 보이고, [다시 굴리기](전부)·부분마다 [↻](그 부분만)로 바꾼 뒤 [추가]하면 새 프리셋으로 담긴다(새 영구 ID,
// 목록 끝 — 이미 있는 프리셋의 차례는 그대로). 담긴 뒤에는 다른 국가처럼 고치고 막대의 [적용]으로 저장한다.
// 새 국가는 저장해도 이 세계에 바로 서지 않는다: 세계 배치 화면에서 자리를 놓으면 다음 서버 시작 때 선다(화면이 알린다).
import type { NationPresetJson, NationSeedDefaults } from "@terra/shared/nationEditor";
import {
  type NationRandomPart,
  type NationRandomSeeds,
  randomNation,
  randomSeedsOf,
  rerollPart,
} from "@terra/shared/nationRandom";
import type { NationTierJson } from "@terra/shared/nationTier";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { NationEmblem } from "../../ui/NationEmblem.tsx";
import { colorOf, currencySample, emblemOf, startCountsOf } from "./nationModel.ts";
import { STYLE_TEXT } from "./nationText.ts";

function Reroll({ part, label, onClick }: { part: NationRandomPart; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="button-small ne-random-reroll"
      data-part={part}
      aria-label={m.dev_nations_random_reroll_part({ part: label })}
      title={m.dev_nations_random_reroll_part({ part: label })}
      onClick={onClick}
    >
      ↻
    </button>
  );
}

export function NationRandomPanel({
  existing,
  retiredIds,
  defaults,
  tiers,
  locale,
  onAdd,
  onClose,
}: {
  /** 이미 있는 프리셋(담은 새 프리셋 포함 — 약어·색·ID가 겹치지 않게) */
  existing: readonly NationPresetJson[];
  retiredIds: readonly string[];
  defaults: NationSeedDefaults;
  tiers: readonly NationTierJson[];
  locale: "ko" | "en";
  onAdd: (entry: NationPresetJson) => void;
  onClose: () => void;
}) {
  // 처음 시드는 열 때의 시각에서(판정이 아니라 후보 고르기) — 그 뒤는 같은 시드면 같은 후보
  const [seeds, setSeeds] = useState<NationRandomSeeds>(() => randomSeedsOf(Date.now() % 0x7fff_ffff));
  const candidate = randomNation(seeds, { existing, retiredIds });
  const counts = startCountsOf(candidate, defaults, tiers);
  const tier = tiers.find((item) => item.id === candidate.powerTier);
  const color = colorOf(candidate);
  const emblem = emblemOf(candidate);
  const reroll = (part: NationRandomPart) => () => setSeeds(rerollPart(seeds, part));
  const sameName = existing.some(
    (entry) => entry.name.ko === candidate.name.ko || entry.name.en === candidate.name.en,
  );
  const part = (key: NationRandomPart, label: string, value: string) => (
    <div className="ne-random-part" data-part={key}>
      <dt>{label}</dt>
      <dd>
        <span className="ne-random-value">{value}</span>
        <Reroll part={key} label={label} onClick={reroll(key)} />
      </dd>
    </div>
  );
  return (
    <section className="ce-panel ne-random" aria-labelledby="ne-random-title" data-testid="ne-random">
      <h2 id="ne-random-title" className="ce-panel-title">
        {m.dev_nations_random_title()}
      </h2>
      <p className="field-hint">{m.dev_nations_random_lead()}</p>
      <div className="ne-random-card" data-candidate={candidate.id}>
        <div className="ne-random-head">
          <NationEmblem spec={emblem} color={color} uploaded={null} size={64} />
          <div className="ne-random-names">
            <p className="ne-random-name">
              <span className="ne-chip" style={{ background: color }} aria-hidden="true" />
              <strong>{candidate.name[locale]}</strong>
              {candidate.shortName ? (
                <code className="dev-code" translate="no">
                  {candidate.shortName}
                </code>
              ) : null}
            </p>
            <p className="field-hint">
              <code className="dev-code" translate="no">
                {candidate.id}
              </code>
            </p>
          </div>
        </div>
        <dl className="ne-random-parts">
          {part(
            "style",
            m.dev_nations_field_style(),
            candidate.nameStyle ? STYLE_TEXT[candidate.nameStyle]() : "",
          )}
          {part("name", m.dev_nations_random_part_name(), `${candidate.name.ko} · ${candidate.name.en}`)}
          {part(
            "currency",
            m.dev_nations_random_part_currency(),
            `${candidate.currency.name.ko} · ${candidate.currency.name.en} (${currencySample(candidate, 1234, getLocale())})`,
          )}
          {part(
            "leader",
            m.dev_nations_random_part_leader(),
            candidate.leaderName ? `${candidate.leaderName.ko} · ${candidate.leaderName.en}` : "",
          )}
          {part("color", m.dev_nations_random_part_color(), color)}
          {part("emblem", m.dev_nations_random_part_emblem(), `${emblem.shape} · ${emblem.charge}`)}
          {part(
            "tier",
            m.dev_nations_field_tier(),
            `${tier ? tier.name[locale] : m.dev_nations_tier_none()} — ${m.dev_nations_row_summary({
              cities: counts.cities,
              people: counts.totalPopulation,
              currency: candidate.currency.ticker ?? candidate.currency.code,
            })}`,
          )}
          {part("cities", m.dev_nations_random_part_cities(), (candidate.cityNames ?? []).join(", "))}
          {part(
            "people",
            m.dev_nations_random_part_people(),
            [...(candidate.humanNames?.given ?? []).slice(0, 6), "…"].join(", "),
          )}
        </dl>
        {sameName ? (
          <p className="field-error" role="alert">
            {m.dev_nations_random_same_name()}
          </p>
        ) : null}
      </div>
      <p className="field-hint">{m.dev_nations_random_note()}</p>
      <span className="ce-inline-actions">
        <button
          type="button"
          className="ne-random-all"
          onClick={() => setSeeds(randomSeedsOf((seeds.name + seeds.color + 1) % 0x7fff_ffff))}
        >
          {m.dev_nations_random_again()}
        </button>
        <button type="button" className="ne-random-add" onClick={() => onAdd(candidate)}>
          {m.dev_nations_random_add()}
        </button>
        <button type="button" className="button-small ne-random-close" onClick={onClose}>
          {m.dev_nations_random_close()}
        </button>
      </span>
    </section>
  );
}
