// 지휘관 정원 설정 칸 값 ↔ 계수표 — 49 C7("군단 크기 상한"), 기획 D-558(사용자 1543·1544 "군단은 3~10개 분대다. 능력은 스탯이 아니라, 환생시
// +1까지만, 전투계열 랭킹이나 해당국가 작위로 지휘가능한 분대수가 정해짐(군대 계급처럼)"), docs/adr/2026-10-31-combat-core.md "바뀜 (D-558)".
// 모두 [임시] 출발값이다(식은 combat/command.ts commandCapOf). D-549의 INT·WIS 지휘 점수 칸 넷은 지웠다(id-changes 114).
// D-571(답 1962 "작위로만"): 전투 랭킹 등급 표 칸 넷(c7_command_tier_*)을 지웠다(id-changes 124 — 랭킹은 승계 순서에만). 같은 줄기에서 AI 전개
// 방식 수(답 1963 → 설정 칸, combat/tactics.ts)와 명성 → 작위 문턱(49 S18, society/renown.ts)을 더했다.
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "C7",
  target: "combat",
  path: `command.${path}`,
  structural: false,
  ko,
  en,
});

const tactic = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id: `d558_tactic_${id}`,
  code: "",
  target: "combat",
  path: `tactics.${path}`,
  structural: false,
  ko: `전개 방식: ${ko}`,
  en: `Tactic: ${en}`,
});

/** AI 전개 방식 수(D-558 2차, 답 1963) */
const TACTIC_KEYS: readonly TuningKey[] = [
  tactic("defend_radius", "defendRadius", "수비 집중 닻 둘레(칸)", "defend anchor radius (cells)"),
  tactic(
    "backline_range",
    "backlineRange",
    "후방 침투 뒤쪽 적 사거리(칸)",
    "infiltrate backline range (cells)",
  ),
  tactic("delay_gap", "delayGap", "지연전 물러나는 거리(사거리 + 칸)", "delay retreat gap (range + cells)"),
  tactic("harass_min_range", "harassMinRange", "견제하는 유닛 사거리(칸)", "harass minimum range (cells)"),
  tactic(
    "flank_turn_pm",
    "flankTurnPm",
    "측면 우회 → 돌격 지점(지도 ‰)",
    "flank turns to assault at (map ‰)",
  ),
  tactic("lane_divisor", "laneDivisor", "중앙·측면 길 나눗수", "centre and flank lane divisor"),
];

/** 명성 → 작위 문턱(49 S18, D-326)·방어 명성 */
const RENOWN_KEYS: readonly TuningKey[] = [
  ...(
    [
      ["citizen", "시민", "citizen"],
      ["merit", "공훈자", "meritorious"],
      ["knight", "기사", "knight"],
      ["lord", "영주", "lord"],
      ["duke", "대공", "grand duke"],
    ] as const
  ).map(
    ([id, ko, en], index): TuningKey => ({
      id: `s18_title_${id}`,
      code: "S18",
      target: "society",
      path: `renown.titleRenown.${index}`,
      structural: false,
      ko: `작위 문턱: ${ko}(나라 명성)`,
      en: `Title threshold: ${en} (nation renown)`,
    }),
  ),
  {
    id: "d326_renown_defense",
    code: "",
    target: "society",
    path: "renown.defenseRenown",
    structural: false,
    ko: "명성: 방어 한 번(수비 편 승리)",
    en: "Renown: one defence (defending side wins)",
  },
];

/** 작위 단계(D-326) — 칸 ID 끝 · 이름 */
const TITLES: readonly (readonly [string, string, string])[] = [
  ["commoner", "민간인", "commoner"],
  ["citizen", "시민", "citizen"],
  ["merit", "공훈자", "meritorious"],
  ["knight", "기사", "knight"],
  ["lord", "영주", "lord"],
  ["duke", "대공", "grand duke"],
];

export const COMMAND_TUNING_KEYS: readonly TuningKey[] = [
  ...TITLES.map(([id, ko, en], index) =>
    k(
      `c7_command_title_${id}`,
      `titleParties.${index}`,
      `지휘관 정원: 작위 ${ko}(파티 수)`,
      `Commander cap: title ${en} (parties)`,
    ),
  ),
  k(
    "c7_command_rebirth",
    "rebirthBonus",
    "지휘관 정원: 환생 덤(파티 수)",
    "Commander cap: rebirth bonus (parties)",
  ),
  k("c7_command_min", "min", "지휘관 정원: 아래 끝(파티 수)", "Commander cap: minimum (parties)"),
  k("c7_command_max", "max", "지휘관 정원: 위 끝(파티 수)", "Commander cap: maximum (parties)"),
  ...TACTIC_KEYS,
  ...RENOWN_KEYS,
];
