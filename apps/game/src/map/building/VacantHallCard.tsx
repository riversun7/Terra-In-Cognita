// 건물 판의 [주인 없는 정부 건물] 카드 — 사용자 결정 2026-11-25(docs/adr/2026-11-25-vacant-government-and-city-vote.md):
// "정부 건물을 건설가능하나 비활성상태, 소유가 없는 빈상태 … 그걸 차지한 가문이 소유한다".
// - 가문 없는 사람이 다 지은 정부 건물은 주인이 없고 비활성이다(도시가 아니다). 모두에게 그 상태를 알린다.
// - [차지하기]: 가문장이 그 2차맵에 사이보그 본체로 와서 누르면 그 가문이 이 정부로 도시를 세우고 건물 주인이 된다(WebSocket house_hall).
//   귀속(봉신)·독립과 체제를 고른다(나라에 들지 않은 가문은 독립만 — 서버가 본다). 판정은 서버.
import { HOUSE_CITY_MODES, HOUSE_REGIMES, type HouseCityMode, type HouseRegime } from "@terra/protocol";
import { useId, useState } from "react";
import { REGIME_NAMES } from "../../faction/factionText.ts";
import { sendHouseCity } from "../../faction/identity/houseCommands.ts";
import { HOUSE_CITY_ERROR_TEXT } from "../../faction/identity/houseText.ts";
import { m } from "../../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";

const MODE_TEXT = {
  vassal: m.build_claim_mode_nation,
  independent: m.build_claim_mode_independent,
} satisfies Record<HouseCityMode, () => string>;

export function VacantHallCard(props: {
  readonly buildingId: number;
  /** 차지한 뒤 건물 판을 다시 읽는다 */
  readonly onTaken: () => void;
}) {
  const { buildingId, onTaken } = props;
  const titleId = useId();
  const [mode, setMode] = useState<HouseCityMode>("independent");
  const [regime, setRegime] = useState<HouseRegime>("democracy");
  const [busy, setBusy] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();

  const take = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    notice.clear();
    problem.clear();
    try {
      const outcome = await sendHouseCity({
        t: "house_hall",
        buildingId,
        mode,
        ...(mode === "independent" ? { regime } : {}),
      });
      if (outcome.ok) {
        notice.show([m.vacant_hall_taken()]);
        onTaken();
        return;
      }
      // 이 명령에서 뜻이 다른 코드 셋은 따로 알린다
      problem.show([
        outcome.code === "unknown_ruin"
          ? m.vacant_hall_err_gone()
          : outcome.code === "bad_spot"
            ? m.vacant_hall_err_not_here()
            : outcome.code === "mode_locked"
              ? m.vacant_hall_err_mode()
              : HOUSE_CITY_ERROR_TEXT[outcome.code](),
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bp-card" aria-labelledby={titleId} data-part="building-vacant-hall">
      <h3 id={titleId} className="bp-card-title">
        {m.vacant_hall_title()}
      </h3>
      <p className="bp-muted">{m.vacant_hall_hint()}</p>
      <fieldset className="map-build-claim-choice" data-mode={mode}>
        <legend className="bp-muted">{m.build_claim_mode_label()}</legend>
        <div className="map-build-claim-options">
          {HOUSE_CITY_MODES.map((option) => (
            <label key={option} className="map-build-claim-option">
              <input
                type="radio"
                name={`${titleId}-mode`}
                value={option}
                checked={mode === option}
                disabled={busy}
                onChange={() => setMode(option)}
              />
              <span>{MODE_TEXT[option]()}</span>
            </label>
          ))}
        </div>
        {mode === "independent" ? (
          <label className="map-build-claim-option">
            <span>{m.build_claim_regime_label()}</span>
            <select
              className="input"
              value={regime}
              disabled={busy}
              onChange={(event) => {
                const next = HOUSE_REGIMES.find((value) => value === event.target.value);
                if (next) setRegime(next);
              }}
            >
              {HOUSE_REGIMES.map((value) => (
                <option key={value} value={value}>
                  {REGIME_NAMES[value]()}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="bp-muted">{m.build_claim_mode_note()}</p>
        )}
      </fieldset>
      <button
        type="button"
        className="button-small button-primary"
        data-part="vacant-hall-take"
        disabled={busy}
        onClick={() => void take()}
      >
        {m.vacant_hall_take()}
      </button>
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
    </section>
  );
}
