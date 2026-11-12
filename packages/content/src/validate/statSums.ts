// 2단계 뒤 초기 스탯 합 검사 — 기획 D-534(크리쳐·휴먼 초기 합은 상위 콘텐츠로 최대 80, BM 포함 어떤 경우에도 100 이하), docs/adr/2026-11-12-unit-condition.md.
// - 크리쳐(creatures.primaries) 여섯 칸 합 ≤ 설정 칸 n9_creature_sum_max(팩 tuning, 없으면 100)이고 언제나 ≤ 100(creature_stat_sum).
// 크리쳐 편집기(서버 creatureEdit — 실효 팩을 이 검사기로 본다)도 같은 검사를 받는다. 덮어쓴 설정 칸 값은 보지 않는다(팩 값만).
import { STAT_SUM_ABSOLUTE_MAX } from "@terra/shared/statGrowth";
import type { ContentIssue } from "../issue.ts";
import type { ContentPack } from "../pack.ts";

const get = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 크리쳐 초기 합 상한(팩 tuning n9_creature_sum_max, 100으로 묶음). 칸이 없으면 100 */
export function creatureSumMax(pack: ContentPack): number {
  const cell = (pack.entries.get("tuning") ?? []).find((entry) => entry.id === "n9_creature_sum_max");
  const value = get(cell, "value");
  return typeof value === "number" ? Math.min(STAT_SUM_ABSOLUTE_MAX, value) : STAT_SUM_ABSOLUTE_MAX;
}

export function checkStatSums(pack: ContentPack): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const max = creatureSumMax(pack);
  for (const creature of pack.entries.get("creatures") ?? []) {
    const primaries = get(creature, "primaries");
    if (typeof primaries !== "object" || primaries === null) continue;
    let sum = 0;
    for (const value of Object.values(primaries)) if (typeof value === "number") sum += value;
    if (sum > max)
      issues.push({
        stage: "references",
        level: "error",
        file: "creatures.json",
        id: creature.id,
        path: "primaries",
        code: "creature_stat_sum",
        message: `크리쳐 초기 스탯 합(${sum})이 상한(${max}, 설정 칸 n9_creature_sum_max·절대 상한 ${STAT_SUM_ABSOLUTE_MAX})을 넘었습니다(D-534).`,
      });
  }
  return issues;
}
