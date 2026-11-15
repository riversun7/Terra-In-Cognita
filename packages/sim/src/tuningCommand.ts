// 지휘관 정원 설정 칸 값 ↔ 계수표 — 49 C7("군단 크기 상한"), 기획 D-558(사용자 1543·1544 "군단은 3~10개 분대다. 능력은 스탯이 아니라, 환생시
// +1까지만, 전투계열 랭킹이나 해당국가 작위로 지휘가능한 분대수가 정해짐(군대 계급처럼)"), docs/adr/2026-10-31-combat-core.md "바뀜 (D-558)".
// 모두 [임시] 출발값이다(식은 combat/command.ts commandCapOf). D-549의 INT·WIS 지휘 점수 칸 넷은 지웠다(id-changes 114).
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
  ...[1, 2, 3, 4].map((tier, index) =>
    k(
      `c7_command_tier_${tier}`,
      `tierParties.${index}`,
      `지휘관 정원: 전투 랭킹 등급 ${tier}(파티 수)`,
      `Commander cap: combat ranking tier ${tier} (parties)`,
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
];
