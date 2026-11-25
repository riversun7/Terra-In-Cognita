// 짓는 중인 알박기 정부 건물의 고르기 바꾸기 칸(기획 D-577 — "정부 건물 완성 때 발효 … 완성 전에는 언제든 바꿀 수 있게") — 경제 화면 내 시설 카드
// (FacilityCards.tsx)가 그 시설에 landClaim이 있을 때 그린다. 지금 고르기(서버 값)를 보이고 "소속 국가로 귀속 | 독립"(가문 독립이면 체제도)을 바꿔
// [고르기 바꾸기]를 누르면 WebSocket facility_claim(프로토콜 54)을 보낸다. 다 지어질 때 그때의 고르기로 도시가 선다.
// - 1인 독재 도시(kind personal)는 체제를 고르지 않는다(늘 독재). 가문이 이미 봉신·독립을 정했으면(locked) 고르지 않고 그 상태만 알린다.
// - 결과 문구·자료 다시 받기는 카드의 run(경제 화면 공통)이 한다.
import {
  LAND_CLAIM_REGIMES,
  type FacilityView,
  type LandClaimMode,
  type LandClaimRegime,
} from "@terra/shared/facilities";
import { useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { CLAIM_MODE_TEXT, CLAIM_REGIME_TEXT } from "./claimText.ts";
import type { FacilityRun } from "./facilityText.ts";

export function ClaimChoice({
  facility,
  run,
  busy,
}: {
  facility: FacilityView;
  run: FacilityRun;
  busy: boolean;
}) {
  const claim = facility.landClaim;
  const name = useId();
  const [mode, setMode] = useState<LandClaimMode>(claim?.choice.mode ?? "nation");
  const [regime, setRegime] = useState<LandClaimRegime>(claim?.choice.regime ?? "democracy");
  if (!claim) return null;
  if (claim.locked !== null)
    return (
      <p className="eco-footnote" data-part="facility-claim-locked" data-locked={claim.locked}>
        {claim.locked === "vassal" ? m.build_claim_locked_vassal() : m.build_claim_locked_independent()}
      </p>
    );
  // 가문 없는 사람이 짓는 정부는 다 지으면 주인 없는 비활성 상태가 된다(사용자 결정 2026-11-25): 고를 것이 없고 그 안내만 보인다
  if (claim.kind === "personal")
    return (
      <p className="eco-footnote" data-part="facility-claim-vacant">
        {m.build_claim_personal()}
      </p>
    );
  const sentRegime: LandClaimRegime = regime;
  const changed =
    mode !== claim.choice.mode || (mode === "independent" && sentRegime !== claim.choice.regime);
  return (
    <fieldset className="facility-claim" data-part="facility-claim" data-mode={claim.choice.mode}>
      <legend className="eco-row-meta">{m.build_claim_mode_label()}</legend>
      <p className="eco-footnote">{m.facility_claim_now({ choice: CLAIM_MODE_TEXT[claim.choice.mode]() })}</p>
      <p className="eco-footnote">{m.build_claim_effect_warning()}</p>
      <div className="facility-claim-options">
        {(["nation", "independent"] as const).map((option) => (
          <label key={option} className="facility-claim-option">
            <input
              type="radio"
              name={name}
              value={option}
              checked={mode === option}
              onChange={() => setMode(option)}
            />
            <span>{CLAIM_MODE_TEXT[option]()}</span>
          </label>
        ))}
      </div>
      {mode === "independent" ? (
        <label className="facility-claim-option">
          <span>{m.build_claim_regime_label()}</span>
          <select
            className="input"
            value={regime}
            onChange={(event) => {
              const next = LAND_CLAIM_REGIMES.find((value) => value === event.target.value);
              if (next) setRegime(next);
            }}
          >
            {LAND_CLAIM_REGIMES.map((value) => (
              <option key={value} value={value}>
                {CLAIM_REGIME_TEXT[value]()}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="eco-footnote">{m.build_claim_mode_note()}</p>
      )}
      <button
        type="button"
        className="button-small"
        disabled={busy || !changed}
        onClick={() =>
          void run({
            t: "facility_claim",
            buildingId: facility.buildingId,
            claim: mode === "independent" ? { mode, regime: sentRegime } : { mode },
          })
        }
      >
        {m.facility_claim_save()}
      </button>
    </fieldset>
  );
}
