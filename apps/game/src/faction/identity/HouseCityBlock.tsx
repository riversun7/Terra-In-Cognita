// 세력 화면 "내 가문" 칸의 가문 도시 부분(질문 1005 가 — 마을 세우기와 폐허 복원이 같은 봉신·독립 고르기, D-340·D-339).
// 상태(아직 / 봉신 / 독립 + 체제)·가문 도시 목록, 가문장이면 처음 고르기(봉신 | 독립 + 체제)·마을 세우기(서버가 고른 내 사이보그 둘레 자리)·
// 내가 주인인 폐허를 가문 도시로, 가문 도시 구인(HouseRecruitBlock.tsx, 질문 1041 다). 자료는 tRPC factionIdentity.house의 house.city, 명령은 WebSocket(houseCommands.ts sendHouseCity, 프로토콜 24).
// 봉신 가문이면 독립 선언(D-575 — 가문 도시가 모두 알박기로 선 도시일 때 열림, 프로토콜 62 house_independence).
// docs/adr/2026-11-11-house-village.md
import type { HouseRegime } from "@terra/protocol";
import type { HouseCityView } from "@terra/shared/house";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { HouseRecruitBlock } from "./HouseRecruitBlock.tsx";
import { type HouseCityRequest, sendHouseCity } from "./houseCommands.ts";
import { HOUSE_CITY_ERROR_TEXT } from "./houseText.ts";

type Status = { readonly tone: "ok" | "error"; readonly text: string } | null;

const REGIME_TEXT: Readonly<Record<HouseRegime, () => string>> = {
  dictatorship: m.faction_regime_dictatorship,
  democracy: m.faction_regime_democracy,
  capitalism: m.faction_regime_capitalism,
};
const REGIMES: readonly HouseRegime[] = ["democracy", "capitalism", "dictatorship"];

function statusText(city: HouseCityView): string {
  if (city.status === "vassal") return m.fid_city_status_vassal();
  if (city.status === "independent")
    return m.fid_city_status_independent({ regime: REGIME_TEXT[city.regime ?? "democracy"]() });
  return m.fid_city_status_none();
}

export function HouseCityBlock({
  city,
  leader,
  onChanged,
}: {
  city: HouseCityView;
  leader: boolean;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"vassal" | "independent">("vassal");
  const [regime, setRegime] = useState<HouseRegime>("democracy");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  // 이미 고른 가문은 그 상태로 보낸다(서버가 다르면 mode_locked)
  const chosen = city.status ?? mode;
  const choice =
    chosen === "independent" ? { mode: chosen, regime: city.regime ?? regime } : { mode: chosen };
  const run = async (body: HouseCityRequest, done: () => string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await sendHouseCity(body);
      setStatus(
        outcome.ok
          ? { tone: "ok", text: done() }
          : { tone: "error", text: HOUSE_CITY_ERROR_TEXT[outcome.code]() },
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fid-house-block" data-testid="house-city" data-status={city.status ?? "none"}>
      <h3 className="fid-house-sub">{m.fid_city_title()}</h3>
      <p className="faction-muted">{statusText(city)}</p>
      {city.cities.length === 0 ? null : (
        <ul className="fid-house-list">
          {city.cities.map((row) => (
            <li key={row.id} className="fid-house-row" data-city={row.id}>
              <span className="fid-house-row-main">
                <span className="fid-house-row-name" translate="no">
                  {row.name ?? m.fid_city_name_fallback({ id: String(row.id) })}
                </span>
                <span className="faction-muted">{m.fid_city_place({ x: row.x, y: row.y })}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {city.recruit ? (
        <HouseRecruitBlock recruit={city.recruit} names={city.cities} leader={leader} onChanged={onChanged} />
      ) : null}
      {!leader ? (
        <p className="faction-muted">{m.fid_city_member_note()}</p>
      ) : !city.ready ? (
        <p className="faction-muted">{m.fid_city_not_ready()}</p>
      ) : (
        <>
          {city.status === "vassal" && city.independence ? (
            <div className="fid-city-action" data-testid="house-independence" data-state={city.independence}>
              <span className="fid-house-sub">{m.fid_city_independence_title()}</span>
              <span className="faction-muted">
                {city.independence === "open"
                  ? m.fid_city_independence_hint()
                  : m.fid_city_error_independence_blocked()}
              </span>
              {city.independence === "open" ? (
                <>
                  <label className="fid-city-option">
                    <span>{m.fid_city_regime()}</span>
                    <select
                      className="input"
                      value={regime}
                      onChange={(event) => {
                        const next = REGIMES.find((value) => value === event.target.value);
                        if (next) setRegime(next);
                      }}
                    >
                      {REGIMES.map((value) => (
                        <option key={value} value={value}>
                          {REGIME_TEXT[value]()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="button-small button-primary"
                    aria-disabled={busy}
                    onClick={() =>
                      void run({ t: "house_independence", regime }, m.fid_city_done_independence)
                    }
                  >
                    {m.fid_city_independence_declare()}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          {city.status === null ? (
            <fieldset className="fid-city-choice">
              <legend className="fid-house-sub">{m.fid_city_choose()}</legend>
              <label className="fid-city-option">
                <input
                  type="radio"
                  name="fid-city-mode"
                  checked={mode === "vassal"}
                  onChange={() => setMode("vassal")}
                />
                <span>{m.fid_city_mode_vassal()}</span>
              </label>
              <label className="fid-city-option">
                <input
                  type="radio"
                  name="fid-city-mode"
                  checked={mode === "independent"}
                  onChange={() => setMode("independent")}
                />
                <span>{m.fid_city_mode_independent()}</span>
              </label>
              {mode === "independent" ? (
                <label className="fid-city-option">
                  <span>{m.fid_city_regime()}</span>
                  <select
                    className="input"
                    value={regime}
                    onChange={(event) => {
                      const next = REGIMES.find((value) => value === event.target.value);
                      if (next) setRegime(next);
                    }}
                  >
                    {REGIMES.map((value) => (
                      <option key={value} value={value}>
                        {REGIME_TEXT[value]()}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </fieldset>
          ) : null}
          <div className="fid-city-action">
            <span className="fid-house-sub">{m.fid_city_village_title()}</span>
            <span className="faction-muted">
              {city.site
                ? m.fid_city_village_site({ x: city.site.x, y: city.site.y })
                : m.fid_city_village_no_site()}
            </span>
            <span className="faction-muted">
              {m.fid_city_village_cost({ cost: city.villageCost, housing: city.villageHousing })}
            </span>
            {city.site ? (
              <button
                type="button"
                className="button-small button-primary"
                aria-disabled={busy}
                data-testid="house-village-found"
                onClick={() => {
                  const site = city.site;
                  if (site)
                    void run(
                      { t: "house_village", ...site, cost: city.villageCost, ...choice },
                      m.fid_city_done_village,
                    );
                }}
              >
                {m.fid_city_village_found()}
              </button>
            ) : null}
          </div>
          {city.ruins.length === 0 ? null : (
            <div className="fid-city-action" data-testid="house-city-ruins">
              <span className="fid-house-sub">{m.fid_city_ruins_title()}</span>
              <span className="faction-muted">{m.fid_city_ruin_hint()}</span>
              <ul className="fid-house-list">
                {city.ruins.map((ruin) => (
                  <li key={ruin.id} className="fid-house-row" data-ruin={ruin.id}>
                    <span className="fid-house-row-main" translate="no">
                      {ruin.name ?? m.fid_city_name_fallback({ id: String(ruin.id) })}
                    </span>
                    <button
                      type="button"
                      className="button-small"
                      aria-disabled={busy}
                      onClick={() =>
                        void run({ t: "house_ruin", ruinId: ruin.id, ...choice }, m.fid_city_done_ruin)
                      }
                    >
                      {m.fid_city_ruin_join()}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
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
