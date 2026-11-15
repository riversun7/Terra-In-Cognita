// 지휘관 정원 설정 칸 값 ↔ 계수표 — 49 C7("군단 크기 상한, 등급·스탯 함수"), 48 정원 틀, 사용자 결정 1464(2026-11-15 "군단은 3개에서
// 20개정도로하고 지휘관 능력이나 스킬에 따라 결정되게하자"), docs/adr/2026-10-31-combat-core.md "바뀜 (2026-11-14, 파티·군단 명령)".
// 모두 [임시] 출발값이다(식은 combat/command.ts commandCapOf).
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

export const COMMAND_TUNING_KEYS: readonly TuningKey[] = [
  k("c7_command_base", "base", "지휘관 정원: 기본(파티 수)", "Commander cap: base (parties)"),
  k("c7_command_int_pm", "intPm", "지휘관 정원: 지휘 점수의 INT 가중치(‰)", "Commander cap: INT weight (‰)"),
  k("c7_command_wis_pm", "wisPm", "지휘관 정원: 지휘 점수의 WIS 가중치(‰)", "Commander cap: WIS weight (‰)"),
  k(
    "c7_command_points",
    "pointsPerParty",
    "지휘관 정원: 지휘 점수 몇 점마다 파티 하나",
    "Commander cap: command points per extra party",
  ),
  k("c7_command_min", "min", "지휘관 정원: 아래 끝(파티 수)", "Commander cap: minimum (parties)"),
  k("c7_command_max", "max", "지휘관 정원: 위 끝(파티 수)", "Commander cap: maximum (parties)"),
];
