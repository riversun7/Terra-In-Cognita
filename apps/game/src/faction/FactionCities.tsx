// 도시 탭 — 도시마다 내정 수치(46 §2): 시장·대행, 인구, 만족도(= 충성도)와 민심 단계, 발전도, 세율, 방침·하루 예산.
// 카드 격자: 좁으면 한 줄에 하나, 넓으면 여럿. 시장 임명·예산 바꾸기는 명령이라 곧 열림.
import type { CityRow } from "@terra/shared/faction";
import { formatCount } from "../home/numbers.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { ActionRow, Fact, SoonButton, StateChip } from "../sections/screenParts.tsx";
import { amountText } from "../sections/screenText.ts";
import { POLICY_NAMES, UNREST_NAMES } from "./factionText.ts";
import { UNREST_TONES, barWidth, formatPermille } from "./factionView.ts";

function mayorText(city: CityRow): string {
  if (city.mayor !== null) return city.mayor;
  if (city.actingDeputy !== null) return m.faction_city_acting({ name: city.actingDeputy });
  return m.faction_city_mayor_vacant();
}

/** 만족도 막대(반란 문턱 눈금). 수는 글자로 따로 보이므로 막대는 꾸밈이다 */
function SatisfactionBar({ city }: { city: CityRow }) {
  return (
    <span className="faction-meter" data-tone={UNREST_TONES[city.unrest]} aria-hidden="true">
      <span className="faction-meter-fill" style={{ inlineSize: barWidth(city.satisfaction * 10) }} />
      <span
        className="faction-meter-mark"
        style={{ insetInlineStart: barWidth(city.rebellionThreshold * 10) }}
      />
    </span>
  );
}

function CityCard({ city }: { city: CityRow }) {
  const titleId = `faction-city-${city.id}`;
  return (
    <li className="faction-city">
      <article className="faction-item" aria-labelledby={titleId}>
        <div className="faction-item-head">
          <h3 id={titleId} className="faction-item-title">
            {city.name}
          </h3>
          <StateChip tone={UNREST_TONES[city.unrest]} label={UNREST_NAMES[city.unrest]()} />
          {city.occupied ? <StateChip tone="warn" label={m.faction_city_occupied()} /> : null}
          {city.startCity ? <StateChip tone="plain" label={m.faction_city_start()} /> : null}
        </div>
        <div className="faction-satisfaction">
          <span className="faction-satisfaction-label">
            {m.faction_city_satisfaction()}{" "}
            <strong>{m.faction_city_satisfaction_value({ value: formatCount(city.satisfaction) })}</strong>
          </span>
          <SatisfactionBar city={city} />
          <span className="faction-muted">
            {m.faction_city_threshold({ value: formatCount(city.rebellionThreshold) })}
          </span>
        </div>
        <dl className="facts">
          <Fact label={m.faction_city_mayor()}>{mayorText(city)}</Fact>
          <Fact label={m.faction_city_population()}>{formatCount(city.population)}</Fact>
          <Fact label={m.faction_city_development()}>{formatCount(city.development)}</Fact>
          <Fact label={m.faction_city_tax()}>{formatPermille(city.taxRatePm, getLocale())}</Fact>
          <Fact label={m.faction_city_policy()}>{POLICY_NAMES[city.policy]()}</Fact>
          <Fact label={m.faction_city_budget()}>{amountText(city.dailyBudget)}</Fact>
        </dl>
        <ActionRow>
          <SoonButton label={m.faction_city_appoint()} />
          <SoonButton label={m.faction_city_plan()} />
        </ActionRow>
      </article>
    </li>
  );
}

export function FactionCities({ cities }: { cities: readonly CityRow[] }) {
  if (cities.length === 0) return <p className="faction-muted">{m.faction_cities_empty()}</p>;
  return (
    <ul className="faction-grid">
      {cities.map((city) => (
        <CityCard key={city.id} city={city} />
      ))}
    </ul>
  );
}
