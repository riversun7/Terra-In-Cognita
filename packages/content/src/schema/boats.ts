// 조선소가 만드는 배 종류 표(시설 boats 칸) — 기획 D-547 1484("장비 제작처럼 당연히 배 종류마다 다르지") — docs/adr/2026-11-15-shipyard-harbor.md.
// 배 종류마다 재료·만드는 시간·빠르기·자리 수를 적는다(장비 제작 레시피처럼). 시설 역할(harbor)은 조선소·정박장·교역 부두(D-547 1481·1488).
// D-559: 배 종류에 연료(1529)·함선 칸(함급·HP·장갑·모듈 총한도·함포·보직·격납고, 1533·1537)을 더했다(선택 칸 — 없으면 설정 칸·처음 값).
// D-564·D-568: 태우는 연료 아이템(fuelItems — 연료는 아이템만, 1687)·배 창고(holdKg — 배에서 캔 것)를 더했다(선택 칸).
// D-570 1821: 함포 칸에 달 수 있는 포획 장비(catchGear — 아이템과 최대 채집 티어)를 더했다(선택 칸 — 없으면 포획 장비를 달 수 없다).
// 배 종류 ID는 그 시설 안에서 하나다(2단계 검사가 아니라 여기 superRefine이 본다 — 다른 시설과 같은 ID면 처음 시설의 것을 쓴다).
import { BOAT_TYPE_LIMITS, HARBOR_ROLES } from "@terra/shared/harbor";
import { CREW_POSTS, GUN_CALIBERS, NAVAL_LIMITS, SHELL_KINDS } from "@terra/shared/naval";
import { z } from "zod";
import { contentId, localizedText, ref } from "./common.ts";

/** 시설 역할(조선소·정박장·교역 부두). 없으면 배 시설이 아니다 */
export const harborRoleSchema = z.enum(HARBOR_ROLES);

/**
 * 함선 칸(D-559 1533·1537 "조선소 설계시 함급등으로 내구도나 장착가능한 모듈 총한도 등등 설계 가능") — 함급·전투 HP·장갑·모듈 총한도·함포 자리(규격·쓰는 포탄)·
 * 보직 자리·전투기 격납고(항공모함 틀, 지금 0). 해상 전투 판정은 아직 없어 서버는 보직·화면에만 쓴다(전투 고리가 HP·장갑·함포를 읽는다)
 */
export const navalSpecSchema = z.strictObject({
  shipClass: contentId,
  hullPoints: z.int().min(NAVAL_LIMITS.hullPoints.min).max(NAVAL_LIMITS.hullPoints.max),
  armor: z.int().min(NAVAL_LIMITS.armor.min).max(NAVAL_LIMITS.armor.max),
  modulePoints: z.int().min(NAVAL_LIMITS.modulePoints.min).max(NAVAL_LIMITS.modulePoints.max),
  guns: z
    .array(
      z.strictObject({
        caliber: z.enum(GUN_CALIBERS),
        shells: z.array(z.enum(SHELL_KINDS)).min(1).max(SHELL_KINDS.length),
      }),
    )
    .max(NAVAL_LIMITS.guns),
  crew: z.partialRecord(z.enum(CREW_POSTS), z.int().min(0).max(NAVAL_LIMITS.crewPerPost)),
  hangar: z.int().min(NAVAL_LIMITS.hangar.min).max(NAVAL_LIMITS.hangar.max),
});

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
  /** 연료 통·항해 한 시간 연료(D-559 1529, 없으면 설정 칸 boat_fuel_capacity·boat_fuel_per_hour) */
  fuelCapacity: z.int().min(NAVAL_LIMITS.fuelCapacity.min).max(NAVAL_LIMITS.fuelCapacity.max).optional(),
  fuelPerHour: z.int().min(NAVAL_LIMITS.fuelPerHour.min).max(NAVAL_LIMITS.fuelPerHour.max).optional(),
  /** 함선 칸(없으면 함장 1·갑판병 1, 함포 없음) */
  naval: navalSpecSchema.optional(),
  /** 배 창고(kg, D-568 — 배에서 캔 것이 든다. 없으면 설정 칸 boat_hold_kg) */
  holdKg: z.int().min(NAVAL_LIMITS.holdKg.min).max(NAVAL_LIMITS.holdKg.max).optional(),
  /**
   * 태우는 연료 아이템(D-564 1687 "처음부터 아이템만" — 아이템 1개 = 연료 units 단위). 교역 부두에서 배 창고·그 도시 내 창고의 이 아이템을 태워 채운다.
   * 없으면 보급할 수 없다(연료가 떨어지면 표류)
   */
  fuelItems: z
    .array(
      z.strictObject({
        item: ref("items"),
        units: z.int().min(NAVAL_LIMITS.fuelUnits.min).max(NAVAL_LIMITS.fuelUnits.max),
      }),
    )
    .min(1)
    .max(NAVAL_LIMITS.fuelItems)
    .optional(),
  /**
   * 함포 칸에 다는 포획 장비(D-570 1821 "어선의 함포칸에 장비하는 포획장비에 따라 채집가능한 최대티어가 정해지고") — 아이템과 그 장비로 잡는 가장 높은 티어.
   * 칸 하나에 하나, 낚시 선원 한 명이 맡는다. 없으면 이 배는 포획 장비를 달지 못한다(배에서 캐면 이끄는 유닛 혼자 설정 칸 boat_bare_catch_tier까지)
   */
  catchGear: z
    .array(z.strictObject({ item: ref("items"), maxTier: z.int().min(0).max(9) }))
    .min(1)
    .max(NAVAL_LIMITS.catchGear)
    .optional(),
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
      // 보직 자리 합은 타는 유닛 수 안(함장은 하나)
      const capacity: unknown = Reflect.get(type, "capacity");
      const naval: unknown = Reflect.get(type, "naval");
      const crew: unknown =
        typeof naval === "object" && naval !== null ? Reflect.get(naval, "crew") : undefined;
      if (typeof capacity !== "number" || typeof crew !== "object" || crew === null) continue;
      let seats = 0;
      for (const value of Object.values(crew)) if (typeof value === "number") seats += value;
      const captain: unknown = Reflect.get(crew, "captain");
      if (seats > capacity || (typeof captain === "number" && captain > 1))
        ctx.addIssue({
          code: "custom",
          path: [index, "naval", "crew"],
          message: `배 종류 ${id}의 보직 자리(${String(seats)})가 자리 수(${String(capacity)})보다 많거나 함장이 둘 이상입니다.`,
          params: { rule: "boat_crew_seats" },
        });
    }
  });
