// 설정 칸 값 — docs/adr/2026-10-31-faction-society-core.md "설정 칸 대응"
// 기획 설정 칸(49: N·S·C·T 코드)의 값을 개발자 패널 설정(D1)이 생기기 전까지 팩에 둔다. 항목 하나 = 정수 하나.
// 어느 계수표 칸인지는 packages/sim/src/tuning.ts의 표가 정한다(모르는 ID는 쓰지 않는다). 지금 값은 [임시] 시험값이다.
import { z } from "zod";
import { contentId, localizedText } from "./common.ts";

export const tuningEntrySchema = z.strictObject({
  id: contentId,
  /** 기획 설정 칸 코드(예: N13, S26, C5). 칸이 없으면 빈 문자열 */
  code: z.string().regex(/^([A-Z][0-9]{1,2})?$/),
  name: localizedText,
  /** 정수 하나(시각은 ms라 크다: 수명 몇 달 ≈ 10^10) */
  value: z.int().min(-1_000_000_000_000).max(1_000_000_000_000),
  /** 구조 값(D-5054: 바꿀 때 확인 창) */
  structural: z.boolean(),
});
export type TuningEntry = z.output<typeof tuningEntrySchema>;
