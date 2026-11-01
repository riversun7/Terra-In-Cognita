// 밸런스 화면 기준 유닛 프리셋(balance_presets) 분류 — docs/adr/2026-11-01-balance-screen.md "바뀜 (D-467)", 기획 D-467 228 다
// 프리셋 = 이름 붙은 기준 유닛 설정(1차 6·무기·인원·판 수·제한 시간). 팩은 씨앗이고, 개발자 페이지에서 고친 것·만든 것은 서버 DB에 둔다.
// - weapon: 팩 무기 아이템 참조. 없으면 맨손(유닛 종류의 타고난 무기). 무기 사양이 없는 아이템이면 서버가 그 프리셋을 빼고 알린다.
// - 값 범위·상한은 대결 입력과 같다(@terra/shared balance: 1차 0~10,000, 인원 1~3, 판 수 2~40 짝수, 제한 30~300초, 판 수 × 제한 ≤ 2,400초).
// - ID는 dev_로 시작하지 않는다(화면에서 만든 프리셋의 ID 앞머리, 겹치지 않게).
// 지금 값은 기술 [임시](기획 48 §2.3 성장 공식·N5·N6·N9 출발값에서 셈, 셋 다 맨손, 작업 기록 2026/11/01 balance2).
import {
  BALANCE_CUSTOM_PRESET_PREFIX,
  BALANCE_LIMITS,
  BALANCE_PRIMARY_MAX,
  BALANCE_PRIMARY_MIN,
} from "@terra/shared/balance";
import { z } from "zod";
import { contentId, localizedText, ref } from "./common.ts";

const primary = z.int().min(BALANCE_PRIMARY_MIN).max(BALANCE_PRIMARY_MAX);

export const balancePresetEntrySchema = z
  .strictObject({
    id: contentId.refine((id) => !id.startsWith(BALANCE_CUSTOM_PRESET_PREFIX), {
      error: `ID가 ${BALANCE_CUSTOM_PRESET_PREFIX}로 시작합니다. 화면에서 만든 프리셋의 앞머리라 다른 이름을 쓰세요.`,
    }),
    name: localizedText,
    primaries: z.strictObject({
      str: primary,
      vit: primary,
      int: primary,
      wis: primary,
      dex: primary,
      agi: primary,
    }),
    weapon: ref("items").optional(),
    count: z.int().min(BALANCE_LIMITS.countMin).max(BALANCE_LIMITS.countMax),
    runs: z
      .int()
      .min(BALANCE_LIMITS.runsMin)
      .max(BALANCE_LIMITS.runsMax)
      .refine((runs) => runs % 2 === 0, { error: "판 수는 짝수여야 합니다(두 편 차례로 반씩 돈다)." }),
    limitSec: z.int().min(BALANCE_LIMITS.limitSecMin).max(BALANCE_LIMITS.limitSecMax),
  })
  .superRefine((entry, ctx) => {
    // 필드 검사가 실패해도 불린다(AGENTS 6장 Zod 4.6.7): 모양을 다시 보고 틀리면 건너뛴다
    const { runs, limitSec } = entry;
    if (!Number.isInteger(runs) || !Number.isInteger(limitSec)) return;
    if (runs * limitSec > BALANCE_LIMITS.runSecondsMax)
      ctx.addIssue({
        code: "custom",
        path: ["runs"],
        message: `판 수 × 제한 시간이 ${BALANCE_LIMITS.runSecondsMax}초를 넘습니다(${runs} × ${limitSec}). 둘 중 하나를 줄이세요.`,
      });
  });
export type BalancePresetEntry = z.output<typeof balancePresetEntrySchema>;
