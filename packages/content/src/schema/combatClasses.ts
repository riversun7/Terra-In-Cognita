// 전투 클래스(combat_classes) — 스탯 조합으로 붙이는 클래스 이름·설명(추천 표시용, 판정에 쓰지 않는다).
// 기획 D-529(옛 35 클래스 그대로): 옛 프로젝트 CHR-1 §6(AntiGravt01 docs/GDD/Character/Consolidated_Character.md 278~331줄)의 2스탯 조합 15종·
// 3스탯 조합 20종 + 범용. 조합 표는 옛 코드(terra-server/game/class_detector.js)와 같고 설명은 옛 화면(terra-client/src/lib/classDetection.ts).
// 분류 규칙(S3 ÷ S1 문턱 0.60·범용 0.80)은 설정 칸이고 셈은 @terra/shared/unitGuide. docs/adr/2026-11-11-production-six.md
import { z } from "zod";
import { PRIMARY_STAT_CODES } from "./combat.ts";
import { contentId, localizedText } from "./common.ts";

/** 묶음(옛 §6.2 분류 칸): 물리·마법·하이브리드. 2스탯 조합에만 적는다(@terra/shared COMBAT_CLASS_GROUPS와 같다) */
export const COMBAT_CLASS_GROUP_CODES = ["physical", "magic", "hybrid"] as const;

export const combatClassEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  /**
   * 조합 스탯: 2개 = 2스탯 조합(S3 ÷ S1 < 문턱), 3개 = 3스탯 조합, 0개 = 범용(여섯 스탯이 고름). 같은 조합은 표에 하나(2단계 검사
   * validate/combatClasses.ts). 차례는 뜻이 없다
   */
  stats: z.array(z.enum(PRIMARY_STAT_CODES)).max(3),
  group: z.enum(COMBAT_CLASS_GROUP_CODES).optional(),
  /** 주요 역할(옛 §6.2 "주요 역할" 칸). 옛 3스탯 조합에는 없다 */
  role: localizedText.optional(),
  /** 설명(옛 화면 classDetection.ts description). 영어는 [임시] 번역 */
  desc: localizedText,
});
export type CombatClassEntry = z.output<typeof combatClassEntrySchema>;
