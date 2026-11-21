// 나라 의결 칸의 군사 쿠데타(질문 2433 답·사용자 답 D-583 — 혁명군 대 정부군, 누구나 어느 편이든 든다). 일으키기(지배 가문이 아닌 소속 가문의 장, 설정 칸이
// 켜졌을 때)·참가 받는 중인 쿠데타에 편 들기·최근 결과. 자료는 tRPC governance.view(coups·canCoup), 명령은 WebSocket gov_coup·gov_coup_join.
// 바뀜(줄기 gov-coup — D-588 2492 가 "모든 도시에서 누구나"): 일으킬 도시를 고른다(기본 = 내 가문 자리 도시 → 수도, 서버가 정함). 쿠데타 카드에 싸우는 도시를 적는다.
import type { GovernanceResponse } from "@terra/shared/governance";
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { ActionRow, StateChip } from "../../sections/screenParts.tsx";
import { dateText, relativeText } from "../../sections/screenText.ts";
import type { GovernanceRequest } from "./governanceCommands.ts";
import { COUP_STATUS_TEXT, houseText } from "./governanceText.ts";

const TONE = { gathering: "warn", won: "bad", lost: "good", cancelled: "plain" } as const;

export function CoupSection({
  view,
  now,
  busy,
  run,
}: {
  view: GovernanceResponse;
  now: number;
  busy: boolean;
  run: (body: GovernanceRequest) => Promise<void>;
}) {
  const id = useId();
  // "" = 기본 도시(서버가 가문 자리 도시 → 수도로 정함)
  const [city, setCity] = useState("");
  if (!view.canCoup && view.coups.length === 0) return null;
  const cities = view.coupCities ?? [];
  const cityId = cities.find((row) => String(row.id) === city)?.id;
  return (
    <div className="gov-coups" data-testid="governance-coups">
      <span className="gov-sub">{m.gov_coup_title()}</span>
      {view.canCoup ? (
        <>
          {cities.length > 0 ? (
            <label className="gov-field" htmlFor={`${id}-city`}>
              <span className="faction-muted">{m.gov_coup_city()}</span>
              <select
                id={`${id}-city`}
                className="input"
                value={city}
                data-testid="governance-coup-city"
                onChange={(event) => setCity(event.target.value)}
              >
                <option value="">{m.gov_coup_city_default()}</option>
                {cities.map((row) => (
                  <option key={row.id} value={String(row.id)} translate="no">
                    {row.name ?? m.gov_coup_city_unnamed({ id: String(row.id) })}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <ActionRow>
            <button
              type="button"
              className="button-small"
              aria-disabled={busy}
              onClick={() => void run(cityId === undefined ? { t: "gov_coup" } : { t: "gov_coup", cityId })}
            >
              {m.gov_coup_start()}
            </button>
          </ActionRow>
        </>
      ) : null}
      {view.coups.length > 0 ? (
        <ul className="faction-list">
          {view.coups.map((coup) => (
            <li key={coup.id}>
              <article className="faction-item" data-closed={coup.status !== "gathering"}>
                <div className="faction-item-head">
                  <h3 className="faction-item-title" translate="no">
                    {m.gov_coup_house({ house: houseText(coup.house) })}
                  </h3>
                  <StateChip tone={TONE[coup.status]} label={COUP_STATUS_TEXT[coup.status]()} />
                </div>
                <p className="faction-vote-detail">
                  {m.gov_coup_sides({ rebels: String(coup.rebels), government: String(coup.government) })}
                </p>
                {coup.city ? (
                  <p className="faction-vote-detail">
                    {m.gov_coup_city_at()}{" "}
                    <span translate="no">
                      {coup.city.name ?? m.gov_coup_city_unnamed({ id: String(coup.city.id) })}
                    </span>
                  </p>
                ) : null}
                {coup.status === "gathering" ? (
                  <p className="faction-vote-detail">
                    {m.gov_coup_battle_at()}{" "}
                    <time
                      dateTime={new Date(coup.gatherUntilMs).toISOString()}
                      title={dateText(coup.gatherUntilMs)}
                    >
                      {relativeText(coup.gatherUntilMs, now)}
                    </time>
                  </p>
                ) : null}
                {coup.mySide ? (
                  <p className="faction-muted">
                    {coup.mySide === "rebel" ? m.gov_coup_side_rebel() : m.gov_coup_side_government()}
                  </p>
                ) : null}
                {coup.status === "gathering" ? (
                  <ActionRow>
                    <button
                      type="button"
                      className="button-small"
                      aria-disabled={busy}
                      aria-pressed={coup.mySide === "rebel"}
                      onClick={() => void run({ t: "gov_coup_join", coupId: coup.id, side: "rebel" })}
                    >
                      {m.gov_coup_join_rebel()}
                    </button>
                    <button
                      type="button"
                      className="button-small"
                      aria-disabled={busy}
                      aria-pressed={coup.mySide === "government"}
                      onClick={() => void run({ t: "gov_coup_join", coupId: coup.id, side: "government" })}
                    >
                      {m.gov_coup_join_government()}
                    </button>
                  </ActionRow>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
