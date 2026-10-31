// 도시 탭 — 도시마다 내정 수치(46 §2): 시장·대행, 인구, 만족도(= 충성도)와 민심 네 단계(D-443), 발전도(누르면 7요소 내역,
// D-254), 세율, 방침·하루 예산. 카드 격자: 좁으면 한 줄에 하나, 넓으면 여럿. 시장 임명·예산 바꾸기는 명령이라 곧 열림.
// 독재가 아니면 시장 임명은 투표 안건이다(기획 검토 C4) → [시장 임명 안건 올리기].
import { type CityRow, DEVELOPMENT_FACTORS } from "@terra/shared/faction";
import { formatCount } from "../home/numbers.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { ActionRow, Fact, SoonButton, StateChip } from "../sections/screenParts.tsx";
import { amountText } from "../sections/screenText.ts";
import { DEVELOPMENT_NAMES, POLICY_NAMES, UNREST_NAMES } from "./factionText.ts";
import { UNREST_TONES, barWidth, formatPermille } from "./factionView.ts";

function mayorText(city: CityRow): string {
  if (city.mayor !== null) return city.mayor;
  if (city.actingDeputy !== null) return m.faction_city_acting({ name: city.actingDeputy });
  return m.faction_city_mayor_vacant();
}

/**
 * 발전도 칸: 내역이 있으면 숫자를 누르면 7요소가 펼쳐진다(details·summary, 키보드·화면 읽기 기본 동작).
 * 내역이 없으면 숫자만
 */
function Development({ city }: { city: CityRow }) {
  const parts = city.developmentParts;
  if (parts === null) return <>{formatCount(city.development)}</>;
  return (
    <details className="faction-dev">
      <summary
        className="faction-dev-summary"
        aria-label={`${formatCount(city.development)} · ${m.faction_city_development_parts({ city: city.name })}`}
      >
        <span className="faction-dev-value">{formatCount(city.development)}</span>
      </summary>
      <ul className="faction-dev-list">
        {DEVELOPMENT_FACTORS.map((factor) => (
          <li key={factor} className="faction-dev-row">
            <span>{DEVELOPMENT_NAMES[factor]()}</span>
            <span className="faction-dev-score">{formatCount(parts[factor])}</span>
          </li>
        ))}
      </ul>
    </details>
  );
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

function CityCard({ city, byVote }: { city: CityRow; byVote: boolean }) {
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
            {m.faction_city_threshold({
              value: formatCount(city.rebellionThreshold),
              warning: formatCount(city.rebellionWarning),
            })}
          </span>
        </div>
        <dl className="facts">
          <Fact label={m.faction_city_mayor()}>{mayorText(city)}</Fact>
          <Fact label={m.faction_city_population()}>{formatCount(city.population)}</Fact>
          <Fact label={m.faction_city_development()}>
            <Development city={city} />
          </Fact>
          <Fact label={m.faction_city_tax()}>{formatPermille(city.taxRatePm, getLocale())}</Fact>
          <Fact label={m.faction_city_policy()}>{POLICY_NAMES[city.policy]()}</Fact>
          <Fact label={m.faction_city_budget()}>{amountText(city.dailyBudget)}</Fact>
        </dl>
        <ActionRow>
          <SoonButton label={byVote ? m.faction_city_appoint_vote() : m.faction_city_appoint()} />
          <SoonButton label={m.faction_city_plan()} />
        </ActionRow>
      </article>
    </li>
  );
}

export function FactionCities({ cities, byVote }: { cities: readonly CityRow[]; byVote: boolean }) {
  if (cities.length === 0) return <p className="faction-muted">{m.faction_cities_empty()}</p>;
  return (
    <ul className="faction-grid">
      {cities.map((city) => (
        <CityCard key={city.id} city={city} byVote={byVote} />
      ))}
    </ul>
  );
}
