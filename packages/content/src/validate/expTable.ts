// 유닛 공통 경험치 테이블 검사(2단계 뒤) — exp_table.json.
// - ID는 레벨과 짝을 맞춘다(lv_01 ↔ level 1, exp_level_id_mismatch).
// - 같은 레벨은 한 줄만 둔다(exp_level_duplicate).
// - 레벨 1부터 빈틈없이 이어져야 한다(1..N, exp_level_gap).
// - 앞 레벨보다 필요 경험치가 줄어들면 권고(경고)로 알린다(exp_span_decreasing).
import { expLevelId } from "@terra/shared/expTable";
import type { ContentIssue } from "../issue.ts";
import type { ContentPack } from "../pack.ts";

const get = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

export function checkExpTable(pack: ContentPack): ContentIssue[] {
  const entries = pack.entries.get("exp_table") ?? [];
  if (entries.length === 0) return [];
  const issues: ContentIssue[] = [];
  const push = (
    level: "error" | "warning",
    id: string,
    path: string,
    code: string,
    message: string,
    params: Record<string, string | number> = {},
  ) =>
    issues.push({
      stage: "references",
      level,
      file: "exp_table.json",
      id,
      path,
      code,
      message,
      params,
    });

  const byLevel = new Map<number, { id: string; requiredExp: number }>();
  for (const entry of entries) {
    const lv = get(entry, "level");
    const req = get(entry, "requiredExp");
    if (typeof lv !== "number" || typeof req !== "number") continue;
    const expectedId = expLevelId(lv);
    if (entry.id !== expectedId) {
      push(
        "error",
        entry.id,
        "id",
        "exp_level_id_mismatch",
        `레벨 ${lv}의 항목 ID는 ${expectedId}여야 합니다.`,
        { level: lv, expected: expectedId },
      );
    }
    const existing = byLevel.get(lv);
    if (existing !== undefined) {
      push(
        "error",
        entry.id,
        "level",
        "exp_level_duplicate",
        `레벨 ${lv} 구간이 이미 있습니다(${existing.id}). 레벨마다 한 줄만 둡니다.`,
        { level: lv, other: existing.id },
      );
      continue;
    }
    byLevel.set(lv, { id: entry.id, requiredExp: req });
  }

  const levels = [...byLevel.keys()].toSorted((a, b) => a - b);
  const maxLv = levels[levels.length - 1] ?? 0;
  for (let expected = 1; expected <= maxLv; expected++) {
    if (!byLevel.has(expected)) {
      push(
        "error",
        expLevelId(expected),
        "level",
        "exp_level_gap",
        `레벨 ${expected} → ${expected + 1} 구간(${expLevelId(expected)})이 비어 있습니다. 1부터 빈틈없이 이어야 합니다.`,
        { level: expected },
      );
    }
  }

  let prevExp = 0;
  for (const lv of levels) {
    const row = byLevel.get(lv);
    if (!row) continue;
    if (prevExp > 0 && row.requiredExp < prevExp) {
      push(
        "warning",
        row.id,
        "requiredExp",
        "exp_span_decreasing",
        `레벨 ${lv} 필요 경험치(${row.requiredExp})가 앞 레벨(${prevExp})보다 작습니다.`,
        { level: lv, requiredExp: row.requiredExp, previous: prevExp },
      );
    }
    prevExp = row.requiredExp;
  }

  return issues;
}
