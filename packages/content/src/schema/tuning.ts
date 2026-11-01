// 설정 칸 값 — docs/adr/2026-10-31-faction-society-core.md "설정 칸 대응", docs/adr/2026-11-01-dev-settings-panel.md 2절(D1 형식)
// 기획 설정 칸(49: N·S·C·T 코드)의 값. 항목 하나 = 정수 하나. 팩이 정본이고, 개발자 패널(/dev/tuning)의 세계별 덮어쓰기가 그 위에 얹힌다.
// 어느 계수표 칸인지는 packages/sim/src/tuning.ts의 표가 정한다(모르는 ID는 쓰지 않는다). 지금 값은 [임시] 시험값이다.
// 선택 칸(D1): unit(저장 단위), min·max(기술 범위, 양 끝 포함). 1단계 검사가 min ≤ max, min ≤ value ≤ max를 본다.
// 서버 덮어쓰기도 같은 범위로 거절한다. 칸을 읽는 코드를 쓰는 사람이 범위를 적는다.
import { TUNING_UNITS, TUNING_VALUE_LIMIT } from "@terra/shared/tuning";
import { z } from "zod";
import { contentId, localizedText } from "./common.ts";

const tuningInt = z.int().min(-TUNING_VALUE_LIMIT).max(TUNING_VALUE_LIMIT);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

export const tuningEntrySchema = z
  .strictObject({
    id: contentId,
    /** 기획 설정 칸 코드(예: N13, S26, C5). 칸이 없으면 빈 문자열 */
    // 49 코드(끼운 칸은 끝에 소문자 하나, C16a) 또는 빈 값
    code: z.string().regex(/^([A-Z][0-9]{1,2}[a-z]?)?$/),
    name: localizedText,
    /** 정수 하나(시각은 ms라 크다: 수명 몇 달 ≈ 10^10) */
    value: tuningInt,
    /** 구조 값(D-5054: 바꿀 때 확인 창) */
    structural: z.boolean(),
    /** 저장 단위(@terra/shared TUNING_UNITS). 없으면 화면이 이름 끝 괄호에서 읽는다 */
    unit: z.enum(TUNING_UNITS).optional(),
    /** 기술 범위 아래 끝(포함) */
    min: tuningInt.optional(),
    /** 기술 범위 위 끝(포함) */
    max: tuningInt.optional(),
  })
  .superRefine((entry, ctx) => {
    // 필드 검사가 실패해도 불린다(AGENTS 6장 Zod 4.6.7): 값 모양을 다시 보고 틀리면 건너뛴다
    const { value, min, max } = entry;
    if (isInt(min) && isInt(max) && min > max) {
      ctx.addIssue({
        code: "custom",
        path: ["min"],
        message: `범위가 거꾸로입니다: min ${min} > max ${max}`,
      });
      return;
    }
    if (!isInt(value)) return;
    if (isInt(min) && value < min)
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `값 ${value}이(가) 범위 아래(min ${min})입니다`,
      });
    if (isInt(max) && value > max)
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `값 ${value}이(가) 범위 위(max ${max})입니다`,
      });
  });
export type TuningEntry = z.output<typeof tuningEntrySchema>;

/** 값이 그 항목의 기술 범위 안인가(서버 덮어쓰기·내보내기 적용이 같은 규칙을 쓴다) */
export function tuningValueInRange(entry: Pick<TuningEntry, "min" | "max">, value: number): boolean {
  if (!Number.isInteger(value) || Math.abs(value) > TUNING_VALUE_LIMIT) return false;
  if (entry.min !== undefined && value < entry.min) return false;
  return entry.max === undefined || value <= entry.max;
}
