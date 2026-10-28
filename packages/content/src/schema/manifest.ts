// manifest.json — 팩의 이름표: 형식 버전, 팩 ID, 팩 버전
import { z } from "zod";
import { contentId, localizedText } from "./common.ts";

export const MANIFEST_FILE = "manifest.json";

export const manifestSchema = z.strictObject({
  /** 팩 형식 버전. 코드의 CONTENT_FORMAT_VERSION과 같아야 한다 */
  formatVersion: z.int().positive(),
  /** 팩 ID. 팩 폴더 이름과 같아야 한다 */
  packId: contentId,
  /** 팩 버전. 내용을 바꿀 때마다 1 이상 올린다 (내리지 않는다) */
  version: z.int().positive(),
  /** 기획 확정 전 형식 확인용 임시 데이터. 실유저용 운영 반영에서는 거절한다 */
  placeholder: z.boolean().optional(),
  /** 팩 설명 (사람이 읽는 메모) */
  note: localizedText.optional(),
});
export type Manifest = z.output<typeof manifestSchema>;
