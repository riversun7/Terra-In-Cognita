// NPC 도시 성장의 성향 변수 — 기획 D-554(1187·1188 "더 자유롭게 해라 세력성향마다 지도자 성향마다 다양한 변수로 조정")·D-572(질문 1995 —
// "고정 상한 표 남은 것 성향 변수로 고침"). docs/adr/2026-11-11-city-building-layout.md "바뀜 (D-572)".
// 채집 6의 기르는 티어 성향(npcGatherTier.ts tierTemperOf)과 같은 축·같은 지도자 기질(leaderTemperOf — 세력마다 하나, 저장 없음)을 쓴다:
// - 건물 수 상한(1187): 도시 등급 표(npc_build_cap_l1~l6)는 바탕이고, 그 위에 성향 몫 = 치우침 × 칸 npc_build_cap_temper ÷ 1000(채, 0 쪽으로 버림).
//   치우침(‰, −1000~1000) = 상업 성향 × 칸 npc_build_cap_commerce(축 가운데에서 벗어난 몫, 끝에서 칸 값) + 지도자 기질 × 칸
//   npc_build_cap_leader ÷ 1000. 상업이 높고 지도자가 모험적이면 도시가 더 크게, 반대면 작게 자란다.
// - 숙소 성장(1188): 몫 = 신앙 성향 × 칸 npc_build_lodging_faith − 상업 성향 × 칸 npc_build_lodging_commerce(축 끝에서 칸 값). npc/build.ts가
//   + 몫은 생필품 문턱을 낮추고(1000 − 몫 ÷ 2‰ — 신앙이 높으면 조금 모자라도 숙소), − 몫은 붐빔 숙소 점수 700을 −90까지 내린다(상업이 높으면
//   나라 목표 시설이 먼저). 양쪽이 같은 크기로 듣게 맞췄다(질문 2127 — build16 30일 시드 1~4 평균 건물 −0.3%·휴먼 +1.5%).
// 칸이 모두 0이면 옛 판(등급 표 그대로·붐빔 숙소 700)과 같다. 정수만 쓴다(판정 결정성).
import type { NpcCoefficients } from "../npc/coefficients.ts";
import type { Traits } from "../npc/traits.ts";
import { axisTilt, leaderTemperOf } from "./npcGatherTier.ts";

/** 치우침 끝(‰) */
const BIAS_LIMIT = 1000;

/** 도시 성장 성향 몫(세력 하나) */
export interface GrowthTemper {
  /** 건물 수 상한에 더하는 채(− 가능) */
  readonly capDelta: number;
  /** 붐빔 숙소 점수에 더하는 값(− 가능) */
  readonly lodgingTilt: number;
}

/** 성향 몫이 없음(옛 판) */
export const NO_GROWTH_TEMPER: GrowthTemper = { capDelta: 0, lodgingTilt: 0 };

/** 세력 하나의 도시 성장 성향 몫(머리 주석). seed = 세계 시드 */
export function growthTemperOf(
  seed: number,
  faction: { readonly id: number; readonly traits: Traits; readonly leaderPm?: number | undefined },
  c: NpcCoefficients,
): GrowthTemper {
  const temperCount = Math.max(0, Math.trunc(c.buildCapTemper ?? 0));
  const leaderPm = Math.trunc(c.buildCapLeaderPm ?? 0);
  const raw =
    axisTilt(faction.traits.commerce, c.buildCapCommercePm, c) +
    (leaderPm === 0 ? 0 : Math.trunc((leaderTemperOf(seed, faction, c) * leaderPm) / 1000));
  const bias = Math.max(-BIAS_LIMIT, Math.min(BIAS_LIMIT, raw));
  const tilt =
    axisTilt(faction.traits.faith, c.buildLodgingFaith, c) -
    axisTilt(faction.traits.commerce, c.buildLodgingCommerce, c);
  // −0은 0으로(같은 값이 같은 모양으로 비교되게)
  return { capDelta: Math.trunc((bias * temperCount) / 1000) + 0, lodgingTilt: tilt + 0 };
}
