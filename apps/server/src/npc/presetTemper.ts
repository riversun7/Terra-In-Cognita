// 국가 편집기 성향 칸 → 세력 성향 — 기획 D-573 1991(사용자 답 "나" — "국가 편집기에 성향 칸, 비어 있으면 무작위"), docs/adr/2026-11-01-npc-brain-r5.md "바뀜 (D-573)".
// 팩 국가 프리셋 temper(축 aggression·commerce·faith·station, 지도자 기질 leader ‰)가 있으면 그 나라 세력(프리셋 ID = 세력 코드)의 성향 4축을 축마다 그 값으로,
// 지도자 기질을 그 값으로 둔다(채집 6·도시 성장 성향·NPC 판단이 읽는 값). 빈 축은 (세계 시드, 세력)으로 굴린 값 그대로(D-327). 켤 때마다 다시 얹는다 — 편집기에서
// 바꾼 값이 다음 켤 때부터 든다(저장된 성향 위에 덮어 다음 저장에 남는다).
import type { NpcCoefficients, SimFaction, Traits } from "@terra/sim";
import type { NationPreset, NationTemper } from "./nations.ts";

/** 칸이 있는 축만 그 값(범위에서 자름), 빈 축은 굴린 값 */
export function withPresetTemper(
  rolled: Traits,
  temper: NationTemper | undefined,
  c: NpcCoefficients,
): Traits {
  if (!temper) return rolled;
  const pick = (value: number | undefined, fallback: number): number =>
    value === undefined ? fallback : Math.min(c.traitMax, Math.max(c.traitMin, Math.trunc(value)));
  return {
    aggression: pick(temper.aggression, rolled.aggression),
    commerce: pick(temper.commerce, rolled.commerce),
    faith: pick(temper.faith, rolled.faith),
    station: pick(temper.station, rolled.station),
  };
}

/** 켤 때 그 나라 세력에 성향 칸을 얹는다(runtime.ts — 1,000줄 상한이라 한 줄로): 성향 4축(채운 축만)과 지도자 기질 칸(SimFaction.leaderPm) */
export function applyPresetTemper(
  faction: SimFaction,
  preset: NationPreset | undefined,
  c: NpcCoefficients,
): void {
  const temper = preset?.temper;
  if (!temper) return;
  faction.traits = withPresetTemper(faction.traits, temper, c);
  if (temper.leader !== undefined) faction.leaderPm = temper.leader;
}
