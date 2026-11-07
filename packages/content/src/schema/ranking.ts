// 경로 랭킹 목록(ranking_paths) — 기획 20 §7.2(경로 목록, D-481: 언제든 바뀐다 → 개수를 박지 않는 자료)·§8.3(경로별 지표),
// D-392(행동은 모두 열고 랭킹·칭호는 나눠서 연다: 공개 여부 표시가 있는 자료, 안 연 것은 화면 "곧 열림"). docs/adr/2026-11-07-ranking.md.
// 파일 차례 = 화면 차례(영역 차례). 연 경로는 재는 것(지표)이 하나 이상 있어야 한다. 지표 이름은 @terra/shared/ranking RANKING_MEASURES.
// 가중치(‰)는 [임시] 출발값이다(20 §8.2 "구성요소 가중치와 계수는 Step 5", D-515 수치는 밸런싱 단계).
import { RANKING_AREAS, RANKING_MEASURES } from "@terra/shared/ranking";
import { z } from "zod";
import { contentId, localizedText } from "./common.ts";

const measureSchema = z.strictObject({
  measure: z.enum(RANKING_MEASURES),
  /** 가중치(‰). 이번 기간 점수 = Σ ⌊지표 값 × 가중치 ÷ 1000⌋ */
  weightPm: z.int().min(0).max(100_000),
});

export const rankingPathEntrySchema = z
  .strictObject({
    id: contentId,
    name: localizedText,
    area: z.enum(RANKING_AREAS),
    /** 랭킹을 연 경로인가(D-392). false면 화면에 "곧 열림" */
    open: z.boolean(),
    measures: z.array(measureSchema).max(8),
  })
  .superRefine((entry, ctx) => {
    // 필드 검사가 실패해도 불린다(AGENTS 6장 Zod 4.6.7): 값 모양을 다시 보고 틀리면 건너뛴다
    const list: unknown = entry.measures;
    if (!Array.isArray(list)) return;
    const seen = new Set<unknown>();
    for (const item of list) {
      const measure: unknown =
        typeof item === "object" && item !== null ? Reflect.get(item, "measure") : undefined;
      if (seen.has(measure))
        ctx.addIssue({
          code: "custom",
          path: ["measures"],
          message: `지표가 두 번 있습니다: ${String(measure)}`,
        });
      seen.add(measure);
    }
    const open: unknown = entry.open;
    if (open === true && list.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["measures"],
        message: "연 경로는 재는 것(지표)이 하나 이상 있어야 합니다",
      });
  });
export type RankingPathEntry = z.output<typeof rankingPathEntrySchema>;
