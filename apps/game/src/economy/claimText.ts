// 빈 2차맵 알박기 고르기 문구(기획 D-574·D-577) — 건축 시트(map/construction/BuildSheet.tsx)와 짓는 중 시설 카드(ClaimChoiceParts.tsx)가 함께 쓴다.
import type { LandClaimMode, LandClaimRegime } from "@terra/shared/facilities";
import { m } from "../paraglide/messages.js";

export const CLAIM_MODE_TEXT: Readonly<Record<LandClaimMode, () => string>> = {
  nation: m.build_claim_mode_nation,
  independent: m.build_claim_mode_independent,
};

export const CLAIM_REGIME_TEXT: Readonly<Record<LandClaimRegime, () => string>> = {
  dictatorship: m.build_claim_regime_dictatorship,
  democracy: m.build_claim_regime_democracy,
  capitalism: m.build_claim_regime_capitalism,
};
