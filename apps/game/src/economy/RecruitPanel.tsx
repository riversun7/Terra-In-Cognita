// 구인 칸(생산 칸, 건물 칸 다음) — 정부기관(행정 건물) 구인 카드로 휴먼을 고용한다(기획 D-469, 60_UX §7.1 ③ "첫 유닛 고용·직무 배치").
// docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산". 개발자 구인 화면(/dev/recruit)과 같은 서버 명령을 쓴다:
// tRPC recruit.board(도시·카드·잔고) → WebSocket recruit_hire(프로토콜 7). 판정(값·산 칸·자리)은 서버가 하고, 화면은 단추만 막는다.
// - 도시: 기본은 내 시작 도시(서버가 고른다). 구인 도시가 여럿이면 고른다. [임시] 어느 도시에서든 고용한다(서버 규칙 그대로).
// - 카드: 토탈·스탯 묶음(STR·VIT / INT·WIS / DEX·AGI, D-448)·속성·값과 [고용]. 고용하면 건물 칸의 채집 시설 카드에서 직무 배치한다.
import type { RecruitCardView } from "@terra/shared/recruit";
import { useState } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { RECRUIT_RESULT_TEXT, sendRecruitHire } from "../recruit/recruitCommands.ts";
import { RECRUIT_STAT_PAIRS, activeElements, hireState, refreshLeft } from "../recruit/recruitModel.ts";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { Loaded } from "./parts.tsx";
import { useFacilities, useLabor, useRecruitBoard } from "./queries.ts";
import "./recruit.css";

const STAT_CODE = {
  str: m.roster_stat_str_code,
  vit: m.roster_stat_vit_code,
  int: m.roster_stat_int_code,
  wis: m.roster_stat_wis_code,
  dex: m.roster_stat_dex_code,
  agi: m.roster_stat_agi_code,
} as const;

const ELEMENT_NAME = {
  water: m.cyborg_element_water,
  fire: m.cyborg_element_fire,
  wind: m.cyborg_element_wind,
  earth: m.cyborg_element_earth,
} as const;

function CardStats({ card }: { card: RecruitCardView }) {
  return (
    <div className="recruit-stats">
      {RECRUIT_STAT_PAIRS.map((pair) => (
        <span key={pair.join("-")} className="recruit-pair">
          {pair.map((stat) => (
            <span key={stat} className="recruit-stat" data-stat={stat}>
              <span className="recruit-stat-code">{STAT_CODE[stat]()}</span>
              <span className="eco-num">{card.stats[stat]}</span>
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

function elementText(card: RecruitCardView): string {
  return activeElements(card)
    .map((entry) => m.dev_recruit_element({ name: ELEMENT_NAME[entry.element](), value: entry.value }))
    .join(" · ");
}

export function RecruitPanel() {
  const [city, setCity] = useState("");
  const board = useRecruitBoard([city]);
  const live = useLiveLines();
  const [tone, setTone] = useState<"success" | "error">("success");
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const locale = getLocale() === "en" ? "en" : "ko";
  const money = (value: string): string => new Intl.NumberFormat(locale).format(BigInt(value));
  return (
    <section className="panel labor recruit" aria-labelledby="recruit-title" data-part="recruit">
      <h2 id="recruit-title" className="eco-section-title">
        {m.recruit_title()}
      </h2>
      <p className="eco-footnote">{m.recruit_intro()}</p>
      <Loaded view={board}>
        {(loaded) => {
          if (loaded.cities.length === 0 || loaded.cityId === null)
            return <p className="eco-empty">{m.recruit_no_cities()}</p>;
          const cityId = loaded.cityId;
          const left = refreshLeft(loaded.endsAtMs, loaded.generatedAt);
          const hire = async (card: RecruitCardView): Promise<void> => {
            if (busySlot !== null) return;
            setBusySlot(card.slot);
            const outcome = await sendRecruitHire({
              cityId,
              window: loaded.window,
              slot: card.slot,
              cost: card.cost,
            });
            setBusySlot(null);
            setTone(outcome.ok ? "success" : "error");
            live.show([
              outcome.ok ? m.recruit_hired({ unit: outcome.unitId }) : RECRUIT_RESULT_TEXT[outcome.code](),
            ]);
            board.refresh();
            // 새 휴먼이 직무 배치·노동 계약 유닛 목록에 든다
            useFacilities.refreshAll();
            useLabor.refreshAll();
          };
          return (
            <>
              {loaded.cities.length > 1 ? (
                <label className="eco-field">
                  <span>{m.recruit_field_city()}</span>
                  <select
                    className="eco-select"
                    value={String(cityId)}
                    onChange={(event) => setCity(event.target.value)}
                  >
                    {loaded.cities.map((entry) => (
                      <option key={entry.id} value={String(entry.id)}>
                        {entry.start
                          ? m.recruit_city_start({ id: entry.id, level: entry.adminLevel })
                          : m.recruit_city({ id: entry.id, level: entry.adminLevel })}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <p className="eco-have" data-part="recruit-meta">
                {m.recruit_meta({
                  id: cityId,
                  level: loaded.level,
                  amount: money(loaded.balance),
                  hours: left.hours,
                  minutes: left.minutes,
                })}
              </p>
              {loaded.hasCyborg ? null : <p className="eco-footnote">{m.dev_recruit_need_cyborg()}</p>}
              {loaded.cards.length === 0 ? (
                <p className="eco-empty">{m.recruit_no_cards()}</p>
              ) : (
                <ul className="recruit-cards">
                  {loaded.cards.map((card) => {
                    const state = hireState(card, loaded.balance, loaded.hasCyborg);
                    const titleId = `recruit-card-${card.slot}`;
                    return (
                      <li
                        key={card.slot}
                        className="recruit-card"
                        data-state={state}
                        data-part="recruit-card"
                      >
                        <div className="facility-head">
                          <span id={titleId} className="eco-row-title">
                            {m.recruit_card_title({ level: card.level, total: card.total })}
                          </span>
                          <span className="eco-tag">{m.dev_recruit_cost({ amount: money(card.cost) })}</span>
                        </div>
                        <CardStats card={card} />
                        {activeElements(card).length > 0 ? (
                          <p className="eco-row-meta">{elementText(card)}</p>
                        ) : null}
                        <div className="labor-actions">
                          {state === "funds" ? (
                            <span className="eco-footnote">{m.dev_recruit_err_funds()}</span>
                          ) : null}
                          <button
                            type="button"
                            className="button-small"
                            aria-describedby={titleId}
                            disabled={state !== "ready" || busySlot !== null}
                            aria-busy={busySlot === card.slot}
                            onClick={() => void hire(card)}
                          >
                            {state === "taken" ? m.dev_recruit_taken() : m.dev_recruit_hire()}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          );
        }}
      </Loaded>
      <LiveMessage tone={tone} lines={live.lines} version={live.version} />
    </section>
  );
}
