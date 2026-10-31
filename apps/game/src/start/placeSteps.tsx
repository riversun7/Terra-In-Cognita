// 첫 접속 4~6단계 — 세력(추천 지역 D-218, 지원금 금액은 공식이 오면 D-445 174), 시작 도시(붐빔·기본 = 가장 덜 붐빔 D-6041,
// 자원·기후는 곧 D-445 175), 강하(요약 + [강하], 짧은 연출 D-445 179).
import type {
  CreationCity,
  CreationFaction,
  CyborgAppearance,
  CyborgCreationResponse,
  CyborgRollView,
} from "@terra/shared/cyborg";
import { PRIMARY_STATS } from "@terra/shared/roster";
import { useId } from "react";
import { CyborgAvatar } from "../cyborg/CyborgAvatar.tsx";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { formatNumber, primaryLabel } from "../roster/rosterText.ts";
import { crowdingText, temperamentText } from "./startText.ts";

const localName = (name: { ko: string; en: string }): string => (getLocale() === "en" ? name.en : name.ko);

export function FactionStep({
  data,
  selected,
  onSelect,
}: {
  data: CyborgCreationResponse;
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const id = useId();
  if (data.factions.length === 0) return <p className="start-hint">{m.start_faction_empty()}</p>;
  return (
    <fieldset className="start-group">
      <legend className="visually-hidden">{m.start_step_faction()}</legend>
      <div className="start-choices">
        {data.factions.map((faction) => (
          <label key={faction.id} className="start-choice" data-faction={faction.id}>
            <input
              type="radio"
              name={`${id}-faction`}
              checked={selected === faction.id}
              onChange={() => onSelect(faction.id)}
            />
            <span className="start-choice-body">
              <span className="start-choice-name">
                {localName(faction.name)}
                {faction.recommended ? (
                  <span className="start-badge">{m.start_faction_recommended()}</span>
                ) : null}
              </span>
              <span className="start-choice-meta">
                {m.start_faction_cyborgs({ count: formatNumber(faction.cyborgs) })} ·{" "}
                {m.start_faction_cities({ count: formatNumber(faction.cities.length) })}
              </span>
            </span>
          </label>
        ))}
      </div>
      <p className="start-hint">{m.start_faction_note()}</p>
    </fieldset>
  );
}

export function CityStep({
  faction,
  selected,
  onSelect,
}: {
  faction: CreationFaction;
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const id = useId();
  return (
    <fieldset className="start-group">
      <legend className="visually-hidden">{m.start_step_city()}</legend>
      <div className="start-choices">
        {faction.cities.map((city) => (
          <label key={city.id} className="start-choice" data-city={city.id}>
            <input
              type="radio"
              name={`${id}-city`}
              checked={selected === city.id}
              onChange={() => onSelect(city.id)}
            />
            <span className="start-choice-body">
              <span className="start-choice-name">
                {m.start_city_name({ number: formatNumber(city.number) })}
                <span className="start-badge" data-crowding={city.crowding}>
                  {crowdingText(city.crowding)}
                </span>
              </span>
              <span className="start-choice-meta">
                {m.start_city_started({ count: formatNumber(city.cyborgs) })}
              </span>
              <span className="start-choice-meta">{m.start_city_soon()}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="start-hint">{m.start_city_safe()}</p>
    </fieldset>
  );
}

export function DescentStep({
  name,
  look,
  roll,
  faction,
  city,
  descending,
}: {
  name: string;
  look: CyborgAppearance;
  roll: CyborgRollView;
  faction: CreationFaction;
  city: CreationCity;
  descending: boolean;
}) {
  return (
    <div className="start-descent" data-descending={descending ? "true" : "false"}>
      <div className="start-summary">
        <CyborgAvatar look={look} className="start-summary-avatar" />
        <div className="start-summary-text">
          <p className="start-summary-name">{name.trim()}</p>
          <p className="start-choice-meta">{temperamentText(roll.temperament)}</p>
        </div>
      </div>
      <dl className="start-summary-facts">
        <div>
          <dt>{m.start_step_stats()}</dt>
          <dd>
            {PRIMARY_STATS.map((stat) => `${primaryLabel(stat)} ${formatNumber(roll.stats[stat])}`).join(
              " · ",
            )}
          </dd>
        </div>
        <div>
          <dt>{m.start_step_faction()}</dt>
          <dd>{localName(faction.name)}</dd>
        </div>
        <div>
          <dt>{m.start_step_city()}</dt>
          <dd>{m.start_city_name({ number: formatNumber(city.number) })}</dd>
        </div>
      </dl>
      <p className="start-hint">{m.start_descent_note()}</p>
      {descending ? (
        <div className="start-scene" role="status">
          <span className="start-scene-pod" aria-hidden="true">
            <CyborgAvatar look={look} variant="face" className="start-scene-face" />
          </span>
          <span className="start-scene-text">{m.start_descent_scene()}</span>
        </div>
      ) : null}
    </div>
  );
}
