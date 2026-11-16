// 밀림 상태이상 검사(2단계 뒤) — 질문 1806 답(D-429 "데이터 칸"): 밀치기·끌어오기·묶기의 저항은 효과 사전 상태이상 항목의 resist다.
// - 밀림 상태이상(status knockback·pull)은 스킬 이동 부품(displace)만 읽는다: 스킬 효과 줄·아이템 사용 효과로 걸지 않는다(effect_displace_status).
// - 스킬 displace의 effect 칸은 같은 종류의 상태이상 항목이어야 한다(displace_effect_status: 밀치기 = knockback, 끌어오기 = pull, 묶기 = root).
// 없는 참조는 참조 단계가 알리므로 건너뛴다. 항목은 스키마를 통과한 파싱 결과(참조 = ContentRef)다.
import type { ContentIssue } from "../issue.ts";
import type { ContentPack } from "../pack.ts";
import { DISPLACE_STATUS_KINDS } from "../schema/combat.ts";
import { ContentRef } from "../schema/common.ts";

const get = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const refId = (value: unknown): string | undefined => (value instanceof ContentRef ? value.id : undefined);

export function checkDisplaceEffects(pack: ContentPack): ContentIssue[] {
  const issues: ContentIssue[] = [];
  /** 효과 ID → 상태이상 종류(상태이상이 아니면 빈 글자) */
  const statusOf = new Map(
    (pack.entries.get("effects") ?? []).map((entry) => {
      const status = get(entry, "status");
      return [entry.id, get(entry, "kind") === "status" && typeof status === "string" ? status : ""];
    }),
  );
  const error = (file: string, id: string, path: string, code: string, message: string) =>
    issues.push({ stage: "references", level: "error", file, id, path, message, code });
  /** 효과 줄 목록에서 밀림 상태이상을 거는 줄을 알린다 */
  const checkLines = (file: string, id: string, base: string, lines: unknown) => {
    if (!Array.isArray(lines)) return;
    lines.forEach((line: unknown, index) => {
      const effect = refId(get(line, "effect"));
      const status = effect === undefined ? undefined : statusOf.get(effect);
      if (status === undefined || !DISPLACE_STATUS_KINDS.includes(status)) return;
      error(
        file,
        id,
        `${base}[${index}].effect`,
        "effect_displace_status",
        `${effect}는 밀림 상태이상(${status})입니다. 밀치기·끌어오기는 스킬 이동 부품(displace)으로만 겁니다(효과 줄로는 걸지 않습니다).`,
      );
    });
  };

  for (const skill of pack.entries.get("skills") ?? []) {
    checkLines("skills.json", skill.id, "effects", get(skill, "effects"));
    const displace = get(skill, "displace");
    const kind = get(displace, "kind");
    const effect = refId(get(displace, "effect"));
    if (effect === undefined || typeof kind !== "string") continue;
    const status = statusOf.get(effect);
    if (status === undefined || status === kind) continue;
    error(
      "skills.json",
      skill.id,
      "displace.effect",
      "displace_effect_status",
      `대상 옮김 ${kind}의 저항 항목은 상태이상 ${kind} 항목이어야 합니다(${effect}는 ${status === "" ? "상태이상이 아님" : status}).`,
    );
  }
  for (const item of pack.entries.get("items") ?? [])
    checkLines("items.json", item.id, "use.effects", get(get(item, "use"), "effects"));
  return issues;
}
