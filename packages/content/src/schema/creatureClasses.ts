// 크리쳐 분류(creature_classes.json) 스키마 — 대·중·소 세 단계 트리(사용자 결정 2026-11-25, docs/adr/2026-11-25-creature-codex-groups.md 6절).
// 예: 야수(대) › 여우류(중) › 북극여우(소). 크리쳐의 category 칸이 이 트리의 어느 단계든 하나를 가리킨다.
// - parent가 없으면 대분류다. 깊이는 셋까지(creature_class_depth), 돌아오는 고리는 안 된다(creature_class_cycle) — validate/creatureClasses.ts.
// - 크리쳐 편집기(/dev/creatures)가 그 세계에서 더하고 이름·자리(parent)를 바꾼다(덮어쓰기 층).
import { z } from "zod";
import { ContentRef, contentId, localizedText, ref } from "./common.ts";

/** 분류 깊이 상한(대·중·소). packages/shared/src/creatureEditor.ts CREATURE_CLASS_MAX_DEPTH와 같아야 한다 */
export const CREATURE_CLASS_MAX_DEPTH = 3;

export const creatureClassEntrySchema = z
  .strictObject({
    id: contentId,
    name: localizedText,
    /** 위 분류(없으면 대분류) */
    parent: ref("creature_classes").optional(),
    /** 도감 분류 칸에 보이는 작은 그림 글자(이모지 등, 선택) */
    icon: z.string().min(1).max(8).optional(),
  })
  .superRefine((entry, ctx) => {
    if (typeof entry !== "object" || entry === null) return;
    if (entry.parent instanceof ContentRef && entry.parent.id === entry.id) {
      ctx.addIssue({
        code: "custom",
        path: ["parent"],
        message: "분류가 자기 자신을 위 분류로 가리킬 수 없습니다. 칸을 비우면 대분류가 됩니다.",
        params: { rule: "creature_class_self" },
      });
    }
  });

export type CreatureClassEntry = z.output<typeof creatureClassEntrySchema>;
