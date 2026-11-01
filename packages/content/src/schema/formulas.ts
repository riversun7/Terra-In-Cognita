// 전투 계산식 — docs/adr/2026-11-01-formula-editor.md(사용자 결정 D-488 "계산식을 개발자 모드에서 편집할 수 있게 한다")
// 항목 하나 = 식 칸 하나(ID = @terra/shared COMBAT_FORMULA_IDS): 실제 공격력·명중·크리, 맨손 일반 공격, 크리 배율, 공격 간격,
// STA 점수, 스태미나 소모, 최종 회피. expression은 식 글(문법은 @terra/shared/formula). 빠진 칸은 판정 코드의 기본 식이다.
// 식의 문법·이름 검사(칸마다 변수)는 validate/formulas.ts. 지금 값은 지금 코드와 같은 결과를 내는 식이고 맨손만 옛 규칙 [임시].
import { FORMULA_MAX_LENGTH } from "@terra/shared/formula";
import { z } from "zod";
import { contentId, localizedText } from "./common.ts";

export const formulaEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  expression: z.string().min(1).max(FORMULA_MAX_LENGTH),
});
export type FormulaEntry = z.output<typeof formulaEntrySchema>;
