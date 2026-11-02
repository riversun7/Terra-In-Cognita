// 효과 사전 화면 자료([효과 사전] 탭, 아이템 편집기 WP-6) — 파싱한 효과 항목을 화면 JSON으로 옮기고, 효과마다 쓰는 아이템·스킬을 모은다
// (D-425 도감: 효과 하나를 누르면 그 효과를 쓰는 아이템·스킬이 모두 보인다). docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-02)".
import type { EffectEntry } from "@terra/content";
import type { EffectJson, EffectUsage } from "@terra/shared/itemEditor";
import type { ContentEffective } from "../contentEdit/state.ts";

const name = (text: { ko: string; en: string }) => ({ ko: text.ko, en: text.en });

/** 파싱한 효과 → 화면 JSON(팩 effects.json 한 줄 모양) */
export function effectJsonOf(entry: EffectEntry): EffectJson {
  return {
    id: entry.id,
    name: name(entry.name),
    ...(entry.description ? { description: name(entry.description) } : {}),
    kind: entry.kind,
    ...(entry.stat === undefined ? {} : { stat: entry.stat }),
    valueMode: entry.valueMode,
    durationMs: entry.durationMs,
    tickMs: entry.tickMs,
    stacking: entry.stacking,
    maxStacks: entry.maxStacks,
    ...(entry.status === undefined ? {} : { status: entry.status }),
    ...(entry.resist
      ? {
          resist: {
            cap: entry.resist.cap,
            halfConstant: entry.resist.halfConstant,
            weights: [...entry.resist.weights],
          },
        }
      : {}),
    ...(entry.capCode === undefined ? {} : { capCode: entry.capCode }),
    ...(entry.exclusive === undefined ? {} : { exclusive: entry.exclusive }),
    enabled: entry.enabled,
  };
}

/** 효과 → 쓰는 것 모음에 하나 더한다 */
function add(map: Map<string, Set<string>>, effect: string, user: string): void {
  const set = map.get(effect) ?? new Set<string>();
  set.add(user);
  map.set(effect, set);
}

/** 효과마다 쓰는 아이템(사용 효과 줄)·스킬(효과 줄, 조건 "대상이 이 효과를 가짐") — 실효 항목 차례, 겹침 없이 */
export function effectUsageOf(effective: ContentEffective): Record<string, EffectUsage> {
  const items = new Map<string, Set<string>>();
  const skills = new Map<string, Set<string>>();
  for (const item of effective.items)
    for (const part of item.use?.effects ?? []) add(items, part.effect.id, item.id);
  for (const skill of effective.skills) {
    for (const part of skill.effects) add(skills, part.effect.id, skill.id);
    for (const condition of skill.conditions)
      if (condition.part === "target_has") add(skills, condition.effect.id, skill.id);
  }
  return Object.fromEntries(
    effective.effects.map((effect) => [
      effect.id,
      { items: [...(items.get(effect.id) ?? [])], skills: [...(skills.get(effect.id) ?? [])] },
    ]),
  );
}
