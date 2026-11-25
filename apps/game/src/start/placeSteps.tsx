// 첫 접속 4~6단계 — 세력(추천 지역 D-218 → 2026-11-11 추천 3곳·자세한 정보, 지원금 금액은 공식이 오면 D-445 174), 시작 도시(붐빔·기본 = 가장 덜 붐빔 D-6041,
// 주변 자원·기후 D-445 175), 강하(요약 + [강하], 짧은 연출 D-445 179).
// 시작 도시는 1차맵 작은 보기(StartCityMap, 지연 조각)에서 눌러 고르고, 목록은 접근성 대안으로 그대로 둔다. 둘레 땅·기후·1차맵 자리는
// tRPC world.cities(docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름"). 그 조회가 없으면(실패) 지도·땅 없이 목록만.
import type {
  CreationCity,
  CreationFaction,
  CreationNationProfile,
  CyborgCreationResponse,
  CyborgRollView,
} from "@terra/shared/cyborg";
import type { CharacterLook } from "@terra/shared/characterLook";
import { PRIMARY_STAT_PAIRS } from "@terra/shared/roster";
import type { WorldCitiesResponse } from "@terra/shared/worldMap";
import { type ReactNode, Suspense, lazy, useId } from "react";
import { CyborgPortrait } from "../cyborg/CyborgPortrait.tsx";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { formatNumber, primaryCode, primaryLabel } from "../roster/rosterText.ts";
import "../roster/statPairs.css";
import { LandFacts } from "../map/LandFacts.tsx";
import { landText } from "../map/landText.ts";
import { NationEmblem } from "../ui/NationEmblem.tsx";
import { crowdingText, regimeText, temperamentText, tierText } from "./startText.ts";

// 1차맵 작은 보기: 엔진·three.js는 이 조각에만(첫 접속 조각을 가볍게)
const StartCityMap = lazy(() => import("./StartCityMap.tsx"));

const localName = (name: { ko: string; en: string }): string => (getLocale() === "en" ? name.en : name.ko);
/** 시작 도시 이름: 서버가 준 이름(번역 안 함 D-476, 기획 답 510 다), 없으면 "시작 도시 N" */
const startCityName = (city: { readonly name: string | null; readonly number: number }): string =>
  city.name ?? m.start_city_name({ number: formatNumber(city.number) });

/** 거래세(만분율) → "2%" */
const taxText = (taxBp: number): string =>
  new Intl.NumberFormat(getLocale(), { style: "percent", maximumFractionDigits: 2 }).format(taxBp / 10_000);

/**
 * 나라 고르기(2026-11-11 사용자 요청 "더 자세한 정보(인구수, 정책, 간단소개 등)"): 카드마다 마크·이름·국력 등급·추천, 인구·도시 수, 한 줄 소개,
 * 정착 지원금. 고른 카드는 펼쳐 지도자·체제·거래세·화폐·기술 단계(·시작한 사이보그)를 보인다(390px에서 16장이 너무 길지 않게).
 * 시작한 사이보그 수는 어느 나라든 1 이상일 때만 보인다(빈 세계에서 "사이보그 0"은 정보가 없다). 값은 서버 조회(cyborg.creation profile)다
 */
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
  const showCyborgs = data.factions.some((faction) => faction.cyborgs > 0);
  return (
    <fieldset className="start-group">
      <legend className="visually-hidden">{m.start_step_faction()}</legend>
      <div className="start-choices start-nations">
        {data.factions.map((faction) => {
          const profile = faction.profile;
          const chosen = selected === faction.id;
          // 가입비를 받는 나라: 시작할 수 없다(누르면 StartScreen이 경고 창을 띄우고 고르지 않는다)
          const fee = faction.entryFee;
          return (
            <label
              key={faction.id}
              className="start-choice start-nation"
              data-faction={faction.id}
              data-recommended={faction.recommended ? "true" : "false"}
              data-fee={fee === undefined ? undefined : fee}
            >
              <input
                type="radio"
                name={`${id}-faction`}
                checked={chosen}
                onChange={() => onSelect(faction.id)}
              />
              <span className="start-choice-body">
                <span className="start-choice-name">
                  {profile?.emblem ? (
                    <NationEmblem
                      spec={profile.emblem.spec}
                      color={profile.emblem.color}
                      uploaded={profile.emblem.uploaded}
                      size={22}
                      className="start-nation-emblem"
                    />
                  ) : null}
                  {localName(faction.name)}
                  {profile?.tier ? (
                    <span className="start-badge start-nation-tier" data-tier={profile.tier}>
                      {tierText(profile.tier)}
                    </span>
                  ) : null}
                  {faction.recommended ? (
                    <span className="start-badge" data-badge="recommended">
                      {m.start_faction_recommended()}
                    </span>
                  ) : null}
                  {fee === undefined ? null : (
                    <span className="start-badge" data-badge="fee">
                      {m.start_faction_fee_badge()}
                    </span>
                  )}
                </span>
                {/* 크기 줄: 조각마다 줄을 바꾸지 않는다(390px에서 "사이보그 / 1"로 갈라지지 않게) */}
                <span className="start-choice-meta start-nation-size" data-part="size">
                  {sizeParts(faction, profile, showCyborgs).map((part, index) => (
                    <span key={part.key} className="start-nation-size-part" data-size={part.key}>
                      {index > 0 ? " · " : ""}
                      {part.text}
                    </span>
                  ))}
                </span>
                {profile?.intro ? (
                  <span className="start-choice-meta start-nation-intro">{localName(profile.intro)}</span>
                ) : null}
                {/* 정착 지원금(D-455 190·N39): 강하 때 한 번, 덜 붐빈 세력일수록 많다 */}
                {fee === undefined ? (
                  <span className="start-choice-meta start-faction-grant" data-grant={faction.grant}>
                    {m.start_faction_grant({ amount: formatNumber(Number(faction.grant)) })}
                  </span>
                ) : (
                  <span className="start-choice-meta start-faction-fee">
                    {m.start_faction_fee_line({ amount: formatNumber(Number(fee)) })}
                  </span>
                )}
                {chosen && profile ? <NationFacts profile={profile} cyborgs={faction.cyborgs} /> : null}
              </span>
            </label>
          );
        })}
      </div>
      <p className="start-hint">{m.start_faction_note()}</p>
    </fieldset>
  );
}

/** 카드 크기 줄 조각: 인구 · 도시(시작 도시와 다를 때만 괄호) · 시작한 사이보그(어느 나라든 1 이상일 때만) */
function sizeParts(
  faction: CreationFaction,
  profile: CreationNationProfile | undefined,
  showCyborgs: boolean,
): { readonly key: string; readonly text: string }[] {
  const start = faction.cities.length;
  const parts: { key: string; text: string }[] = [];
  if (profile?.humans !== null && profile?.humans !== undefined)
    parts.push({ key: "humans", text: m.start_nation_population({ count: formatNumber(profile.humans) }) });
  const cities = profile?.cityCount ?? null;
  parts.push({
    key: "cities",
    text:
      cities !== null && cities !== start
        ? m.start_nation_cities({ count: formatNumber(cities), start: formatNumber(start) })
        : m.start_nation_cities_only({ count: formatNumber(cities ?? start) }),
  });
  if (showCyborgs)
    parts.push({ key: "cyborgs", text: m.start_faction_cyborgs({ count: formatNumber(faction.cyborgs) }) });
  return parts;
}

/** 고른 나라의 자세한 줄(지도자·체제·거래세·화폐·기술 단계·시작한 사이보그). 라벨 안이라 글 요소(span)만 쓴다 */
function NationFacts({ profile, cyborgs }: { profile: CreationNationProfile; cyborgs: number }) {
  const unknown = m.start_nation_unknown();
  const currency = profile.currency;
  const currencyMarks = currency ? [currency.symbol, currency.ticker].filter((mark) => mark !== null) : [];
  const facts: { readonly key: string; readonly label: string; readonly value: string }[] = [
    {
      key: "leader",
      label: m.start_nation_leader(),
      value: profile.leaderName ? localName(profile.leaderName) : unknown,
    },
    {
      key: "regime",
      label: m.start_nation_regime(),
      value: profile.regime ? regimeText(profile.regime) : unknown,
    },
    {
      key: "tax",
      label: m.start_nation_tax(),
      value: profile.taxBp === null ? unknown : taxText(profile.taxBp),
    },
    {
      key: "currency",
      label: m.start_nation_currency(),
      value: currency
        ? `${localName(currency.name)}${currencyMarks.length > 0 ? ` (${currencyMarks.join(" · ")})` : ""}`
        : unknown,
    },
    {
      key: "tech",
      label: m.start_nation_tech(),
      value:
        profile.tech === null ? unknown : m.start_nation_tech_value({ level: formatNumber(profile.tech) }),
    },
    { key: "cyborgs", label: m.start_nation_cyborgs(), value: formatNumber(cyborgs) },
  ];
  return (
    <span className="start-nation-facts" data-part="details">
      {facts.map((fact) => (
        <span key={fact.key} className="start-nation-fact" data-fact={fact.key}>
          <span className="start-nation-fact-label">{fact.label}</span>
          <span className="start-nation-fact-value">{fact.value}</span>
        </span>
      ))}
    </span>
  );
}

export function CityStep({
  faction,
  world,
  selected,
  onSelect,
}: {
  faction: CreationFaction;
  /** 1차맵 자리·둘레 땅(world.cities). 없으면 목록만 */
  world: WorldCitiesResponse | null;
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const id = useId();
  const placed = new Map((world?.cities ?? []).map((city) => [city.id, city]));
  // 이 국가의 시작 도시 가운데 1차맵 자리를 아는 것(지도에 그린다)
  const onMap = faction.cities.flatMap((city) => {
    const found = placed.get(city.id);
    return found ? [found] : [];
  });
  const chosen = selected === null ? undefined : placed.get(selected);
  return (
    <fieldset className="start-group">
      <legend className="visually-hidden">{m.start_step_city()}</legend>
      {world && onMap.length > 0 ? (
        <>
          <Suspense fallback={<p className="start-hint">{m.start_city_map_loading()}</p>}>
            <StartCityMap cities={onMap} factions={world.factions} selected={selected} onSelect={onSelect} />
          </Suspense>
          <p className="start-hint">{m.start_city_map_hint()}</p>
        </>
      ) : null}
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
                {startCityName(city)}
                <span className="start-badge" data-crowding={city.crowding}>
                  {crowdingText(city.crowding)}
                </span>
              </span>
              <span className="start-choice-meta">
                {m.start_city_started({ count: formatNumber(city.cyborgs) })}
              </span>
              <CityLandLine land={placed.get(city.id)?.land ?? null} />
            </span>
          </label>
        ))}
      </div>
      {/* 고른 도시의 둘레 땅(D-6041 "주변 자원·기후") */}
      {chosen ? (
        <section className="start-city-land" aria-label={m.start_city_land_title()} data-city={chosen.id}>
          <h3 className="start-city-land-title">{m.start_city_land_title()}</h3>
          <LandFacts land={chosen.land} />
        </section>
      ) : null}
      <p className="start-hint">{m.start_city_safe()}</p>
    </fieldset>
  );
}

/** 목록 한 줄의 둘레 땅 요약(바이옴·높이). 값이 없으면 줄이 없다 */
function CityLandLine({ land }: { land: Parameters<typeof landText>[0] | null }) {
  if (!land) return null;
  const line = landText(land);
  return <span className="start-choice-meta start-city-ground">{`${line.ground} · ${line.climate}`}</span>;
}

/** 요약·강하 캡슐 초상 크기(px) = --mark-lg */
const SUMMARY_PORTRAIT_PX = 72;

export function DescentStep({
  name,
  look,
  roll,
  faction,
  city,
  descending,
  elements,
}: {
  name: string;
  /** 고른 3D 외형(요약 초상은 이 외형을 그린 3D 썸네일, 그리는 동안·WebGL 없음이면 무늬 없는 실루엣) */
  look: CharacterLook;
  roll: CyborgRollView;
  faction: CreationFaction;
  city: CreationCity;
  descending: boolean;
  /** 속성 분배 요약 줄(elementsStep.tsx ElementsSummaryRow, D-450) */
  elements?: ReactNode;
}) {
  return (
    <div className="start-descent" data-descending={descending ? "true" : "false"}>
      <div className="start-summary">
        <CyborgPortrait look={look} sizePx={SUMMARY_PORTRAIT_PX} className="start-summary-avatar" />
        <div className="start-summary-text">
          <p className="start-summary-name">{name.trim()}</p>
          <p className="start-choice-meta">{temperamentText(roll.temperament)}</p>
        </div>
      </div>
      <dl className="start-summary-facts">
        <div>
          <dt>{m.start_step_stats()}</dt>
          <dd>
            {/* 두 칸씩 묶은 스탯(질문 181 가): 약자 칩 + 값(스탯 색). 읽는 이름은 "힘 12" */}
            <ul className="start-summary-stats">
              {PRIMARY_STAT_PAIRS.map((pair) => (
                <li key={pair.join("-")} className="start-summary-pair" data-pair={pair.join("-")}>
                  {pair.map((stat) => (
                    <span key={stat} className="start-summary-stat" data-stat={stat}>
                      <span className="stat-chip" translate="no" aria-hidden="true">
                        {primaryCode(stat)}
                      </span>
                      <span className="visually-hidden">{primaryLabel(stat)} </span>
                      <span className="start-summary-value">{formatNumber(roll.stats[stat])}</span>
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        {elements}
        <div>
          <dt>{m.start_step_faction()}</dt>
          <dd>{localName(faction.name)}</dd>
        </div>
        <div>
          <dt>{m.start_step_city()}</dt>
          <dd>{startCityName(city)}</dd>
        </div>
      </dl>
      <p className="start-hint">{m.start_descent_note()}</p>
      {descending ? (
        <div className="start-scene" role="status">
          <span className="start-scene-pod" aria-hidden="true">
            <CyborgPortrait
              look={look}
              framing="face"
              sizePx={SUMMARY_PORTRAIT_PX}
              className="start-scene-face"
            />
          </span>
          <span className="start-scene-text">{m.start_descent_scene()}</span>
        </div>
      ) : null}
    </div>
  );
}
