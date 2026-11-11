// 전투 클래스 표 검사(2단계 뒤) — 조합 스탯은 서로 다른 2개·3개이거나 비움(범용), 같은 조합은 하나, 묶음(group)은 2스탯 조합에만.
// docs/adr/2026-11-11-production-six.md(기획 D-529). 항목은 스키마를 통과한 파싱 결과다.
import type { ContentIssue } from "../issue.ts";
import type { ContentPack } from "../pack.ts";

const get = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

export function checkCombatClasses(pack: ContentPack): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const error = (id: string, path: string, code: string, message: string) =>
    issues.push({
      stage: "references",
      level: "error",
      file: "combat_classes.json",
      id,
      path,
      message,
      code,
    });
  const seen = new Map<string, string>();
  for (const entry of pack.entries.get("combat_classes") ?? []) {
    const stats = get(entry, "stats");
    if (!Array.isArray(stats)) continue;
    const list = stats.filter((stat): stat is string => typeof stat === "string");
    const unique = [...new Set(list)];
    if (unique.length !== list.length || list.length === 1) {
      error(
        entry.id,
        "stats",
        "class_stats_shape",
        "조합 스탯은 서로 다른 2개(2스탯 조합)·3개(3스탯 조합)이거나 비웁니다(범용).",
      );
      continue;
    }
    if (get(entry, "group") !== undefined && list.length !== 2)
      error(entry.id, "group", "class_group_two_only", "묶음(group)은 2스탯 조합에만 적습니다.");
    const key = unique.toSorted().join("+");
    const other = seen.get(key);
    if (other === undefined) seen.set(key, entry.id);
    else
      error(
        entry.id,
        "stats",
        "class_stats_duplicate",
        `같은 스탯 조합의 클래스가 이미 있습니다(${other}). 조합마다 하나만 둡니다.`,
      );
  }
  return issues;
}
