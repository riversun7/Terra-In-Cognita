// 2단계 뒤 크리쳐 분류 트리 검사 — 대·중·소 세 단계까지, 고리 없음(docs/adr/2026-11-25-creature-codex-groups.md 6절).
// 위 분류가 있는지는 참조 검사가 본다. 크리쳐 편집기(서버 creatureEdit — 실효 팩을 이 검사기로 본다)도 같은 검사를 받는다.
import type { ContentIssue } from "../issue.ts";
import type { ContentPack } from "../pack.ts";
import { CREATURE_CLASS_MAX_DEPTH } from "../schema/creatureClasses.ts";

const get = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

export function checkCreatureClasses(pack: ContentPack): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const parentOf = new Map<string, string | null>();
  for (const entry of pack.entries.get("creature_classes") ?? []) {
    const parent = get(get(entry, "parent"), "id");
    parentOf.set(entry.id, typeof parent === "string" ? parent : null);
  }
  for (const id of parentOf.keys()) {
    // 위로 올라가며 깊이를 센다(자기 = 1). 없는 위 분류는 참조 검사가 알린다(여기서는 멈춘다)
    const seen = new Set<string>([id]);
    let depth = 1;
    let at = parentOf.get(id) ?? null;
    let cycle = false;
    while (at !== null && parentOf.has(at)) {
      if (seen.has(at)) {
        cycle = true;
        break;
      }
      seen.add(at);
      depth += 1;
      at = parentOf.get(at) ?? null;
    }
    if (cycle)
      issues.push({
        stage: "references",
        level: "error",
        file: "creature_classes.json",
        id,
        path: "parent",
        code: "creature_class_cycle",
        message: "분류의 위 분류를 따라가면 자기 자신으로 돌아옵니다. 위 분류를 고치세요.",
      });
    else if (depth > CREATURE_CLASS_MAX_DEPTH)
      issues.push({
        stage: "references",
        level: "error",
        file: "creature_classes.json",
        id,
        path: "parent",
        code: "creature_class_depth",
        params: { depth, max: CREATURE_CLASS_MAX_DEPTH },
        message: `분류 깊이(${depth})가 상한(${CREATURE_CLASS_MAX_DEPTH} — 대·중·소)을 넘었습니다. 위 분류를 바꾸세요.`,
      });
  }
  return issues;
}
