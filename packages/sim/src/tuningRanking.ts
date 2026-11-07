// 랭킹 설정 칸 값 ↔ 계수표 — 기획 20 §8(D-037·D-041·D-042), docs/adr/2026-11-07-ranking.md. 49에 칸이 없어 코드는 비운다.
// 모두 [임시] 출발값이다(D-515: 수치는 밸런싱 단계, 기술은 출발값만). 서버 랭킹 집계가 집계마다 읽는다.
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string, structural = false): TuningKey => ({
  id,
  code: "",
  target: "society",
  path,
  structural,
  ko,
  en,
});

const TIERS: readonly (readonly [number, string])[] = [
  [0, "1"],
  [1, "2"],
  [2, "3"],
  [3, "4"],
];

export const RANKING_TUNING_KEYS: readonly TuningKey[] = [
  k("ranking_period", "ranking.periodMs", "랭킹 집계 주기(ms)", "Ranking period (ms)", true),
  k("ranking_decay", "ranking.decayPm", "랭킹 점수 감쇠(집계마다 ‰)", "Ranking score decay (‰ per period)"),
  ...TIERS.map(([index, label]) =>
    k(
      `ranking_tier_${label}`,
      `ranking.tiersPm.${index}`,
      `백분위 등급 ${label} 문턱(상위 ‰)`,
      `Percentile tier ${label} cut (top ‰)`,
    ),
  ),
  k("ranking_top_ranks", "ranking.topRanks", "최상위 표시 순위(1…n)", "Top ranks shown (1…n)"),
  k(
    "ranking_underdog_cap",
    "ranking.underdogCapPm",
    "전투 승리 언더독 배율 상한(‰)",
    "Battle win underdog cap (‰)",
  ),
  k(
    "ranking_faction_city",
    "ranking.faction.cityPoints",
    "세력 판: 도시 하나 점수",
    "Faction board: points per city",
  ),
  k(
    "ranking_faction_development",
    "ranking.faction.developmentPoints",
    "세력 판: 도시 발전도 1점 점수",
    "Faction board: points per development",
  ),
  k(
    "ranking_faction_human",
    "ranking.faction.humanPoints",
    "세력 판: 휴먼 하나 점수",
    "Faction board: points per human",
  ),
  k(
    "ranking_faction_treasury_unit",
    "ranking.faction.treasuryUnit",
    "세력 판: 국고 몇 단위가 1점(최소 단위)",
    "Faction board: treasury per point (minor units)",
  ),
];
