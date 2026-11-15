// 조선소가 만드는 배 종류 표(시설 boats 칸) — 기획 D-547 1484("장비 제작처럼 당연히 배 종류마다 다르지") — docs/adr/2026-11-15-shipyard-harbor.md.
// 배 종류마다 재료·만드는 시간·빠르기·자리 수를 적는다(장비 제작 레시피처럼). 시설 역할(harbor)은 조선소·정박장·교역 부두(D-547 1481·1488).
// 배 종류 ID는 그 시설 안에서 하나다(2단계 검사가 아니라 여기 superRefine이 본다 — 다른 시설과 같은 ID면 처음 시설의 것을 쓴다).
import { BOAT_TYPE_LIMITS, HARBOR_ROLES } from "@terra/shared/harbor";
import { z } from "zod";
import { contentId, localizedText, ref } from "./common.ts";

/** 시설 역할(조선소·정박장·교역 부두). 없으면 배 시설이 아니다 */
export const harborRoleSchema = z.enum(HARBOR_ROLES);

/** 배 종류 한 줄 */
export const boatTypeSchema = z.strictObject({
  id: contentId,
  name: localizedText,
  /** 만드는 재료(묶음 수량 — 설정 칸 boat_cost_pm을 곱한다) */
  materials: z
    .array(
      z.strictObject({
        item: ref("items"),
        qty: z.int().min(BOAT_TYPE_LIMITS.qty.min).max(BOAT_TYPE_LIMITS.qty.max),
      }),
    )
    .min(1)
    .max(BOAT_TYPE_LIMITS.materials),
  /** 기준 만드는 시간(ms) — 설정 칸 boat_build_time_pm을 곱한다 */
  buildMs: z.int().min(BOAT_TYPE_LIMITS.buildMs.min).max(BOAT_TYPE_LIMITS.buildMs.max),
  /** 빠르기(설정 칸 boat_speed에 대한 ‰) */
  speedPm: z.int().min(BOAT_TYPE_LIMITS.speedPm.min).max(BOAT_TYPE_LIMITS.speedPm.max),
  /** 타는 유닛 수 */
  capacity: z.int().min(BOAT_TYPE_LIMITS.capacity.min).max(BOAT_TYPE_LIMITS.capacity.max),
});

/** 조선소의 배 종류 목록(종류 ID가 겹치면 막는다) */
export const boatTypesSchema = z
  .array(boatTypeSchema)
  .min(1)
  .max(BOAT_TYPE_LIMITS.types)
  .superRefine((types, ctx) => {
    // 필드 검사가 실패해도 불린다(AGENTS 6장 Zod 4.6.7): 모양을 다시 보고 틀리면 건너뛴다
    const seen = new Set<string>();
    for (const [index, type] of types.entries()) {
      const id: unknown = Reflect.get(type, "id");
      if (typeof id !== "string") continue;
      if (seen.has(id))
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `배 종류 ID ${id}가 두 번 있습니다.`,
          params: { rule: "boat_type_duplicate" },
        });
      seen.add(id);
    }
  });
