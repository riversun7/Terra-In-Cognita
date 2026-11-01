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
    /** 버프·디버프가 바꾸는 전투 수치(move_speed = 이동 속도 ‰, 디버프면 느리게. shield_regen = 쉴드 재생 ‰, 디버프면 저주, D-490) */
    stat: z
      .enum([
        "attack",
        "defense_rate",
        "evade",
        "penetration",
        "crit_multiplier",
        "move_speed",
        "shield_regen",
      ])
      .optional(),
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
  /** 쉴드 회복: 대상 최대 쉴드 HP의 ‰(최대에서 멈춤) */
  z.strictObject({ part: z.literal("shield"), pm: z.int().min(0).max(10_000) }),
]);

const conditionPart = z.discriminatedUnion("part", [
  z.strictObject({ part: z.literal("appropriate_met") }),
  z.strictObject({ part: z.literal("self_hp_below"), pct: z.int().min(1).max(100) }),
  /** 대상(적, 또는 아군 하나 스킬이 고른 아군)의 체력이 이 % 아래 */
  z.strictObject({ part: z.literal("target_hp_below"), pct: z.int().min(1).max(100) }),
  z.strictObject({ part: z.literal("target_has"), effect: ref("effects") }),
]);

/**
 * 스킬 모양(보는 쪽이 그림을 고르는 칸, ADR combat-core "바뀜 (2026-11-01, 마법 스킬)"). 판정은 대상·사거리·반지름·연쇄 칸으로 하고
 * checkSkillShape가 둘이 맞는지 본다
 */
export const SKILL_SHAPES = ["single", "projectile", "area", "chain", "heal", "buff", "debuff"] as const;
const ENEMY_SHAPES: readonly string[] = ["single", "projectile", "area", "chain", "debuff"];
const DAMAGE_SHAPES: readonly string[] = ["single", "projectile", "area", "chain"];

/** 모양과 판정 칸이 맞는지(필드 검사가 실패해도 불리므로 값의 모양을 다시 본다, AGENTS 6장 Zod 4.6.7) */
function checkSkillShape(entry: unknown, ctx: z.RefinementCtx): void {
  if (typeof entry !== "object" || entry === null) return;
  const get = (key: string): unknown => Reflect.get(entry, key);
  const shape = get("shape");
  if (typeof shape !== "string") return;
  const fail = (path: string, message: string): void => {
    ctx.addIssue({ code: "custom", path: [path], message });
  };
  const target = get("target");
  const damage = get("damage");
  const range = get("range");
  const radius = get("radius");
  const formula = get("formula");
  const hasHeal =
    Array.isArray(formula) &&
    formula.some(
      (part: unknown) => typeof part === "object" && part !== null && Reflect.get(part, "part") === "heal",
    );
  if ((shape === "chain") !== (get("chain") !== undefined))
    fail("chain", "연쇄 칸(chain)은 모양이 chain일 때만, 그리고 꼭 적습니다.");
  if (ENEMY_SHAPES.includes(shape) && target !== "enemy")
    fail("target", `모양 ${shape}은(는) 적 대상(target: enemy)입니다.`);
  if (!ENEMY_SHAPES.includes(shape) && target === "enemy")
    fail("target", `모양 ${shape}은(는) 자기·아군 대상(self·ally)입니다.`);
  if (DAMAGE_SHAPES.includes(shape) && damage === "none")
    fail(
      "damage",
      `모양 ${shape}은(는) 피해를 줍니다(damage: physical·elemental). 피해 없이 효과만 걸면 debuff입니다.`,
    );
  if (shape === "debuff" && damage !== "none")
    fail(
      "damage",
      "모양 debuff는 피해 없이(damage: none) 효과만 겁니다. 피해를 주면 single·projectile·area입니다.",
    );
  if (shape === "projectile" && typeof range === "number" && range < 2)
    fail("range", "날아가는 모양(projectile)은 사거리 2 이상입니다. 붙어서 치면 single입니다.");
  if ((shape === "single" || shape === "projectile" || shape === "chain") && radius !== 0)
    fail("radius", `모양 ${shape}은(는) 반지름 0입니다(목표 둘레를 치면 area, 연쇄 거리는 chain.jump).`);
  if (shape === "area" && typeof radius === "number" && radius < 1)
    fail("radius", "모양 area는 반지름 1 이상입니다.");
  if (shape === "heal" && !hasHeal) fail("formula", "모양 heal은 회복 부품(part: heal)이 있어야 합니다.");
  if (shape === "buff" && hasHeal) fail("shape", "회복 부품(part: heal)이 있으면 모양은 heal입니다.");
  if (get("trigger") === "passive" && shape !== "buff")
    fail("shape", "지속형(passive) 스킬은 자기에게 전투 내내 효과를 거는 buff 모양입니다.");
  if (target === "ally" && radius === 0 && range === 0)
    fail(
      "range",
      "반지름 0인 아군 대상은 아군 하나를 고르는 스킬이라 사거리 1 이상입니다(자기만이면 target: self).",
    );
}

export const skillEntrySchema = z
  .strictObject({
    id: contentId,
    name: localizedText,
    description: localizedText.optional(),
    /** 보는 쪽이 그림을 고르는 모양(SKILL_SHAPES). 판정 칸과 맞아야 한다(checkSkillShape) */
    shape: z.enum(SKILL_SHAPES),
    /** active = 쓰는 스킬, passive = 전투 내내 걸린 효과 */
    trigger: z.enum(["active", "passive"]),
    resource: z.enum(["stamina", "mp"]),
    cost: z.int().min(0).max(100_000),
    castMs: z.int().min(0).max(60_000),
    cooldownMs: z.int().min(0).max(3_600_000),
    target: z.enum(["enemy", "self", "ally"]),
    range: z.int().min(0).max(128),
    radius: z.int().min(0).max(128),
    /** 연쇄(모양 chain만): 첫 대상 포함 최대 대상 수, 튐 거리(칸, 앞 대상에서), 튈 때마다 피해 배율(‰) */
    chain: z
      .strictObject({
        targets: z.int().min(2).max(16),
        jump: z.int().min(1).max(32),
        falloffPm: z.int().min(0).max(1000),
      })
      .optional(),
    damage: z.enum(["physical", "elemental", "none"]),
    /**
     * 기반(D-463): physical = 든 무기의 물리 칸과 물리 공격력, elemental = 든 무기의 속성 칸과 속성 공격력(m.atk).
     * 피해를 주는 스킬은 damage와 같아야 한다
     */
    base: z.enum(["physical", "elemental"]),
    /**
     * 필요한 무기 칸(D-490 "맨손은 스킬을 쓸 수 없다"): 든 무기에 이 칸이 있어야 쓴다. any = 칸이 하나라도 있는 무기.
     * 없으면 기반과 같은 칸. 피해를 주는 스킬은 기반과 같은 칸만(무기 칸으로 피해를 센다)
     */
    weaponField: z.enum(["physical", "elemental", "any"]).optional(),
    /**
     * 맨손 스킬(D-490): 참이면 무기 없이도 쓰고 늘 유닛 종류의 타고난 무기(물리 기반)·맨손 속성 자료(속성 기반)로 센다.
     * 맨손 스킬만 맨손으로 쓸 수 있다. 필요한 무기 칸(weaponField)과 같이 적지 않는다
     */
    bareHand: z.boolean().optional(),
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
  })
  .superRefine((entry, ctx) => {
    checkSkillShape(entry, ctx);
    // 필드 검사가 실패해도 불린다(AGENTS 6장 Zod 4.6.7): 두 칸이 모두 알맞은 글자일 때만 본다
    const { damage, base, weaponField, bareHand } = entry;
    if (bareHand === true && weaponField !== undefined)
      ctx.addIssue({
        code: "custom",
        path: ["weaponField"],
        message: "맨손 스킬(bareHand)은 무기 없이 쓰므로 필요한 무기 칸(weaponField)을 적지 않습니다(D-490).",
      });
    if (typeof damage !== "string" || typeof base !== "string" || damage === "none") return;
    if (weaponField !== undefined && weaponField !== base)
      ctx.addIssue({
        code: "custom",
        path: ["weaponField"],
        message:
          "피해를 주는 스킬의 필요한 무기 칸(weaponField)은 기반(base)과 같아야 합니다(그 칸의 공격력으로 피해를 셉니다, D-490).",
      });
    if (damage !== base)
      ctx.addIssue({
        code: "custom",
        path: ["base"],
        message:
          "피해를 주는 스킬은 기반(base)이 피해 종류(damage)와 같아야 합니다(D-463: 물리 기반 → 물리 몫, 속성 기반 → 속성 몫).",
      });
  });
export type SkillEntry = z.output<typeof skillEntrySchema>;

/** 무기 공격력 칸 하나(D-465): 공격력과 적정치(2차 스탯 단위, 무기 틀 D-420) */
const weaponAttackField = z.strictObject({
  attack: z.int().min(0).max(1_000_000),
  attackAppropriate: z.int().min(0).max(10_000_000),
});
const attackFieldKind = z.enum(["physical", "elemental"]);

/** 무기 사양의 공격력 칸 말고 나머지(명중·크리·간격·사거리·비용·옵션 계수) */
const weaponBody = {
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
  /** 속성 계수 12칸(‰): 물리 칸으로 치면 옵션(속성 몫), 속성 칸으로 치면 가산 계수(48 §4.5a). 두 칸 무기는 두 칸이 같이 쓴다 */
  skillElementsPm: z.array(permille).length(12).optional(),
};

/**
 * 공격력 칸 규칙(D-465, 질문 235 가): 칸이 적어도 하나, 두 칸이면 기본 공격 칸(basic)을 꼭 적고, basic은 있는 칸만 가리킨다.
 * 필드 검사가 실패해도 불리므로(AGENTS 6장 Zod 4.6.7) 값의 모양을 다시 본다
 */
function checkWeaponFields(weapon: unknown, ctx: z.RefinementCtx): void {
  if (typeof weapon !== "object" || weapon === null) return;
  const has = (key: string): boolean => {
    const value: unknown = Reflect.get(weapon, key);
    return typeof value === "object" && value !== null;
  };
  const physical = has("physical");
  const elemental = has("elemental");
  const basic: unknown = Reflect.get(weapon, "basic");
  if (!physical && !elemental) {
    ctx.addIssue({
      code: "custom",
      path: [],
      message:
        "무기에 공격력 칸이 없습니다. physical(물리)·elemental(속성) 가운데 하나 이상을 {attack, attackAppropriate}로 적으세요(D-465).",
    });
    return;
  }
  if (physical && elemental && basic === undefined)
    ctx.addIssue({
      code: "custom",
      path: ["basic"],
      message:
        '두 칸 무기는 기본 공격(스킬 없음)이 쓸 칸을 basic에 적습니다: "physical" 또는 "elemental"(질문 235 가).',
    });
  if ((basic === "physical" && !physical) || (basic === "elemental" && !elemental))
    ctx.addIssue({
      code: "custom",
      path: ["basic"],
      message: `basic이 가리키는 칸(${basic})이 무기에 없습니다.`,
    });
}

const weaponSchema = z
  .strictObject({
    /** 공격력 칸(D-465): 하나 또는 둘. 스킬은 기반에 맞는 칸을 쓰고, 그 칸이 없으면 그 스킬을 쓸 수 없다(D-490, 맨손 스킬 제외) */
    physical: weaponAttackField.optional(),
    elemental: weaponAttackField.optional(),
    /** 기본 공격이 쓰는 칸(질문 235 가): 두 칸 무기만 꼭 적는다. 한 칸 무기는 그 칸 */
    basic: attackFieldKind.optional(),
    ...weaponBody,
  })
  .superRefine(checkWeaponFields);

/** 타고난 무기(D-436 맨손): 물리 칸이 꼭 있다(기본 공격·물리 기반 맨손 스킬이 쓴다, D-490) */
const naturalWeaponSchema = z
  .strictObject({
    physical: weaponAttackField,
    elemental: weaponAttackField.optional(),
    basic: attackFieldKind.optional(),
    ...weaponBody,
  })
  .superRefine(checkWeaponFields);

/** 맨손 속성 자료(D-463): 속성 칸만 있다(기본 공격에는 쓰지 않아 basic도 없다) */
const naturalElementalWeaponSchema = z.strictObject({ elemental: weaponAttackField, ...weaponBody });

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
  /** 타고난 무기(D-436): 크리쳐의 발톱·이빨 등, 사람형은 맨손. 무기 칸이 비었을 때 쓴다(D-420 같은 공식). 물리 칸 필수 */
  naturalWeapon: naturalWeaponSchema,
  /** 맨손 속성 자료(D-463): 속성 기반 맨손 스킬(D-490)이 쓴다(공격력·적정치 낮게). 속성 칸만 */
  naturalElementalWeapon: naturalElementalWeaponSchema,
  /**
   * 타고난 무기를 스킬용 무기로 치나(D-490): 참이면 무기 칸이 비어도 타고난 무기의 칸으로 스킬을 쓴다(크리쳐 발톱·이빨).
   * 거짓이면 맨손 = 맨손 스킬만(사람형). 없으면 무기 칸(weapon)이 없는 종류만 참
   */
  naturalWeaponIsWeapon: z.boolean().optional(),
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
