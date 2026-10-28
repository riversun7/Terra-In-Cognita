// id-changes.json — 이름을 바꾸거나 지운 ID의 기록. 뒤에 추가만 한다(고치거나 지우지 않음, docs/PROTECTED.md).
// 운영 데이터(인벤토리·건물 등)가 옛 ID를 쓰고 있어도 이 기록으로 새 ID나 보상을 찾는다.
import { z } from "zod";
import { contentId } from "./common.ts";

export const ID_CHANGES_FILE = "id-changes.json";

/** 바꾼 팩 버전 (그 버전부터 새 이름) */
const since = z.int().positive();

export const renamedRecordSchema = z.strictObject({
  category: contentId,
  from: contentId,
  to: contentId,
  since,
});
export type RenamedRecord = z.output<typeof renamedRecordSchema>;

/** 지운 ID를 가진 운영 데이터를 어떻게 할지. M0는 "없음"과 "다른 ID로 바꿔 줌"만 (실제 보상 규칙은 기획 확정 후) */
const compensationSchema = z.discriminatedUnion(
  "kind",
  [
    z.strictObject({ kind: z.literal("none") }),
    z.strictObject({ kind: z.literal("replace"), with: contentId }),
  ],
  {
    error: (issue) =>
      issue.code === "invalid_union"
        ? '보상 방식은 {"kind": "none"} 또는 {"kind": "replace", "with": "<ID>"}로 적으세요.'
        : undefined,
  },
);

export const removedRecordSchema = z.strictObject({
  category: contentId,
  id: contentId,
  since,
  compensation: compensationSchema,
});
export type RemovedRecord = z.output<typeof removedRecordSchema>;

export const idChangesSchema = z.strictObject({
  renamed: z.array(renamedRecordSchema),
  removed: z.array(removedRecordSchema),
});
export type IdChanges = z.output<typeof idChangesSchema>;
