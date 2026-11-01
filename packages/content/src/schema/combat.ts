// 전투 자료 분류 — 효과 사전·스킬·유닛 종류(장비 칸)와 아이템 장비 칸. docs/adr/2026-10-31-combat-core.md 7절
// 기획: 장비 칸(D-422), 장비가 올리는 스탯(D-423), 적정치 미달(D-424), 효과 사전(D-425), 스킬 두 갈래·칸·부품(D-426~D-428),
// 상태이상 저항 = 1차 스탯(D-429), 켬·끔(D-398), 구조 값(D-5054). 계산은 packages/sim combat/(effects·skills·equipment).
// [임시] 기획 본문 48(스탯·공식)을 받기 전 기술 기본안이다. 칸 이름·부품 종류·수치 범위는 본문이 오면 맞춘다.
// 칸·1차 스탯 코드 목록은 packages/sim combat/equipment.ts와 같아야 한다(sim 시험이 맞춰 본다).
import { ELEMENT_IDS, ELEMENT_MAX } from "@terra/shared/cyborg";
import { z } from "zod";
import { ContentRef, contentId, localizedText, ref } from "./common.ts";

export const PRIMARY_STAT_CODES = ["str", "dex", "agi", "vit", "int", "wis"] as const;
export const EQUIP_SLOT_KINDS = [
  "weapon",
  "offhand",
  "head",
  "body",
  "accessory",
  "organ",
  "part",
  "saddle",
] as const;
/** 1차 스탯을 올리는 칸(D-423, 48 §5.2: 장신구·인공장기·부품·크리쳐 안장). 나머지 칸은 2차 수치 */
export const PRIMARY_STAT_SLOTS: readonly string[] = ["accessory", "organ", "part", "saddle"];
/** 장비가 올리지 않는 2차 행(D-438 1: 2차 공격력은 1차·장신구·버프만, 무기 공격력은 무기 사양) */
export const GEAR_FORBIDDEN_ROWS: readonly string[] = ["physical_attack", "elemental_attack"];

const enabled = z.boolean({ error: "enabled가 없습니다. true 또는 false로 적으세요(D-398 켬·끔)." });
const permille = z.int().min(-100_000).max(100_000);
const weights = z.array(z.int().min(-100_000).max(100_000)).length(6);

export const effectEntrySchema = z
  .strictObject({
    id: contentId,
    name: localizedText,
    description: localizedText.optional(),
    kind: z.enum(["buff", "debuff", "dot", "heal", "status"]),
    /** 버프·디버프가 바꾸는 전투 수치 */
    stat: z.enum(["attack", "defense_rate", "evade", "penetration", "crit_multiplier"]).optional(),
    valueMode: z.enum(["flat", "permille"]),
    /** 기본 지속(ms). 0 = 전투 내내. 거는 쪽(스킬)이 바꿀 수 있다 */
    durationMs: z.int().min(0).max(3_600_000),
    /** dot·heal 주기(ms). heal에서 0이면 한 번 */
    tickMs: z.int().min(0).max(3_600_000),
    stacking: z.enum(["refresh", "stack", "ignore"]),
    maxStacks: z.int().min(1).max(100),
    status: z.enum(["stun", "root", "silence"]).optional(),
    /** 상태이상 저항(D-429): 확률 모양(상한 ‰, 반감 상수, 1차 6개 가중치 ‰) */
    resist: z
      .strictObject({
        cap: z.int().min(0).max(1000),
        halfConstant: z.int().positive().max(10_000_000),
        weights,
      })
      .optional(),
    /** 유료 효과 상한 코드(D-7005·D-7022). 쓰는 곳은 BM 단계 */
    capCode: contentId.optional(),
    enabled,
  })
  .superRefine((entry, ctx) => {
    // 필드 검사가 실패해도 불린다(AGENTS.md 6장 Zod): 모양을 다시 보고 틀리면 건너뛴다
    if (typeof entry !== "object" || entry === null) return;
    const needsStat = entry.kind === "buff" || entry.kind === "debuff";
    if (needsStat && entry.stat === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["stat"],
        message: "버프·디버프는 바꿀 수치(stat)를 적어야 합니다.",
      });
    if (!needsStat && entry.stat !== undefined)
      ctx.addIssue({ code: "custom", path: ["stat"], message: "stat은 버프·디버프에만 씁니다." });
    if ((entry.kind === "status") !== (entry.status !== undefined))
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "status는 상태이상(kind: status)에만, 그리고 꼭 적습니다.",
      });
    if (entry.resist !== undefined && entry.kind !== "status")
      ctx.addIssue({
        code: "custom",
        path: ["resist"],
        message: "저항(resist)은 상태이상에만 씁니다(D-429).",
      });
  });
export type EffectEntry = z.output<typeof effectEntrySchema>;

const formulaPart = z.discriminatedUnion("part", [
  z.strictObject({ part: z.literal("attack_mul"), pm: z.int().min(0).max(100_000) }),
  z.strictObject({ part: z.literal("weapon_add"), value: z.int().min(-1_000_000).max(1_000_000) }),
  z.strictObject({ part: z.literal("element"), element: z.int().min(0).max(11), pm: permille }),
  z.strictObject({ part: z.literal("penetration"), pm: z.int().min(-1000).max(1000) }),
  z.strictObject({ part: z.literal("flat"), value: z.int().min(0).max(1_000_000) }),
  z.strictObject({ part: z.literal("heal"), pm: z.int().min(0).max(10_000) }),
]);

const conditionPart = z.discriminatedUnion("part", [
  z.strictObject({ part: z.literal("appropriate_met") }),
  z.strictObject({ part: z.literal("self_hp_below"), pct: z.int().min(1).max(100) }),
  z.strictObject({ part: z.literal("target_has"), effect: ref("effects") }),
]);

export const skillEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  description: localizedText.optional(),
  /** active = 쓰는 스킬, passive = 전투 내내 걸린 효과 */
  trigger: z.enum(["active", "passive"]),
  resource: z.enum(["stamina", "mp"]),
  cost: z.int().min(0).max(100_000),
  castMs: z.int().min(0).max(60_000),
  cooldownMs: z.int().min(0).max(3_600_000),
  target: z.enum(["enemy", "self", "ally"]),
  range: z.int().min(0).max(128),
  radius: z.int().min(0).max(128),
  damage: z.enum(["physical", "elemental", "none"]),
  formula: z.array(formulaPart).max(16),
  conditions: z.array(conditionPart).max(8),
  effects: z
    .array(
      z.strictObject({
        effect: ref("effects"),
        value: z.int().min(-1_000_000).max(1_000_000),
        chancePm: z.int().min(0).max(1000),
        /** 없으면 효과 사전의 기본 지속 */
        durationMs: z.int().min(0).max(3_600_000).optional(),
      }),
    )
    .max(8),
  /** 등급별 값 배율(‰, 등급 1부터. 스킬 등급 상한 10, D-5001) */
  gradePm: z.array(z.int().min(0).max(100_000)).min(1).max(10),
  enabled,
});
export type SkillEntry = z.output<typeof skillEntrySchema>;

const weaponSchema = z.strictObject({
  kind: z.enum(["physical", "elemental"]),
  attack: z.int().min(0).max(1_000_000),
  attackAppropriate: z.int().min(0).max(10_000_000),
  hitPm: z.int().min(0).max(1000),
  hitAppropriate: z.int().min(0).max(10_000_000),
  critPm: z.int().min(0).max(1000),
  critAppropriate: z.int().min(0).max(10_000_000),
  intervalMs: z.int().min(100).max(60_000),
  speedAppropriate: z.int().min(1).max(10_000_000),
  range: z.int().min(1).max(128),
  arc: z.boolean(),
  staminaCost: z.int().min(0).max(100_000),
  mpCost: z.int().min(0).max(100_000),
  skillElementsPm: z.array(permille).length(12).optional(),
});

export const unitKindEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  /** 장비 칸 차례(구조 값 D-5054): 사람형 공통 6칸 + 종류별 강화 칸, 크리쳐 2칸(D-422) */
  slots: z.array(z.enum(EQUIP_SLOT_KINDS)).min(1).max(32),
  /** 스킬 칸(D-427): 종 기본 + 환생마다, 상한 10(구조 값) */
  skillSlots: z.strictObject({
    base: z.int().min(0).max(10),
    perRebirth: z.int().min(0).max(10),
    max: z.int().min(1).max(10),
  }),
  /** 타고난 무기(D-436): 크리쳐의 발톱·이빨 등, 사람형은 맨손. 무기 칸이 비었을 때 쓴다(D-420 같은 공식) */
  naturalWeapon: weaponSchema,
  enabled,
});
export type UnitKindEntry = z.output<typeof unitKindEntrySchema>;

/** 아이템의 장비 칸(D-423: 스탯 목록 {스탯 코드, 최소, 최대}) */
export const equipSchema = z
  .strictObject({
    slot: z.enum(EQUIP_SLOT_KINDS),
    stats: z
      .array(
        z.strictObject({
          /** 1차 스탯 코드 또는 2차 스탯(가중치 표 행) ID */
          stat: z.union([z.enum(PRIMARY_STAT_CODES), ref("stat_rows")]),
          min: z.int().min(-10_000_000).max(10_000_000),
          max: z.int().min(-10_000_000).max(10_000_000),
        }),
      )
      .max(16),
    weapon: weaponSchema.optional(),
    /** 장비 스킬(D-426. 지금은 아이템이 바로 가진다. 스킬석 소켓 인챈트는 뒤 단계) */
    skills: z.array(ref("skills")).max(4).optional(),
    /**
     * 속성값 칸(D-450: 장비·인공장기 스탯 묶음에 속성값 칸, 칸마다 1~10 D-182, 코드 D-167). 강화형(빙결·폭렬·번개·크리스탈)은
     * 장비·인공장기·신앙에서만 온다. 유닛 속성값 = 출처 합, 칸마다 10에서 자름(@terra/shared sumElementSources)
     */
    elements: z
      .array(z.strictObject({ element: z.enum(ELEMENT_IDS), value: z.int().min(1).max(ELEMENT_MAX) }))
      .max(ELEMENT_IDS.length)
      .optional(),
  })
  .superRefine((equip, ctx) => {
    if (typeof equip !== "object" || equip === null || !Array.isArray(equip.stats)) return;
    const wantPrimary = PRIMARY_STAT_SLOTS.includes(equip.slot);
    equip.stats.forEach((entry, index) => {
      if (typeof entry !== "object" || entry === null) return;
      const primary = typeof entry.stat === "string";
      if (primary !== wantPrimary)
        ctx.addIssue({
          code: "custom",
          path: ["stats", index, "stat"],
          message: wantPrimary
            ? `${equip.slot} 칸은 1차 스탯(str·dex·agi·vit·int·wis)만 올립니다(D-423).`
            : `${equip.slot} 칸은 2차 수치(가중치 표 행)만 올립니다(D-423).`,
        });
      if (entry.stat instanceof ContentRef && GEAR_FORBIDDEN_ROWS.includes(entry.stat.id))
        ctx.addIssue({
          code: "custom",
          path: ["stats", index, "stat"],
          message: "장비는 2차 공격력을 올리지 않습니다(D-438 1, 무기 공격력은 weapon 칸).",
        });
      if (typeof entry.min === "number" && typeof entry.max === "number" && entry.min > entry.max)
        ctx.addIssue({ code: "custom", path: ["stats", index], message: "min이 max보다 큽니다." });
    });
    if (Array.isArray(equip.elements)) {
      const seen = new Set<string>();
      equip.elements.forEach((entry, index) => {
        if (typeof entry !== "object" || entry === null || typeof entry.element !== "string") return;
        if (seen.has(entry.element))
          ctx.addIssue({
            code: "custom",
            path: ["elements", index, "element"],
            message: `속성 ${entry.element}이(가) 두 번 있습니다. 칸마다 한 줄만 적으세요.`,
          });
        seen.add(entry.element);
      });
    }
    if ((equip.weapon !== undefined) !== (equip.slot === "weapon"))
      ctx.addIssue({
        code: "custom",
        path: ["weapon"],
        message: "무기 칸(weapon)에는 무기 사양을 꼭, 다른 칸에는 쓰지 않습니다.",
      });
  });
export type EquipEntry = z.output<typeof equipSchema>;
