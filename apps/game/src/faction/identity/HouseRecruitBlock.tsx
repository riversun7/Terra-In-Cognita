// 가문 도시 구인 칸(질문 1041 다, 기획 D-533 "자동 구인") — "내 가문" 가문 도시 부분 아래. 자동 구인 상태(켜면 나라 NPC와 같은 구인 규칙식이
// 주거까지 가문 국고로 산다), 가문 도시마다 주민·주거, 가문장이면 [자동 구인 끄기/켜기]와 지금 창 카드 [사기](국고가 모자라면 가문장 지갑 —
// 질문 1097 [임시]). 자료는 tRPC factionIdentity.house의 house.city.recruit, 명령은 WebSocket(houseCommands.ts sendHouseRecruit, 프로토콜 25).
// docs/adr/2026-11-11-house-village.md "바뀜 (2026-11-12)"
import type { HouseCityRow, HouseRecruitView } from "@terra/shared/house";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { type HouseRecruitRequest, sendHouseRecruit } from "./houseCommands.ts";
import { HOUSE_RECRUIT_ERROR_TEXT } from "./houseText.ts";

type Status = { readonly tone: "ok" | "error"; readonly text: string } | null;

export function HouseRecruitBlock({
  recruit,
  names,
  leader,
  onChanged,
}: {
  recruit: HouseRecruitView;
  /** 가문 도시 줄(이름) */
  names: readonly HouseCityRow[];
  leader: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const run = async (body: HouseRecruitRequest): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await sendHouseRecruit(body);
      if (!outcome.ok) setStatus({ tone: "error", text: HOUSE_RECRUIT_ERROR_TEXT[outcome.code]() });
      else if (body.t === "house_recruit_auto")
        setStatus({ tone: "ok", text: outcome.auto ? m.fid_recruit_done_on() : m.fid_recruit_done_off() });
      else
        setStatus({
          tone: "ok",
          text: outcome.payer === "leader" ? m.fid_recruit_done_leader() : m.fid_recruit_done_treasury(),
        });
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const nameOf = (id: number): string =>
    names.find((row) => row.id === id)?.name ?? m.fid_city_name_fallback({ id: String(id) });
  return (
    <div className="fid-city-action" data-testid="house-recruit" data-auto={recruit.auto ? "on" : "off"}>
      <span className="fid-house-sub">{m.fid_recruit_title()}</span>
      <span className="faction-muted">{m.fid_recruit_auto_label()}</span>
      <span>{recruit.auto ? m.fid_recruit_auto_on() : m.fid_recruit_auto_off()}</span>
      <span className="faction-muted">
        {m.fid_recruit_treasury({ treasury: recruit.treasury })}
        {recruit.leaderWallet === null
          ? null
          : ` · ${m.fid_recruit_wallet({ wallet: recruit.leaderWallet })}`}
      </span>
      {leader ? (
        <button
          type="button"
          className="button-small"
          aria-disabled={busy}
          data-testid="house-recruit-auto"
          onClick={() => void run({ t: "house_recruit_auto", on: !recruit.auto })}
        >
          {recruit.auto ? m.fid_recruit_turn_off() : m.fid_recruit_turn_on()}
        </button>
      ) : (
        <span className="faction-muted">{m.fid_recruit_member_note()}</span>
      )}
      <ul className="fid-house-list">
        {recruit.cities.map((city) => (
          <li key={city.id} className="fid-house-row" data-recruit-city={city.id}>
            <span className="fid-house-row-main">
              <span className="fid-house-row-name" translate="no">
                {nameOf(city.id)}
              </span>
              <span className="faction-muted">
                {m.fid_recruit_city({ population: city.population, housing: city.housing })}
              </span>
            </span>
            {city.cards.length === 0 ? null : (
              <ul className="fid-house-list">
                {city.cards.map((card) => (
                  <li key={card.slot} className="fid-house-row" data-slot={card.slot}>
                    <span className="fid-house-row-main">
                      {m.fid_recruit_card({ level: card.level, total: card.total, cost: card.cost })}
                    </span>
                    {card.taken ? (
                      <span className="faction-muted">{m.fid_recruit_taken()}</span>
                    ) : (
                      <button
                        type="button"
                        className="button-small"
                        aria-disabled={busy}
                        onClick={() =>
                          void run({
                            t: "house_recruit_hire",
                            cityId: city.id,
                            window: recruit.window,
                            slot: card.slot,
                            cost: card.cost,
                          })
                        }
                      >
                        {m.fid_recruit_buy()}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {leader ? <span className="faction-muted">{m.fid_recruit_pay_note()}</span> : null}
      {status ? (
        <p
          className={status.tone === "ok" ? "fid-house-status" : "fid-house-status fid-house-status-error"}
          role={status.tone === "ok" ? "status" : "alert"}
        >
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
