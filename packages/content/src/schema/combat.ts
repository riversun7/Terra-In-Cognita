// 전투 자료 분류 — 효과 사전·스킬·유닛 종류(장비 칸)와 아이템 장비 칸. docs/adr/2026-10-31-combat-core.md 7절
// 기획: 장비 칸(D-422), 장비가 올리는 스탯(D-423), 적정치 미달(D-424), 효과 사전(D-425), 스킬 두 갈래·칸·부품(D-426~D-428),
// 상태이상 저항 = 1차 스탯(D-429), 켬·끔(D-398), 구조 값(D-5054). 계산은 packages/sim combat/(effects·skills·equipment).
// [임시] 기획 본문 48(스탯·공식)을 받기 전 기술 기본안이다. 칸 이름·부품 종류·수치 범위는 본문이 오면 맞춘다.
// 칸 목록은 @terra/shared/roster EQUIP_SLOTS 하나다(아이템 편집기 WP-2에서 세 벌을 모았다). 1차 스탯 코드는 sim 시험이 맞춰 본다.
import { ELEMENT_IDS, ELEMENT_MAX } from "@terra/shared/cyborg";
import { EQUIP_SLOTS } from "@terra/shared/roster";
import { z } from "zod";
import { ContentRef, contentId, localizedText, ref } from "./common.ts";

export const PRIMARY_STAT_CODES = ["str", "dex", "agi", "vit", "int", "wis"] as const;
/** 장비 칸 종류(D-422). 목록은 @terra/shared/roster EQUIP_SLOTS 하나다(팩·sim·화면이 같이 쓴다) */
export const EQUIP_SLOT_KINDS = EQUIP_SLOTS;
/** 1차 스탯을 올리는 칸(D-423, 48 §5.2: 장신구·인공장기·부품·크리쳐 안장). 나머지 칸은 2차 수치 */
export const PRIMARY_STAT_SLOTS: readonly string[] = ["accessory", "organ", "part", "saddle"];
/** 장비가 올리지 않는 2차 행(D-438 1 그대로: 스탯 공격력은 1차·장신구·버프만. 무기 몫은 무기 사양이 더한다, D-502) */
export const GEAR_FORBIDDEN_ROWS: readonly string[] = ["physical_attack", "elemental_attack"];

const enabled = z.boolean({ error: "enabled가 없습니다. true 또는 false로 적으세요(D-398 켬·끔)." });
const permille = z.int().min(-100_000).max(100_000);
const weights = z.array(z.int().min(-100_000).max(100_000)).length(6);

/** 버프·디버프가 바꾸는 전투 수치(판정 코드 packages/sim effects.ts ModifierStat과 같은 목록) */
export const EFFECT_COMBAT_STATS = [
  "attack",
  "defense_rate",
  "evade",
  "penetration",
  "crit_multiplier",
  "move_speed",
  "shield_regen",
] as const;
/**
 * 효과가 바꿀 수 있는 수치 = 전투 수치 + 1차 스탯 6개(D-425 "대상 스탯 1차 또는 2차", D-472 요리 버프: 농작물 INT·WIS, 목축 STR·VIT,
 * 낚시 DEX·AGI). 1차 스탯 버프는 전투 판정이 아직 읽지 않는다(전투 사양은 시작할 때 셈한 2차라서 — 소비 실행 줄기에서 잇는다)
 */
export const EFFECT_STATS = [...EFFECT_COMBAT_STATS, ...PRIMARY_STAT_CODES] as const;

export const effectEntrySchema = z
  .strictObject({
    id: contentId,
    name: localizedText,
    description: localizedText.optional(),
    kind: z.enum(["buff", "debuff", "dot", "heal", "status"]),
    /**
     * 버프·디버프가 바꾸는 수치(move_speed = 이동 속도 ‰, 디버프면 느리게. shield_regen = 쉴드 재생 ‰, 디버프면 저주, D-490). 1차 스탯
     * (str·dex·agi·vit·int·wis)은 요리 버프 등(D-472)이고 전투 판정은 아직 읽지 않는다
     */
    stat: z.enum(EFFECT_STATS).optional(),
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
    /**
     * 배타 묶음 코드(D-472·D-425 중첩 규칙: 요리 버프는 하나만 — 예 "food"). 같은 묶음의 효과는 한 유닛에 하나만 걸린다. 교체(D-501):
     * 같은 효과면 높은 값만 남기고, 다른 효과면 확인 창 뒤 새 것으로 바꾼다. 자동 사용은 그 상황에 더 좋을 때만 바꾸고 같거나 더 좋은 것이
     * 걸려 있으면 쓰지 않는다(낭비 막기, 판단식은 보유 물건·자동 행동 줄기). 지금은 자료와 편집기만(판정이 읽지 않는다)
     */
    exclusive: contentId.optional(),
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
        params: { rule: "effect_stat_required" },
      });
    if (!needsStat && entry.stat !== undefined)
      ctx.addIssue({
        code: "custom",
        path: ["stat"],
        message: "stat은 버프·디버프에만 씁니다.",
        params: { rule: "effect_stat_kind" },
      });
    if ((entry.kind === "status") !== (entry.status !== undefined))
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "status는 상태이상(kind: status)에만, 그리고 꼭 적습니다.",
        params: { rule: "effect_status_kind" },
      });
    if (entry.resist !== undefined && entry.kind !== "status")
      ctx.addIssue({
        code: "custom",
        path: ["resist"],
        message: "저항(resist)은 상태이상에만 씁니다(D-429).",
        params: { rule: "effect_resist_kind" },
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
export const SKILL_SHAPES = ["single", "projectile", "area", "chain", "heal", "buff", "debuff", "move"] as const;
const ENEMY_SHAPES: readonly string[] = ["single", "projectile", "area", "chain", "debuff", "move"];
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
  if (shape === "move" && damage !== "none")
    fail("damage", "모양 move는 피해 없이(damage: none) 자기 몸만 옮깁니다. 끝에 치면 single·area에 move 칸을 답니다.");
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

/** 자기 몸 이동 부품(docs/adr/2026-11-15-combat-moves.md 2절, 칸 단위) */
const cells = z.int().min(1).max(32);
const moveDuration = z.int().min(100).max(600_000);
const movePart = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("dash"), cells, hitRange: z.int().min(1).max(8).optional() }),
  z.strictObject({ kind: z.literal("leap"), cells }),
  z.strictObject({ kind: z.literal("blink"), cells, dir: z.enum(["toward", "away"]) }),
  z.strictObject({ kind: z.literal("backstep"), cells }),
  z.strictObject({ kind: z.literal("stealth"), durationMs: moveDuration }),
  z.strictObject({ kind: z.literal("detect"), cells, durationMs: moveDuration }),
]);
/** 맞은 대상 옮김 부품 */
const displacePart = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("knockback"), cells }),
  z.strictObject({ kind: z.literal("pull"), cells }),
  z.strictObject({ kind: z.literal("root"), durationMs: moveDuration }),
]);
/** 스킬이 고르는 계수 곡선(@terra/sim combat/curves.ts SKILL_CURVES와 같다) */
export const SKILL_CURVE_IDS = [
  "range_interval",
  "magic_distance",
  "magic_targets",
  "dot_total",
  "close_shot",
] as const;
const MOTION_KINDS: readonly string[] = ["dash", "leap", "blink", "backstep"];
const DISPLACE_SHAPES: readonly string[] = ["single", "projectile", "area", "chain", "debuff"];
const SHOT_SHAPES: readonly string[] = ["single", "projectile"];

/** 움직임 부품·곡선 칸이 모양·대상과 맞는지(필드 검사가 실패해도 불리므로 모양을 다시 본다) */
function checkSkillMoves(entry: unknown, ctx: z.RefinementCtx): void {
  if (typeof entry !== "object" || entry === null) return;
  const get = (key: string): unknown => Reflect.get(entry, key);
  const fail = (path: string, message: string): void => {
    ctx.addIssue({ code: "custom", path: [path], message });
  };
  const shape = get("shape");
  const target = get("target");
  const move = get("move");
  const moveKind = typeof move === "object" && move !== null ? Reflect.get(move, "kind") : undefined;
  const motion = typeof moveKind === "string" && MOTION_KINDS.includes(moveKind);
  if (motion && target !== "enemy")
    fail("move", "돌진·도약·점멸·뒷걸음은 적을 기준으로 움직입니다(target: enemy).");
  if ((moveKind === "stealth" || moveKind === "detect") && (target !== "self" || shape !== "buff"))
    fail("move", "은신·감지는 자기에게 거는 buff 모양입니다(target: self).");
  if (shape === "move" && !motion)
    fail("move", "모양 move는 자기 몸 이동 부품(dash·leap·blink·backstep)이 있어야 합니다.");
  if (get("displace") !== undefined && (typeof shape !== "string" || !DISPLACE_SHAPES.includes(shape)))
    fail("displace", "밀치기·끌어오기·묶기는 적에게 맞는 모양(single·projectile·area·chain·debuff)에만 답니다.");
  if (get("shots") !== undefined && (typeof shape !== "string" || !SHOT_SHAPES.includes(shape)))
    fail("shots", "연사(shots)는 대상 하나 모양(single·projectile)에만 답니다.");
  const curves = get("curves");
  if (Array.isArray(curves)) {
    if (new Set(curves).size !== curves.length) fail("curves", "곡선 이름이 겹칩니다.");
    if (curves.length > 0 && get("damage") === "none" && !curves.every((curve) => curve === "dot_total"))
      fail("curves", "피해 곡선은 피해를 주는 스킬에만 답니다(지속 피해 합 dot_total 빼고).");
  }
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
    /** 자기 몸 이동 부품(돌진·도약·점멸·뒷걸음·은신·감지, docs/adr/2026-11-15-combat-moves.md). 없으면 옛 스킬 */
    move: movePart.optional(),
    /** 맞은 대상 옮김(밀치기·끌어오기·묶기) */
    displace: displacePart.optional(),
    /** 고른 계수 곡선(사거리 간격 예산·마법 거리·마법 대상 수·지속 피해 합·가까이 쏘기) */
    curves: z.array(z.enum(SKILL_CURVE_IDS)).max(SKILL_CURVE_IDS.length).optional(),
    /** 연사 수(대상 하나 모양만, 발마다 따로 굴림·한 발 배율 곡선) */
    shots: z.int().min(2).max(8).optional(),
    enabled,
  })
  .superRefine((entry, ctx) => {
    checkSkillShape(entry, ctx);
    checkSkillMoves(entry, ctx);
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

/** 무기 공격력 칸 하나(D-465): 무기 공격력. 공격력 = 스탯 공격력 + 이 값 × 적정 비율(D-502) */
const weaponAttackField = z.strictObject({
  attack: z.int().min(0).max(1_000_000),
});
const attackFieldKind = z.enum(["physical", "elemental"]);

/** 무기 적정 스탯 칸(몫 차례: 물리 공격·속성 공격·명중과 크리·공격 간격) */
export const WEAPON_APPROPRIATE_CODES = ["str", "int", "dex", "agi"] as const;

/**
 * 무기 1차 적정 스탯(D-502, 사용자 답 296~298): 몫마다 하나 — str = 물리 공격 몫, int = 속성 공격 몫, dex = 명중·크리, agi = 공격 간격.
 * 착용 제한이 아니다(D-424). 못 미치면 그 몫이 비율대로 줄고(공격 간격은 길어지고), 넘는 보너스는 없다(N10 1000‰). 없는 칸은 비율 100%.
 * 1차를 섞지 않는다(질문 296 "공격력은 str만이지 섞는게 아니다")
 */
export const weaponAppropriateSchema = z
  .strictObject({
    str: z.int().min(1).max(10_000_000).optional(),
    int: z.int().min(1).max(10_000_000).optional(),
    dex: z.int().min(1).max(10_000_000).optional(),
    agi: z.int().min(1).max(10_000_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (typeof value !== "object" || value === null) return;
    if (WEAPON_APPROPRIATE_CODES.every((code) => Reflect.get(value, code) === undefined))
      ctx.addIssue({
        code: "custom",
        path: [],
        message:
          "1차 적정 스탯(appropriate)은 적어도 하나를 적습니다(str·int·dex·agi). 없으면 칸을 빼세요(비율 100%).",
        params: { rule: "weapon_appropriate_empty" },
      });
  });
/** 무기 사양의 공격력 칸 말고 나머지(명중·크리·간격·사거리·비용·옵션 계수·1차 적정 스탯) */
const weaponBody = {
  hitPm: z.int().min(0).max(1000),
  critPm: z.int().min(0).max(1000),
  intervalMs: z.int().min(100).max(60_000),
  range: z.int().min(1).max(128),
  arc: z.boolean(),
  staminaCost: z.int().min(0).max(100_000),
  mpCost: z.int().min(0).max(100_000),
  /** 속성 계수 12칸(‰): 물리 칸으로 치면 옵션(속성 몫), 속성 칸으로 치면 가산 계수(48 §4.5a). 두 칸 무기는 두 칸이 같이 쓴다 */
  skillElementsPm: z.array(permille).length(12).optional(),
  /** 1차 적정 스탯(D-502, 위) */
  appropriate: weaponAppropriateSchema.optional(),
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
        "무기에 공격력 칸이 없습니다. physical(물리)·elemental(속성) 가운데 하나 이상을 {attack}으로 적으세요(D-465).",
      params: { rule: "weapon_field_missing" },
    });
    return;
  }
  if (physical && elemental && basic === undefined)
    ctx.addIssue({
      code: "custom",
      path: ["basic"],
      message:
        '두 칸 무기는 기본 공격(스킬 없음)이 쓸 칸을 basic에 적습니다: "physical" 또는 "elemental"(질문 235 가).',
      params: { rule: "weapon_basic_required" },
    });
  if ((basic === "physical" && !physical) || (basic === "elemental" && !elemental))
    ctx.addIssue({
      code: "custom",
      path: ["basic"],
      message: `basic이 가리키는 칸(${basic})이 무기에 없습니다.`,
      params: { rule: "weapon_basic_field" },
    });
}

/**
 * 맨손 규칙(D-502): 맨손(unarmed)은 무기 몫이 없고(공격력 칸 attack 0) 적정 DEX·AGI를 레벨로 센다(계산식 bare_appropriate, 옛 규칙
 * 레벨 × 1.5 + 10). 그래서 attack이 0이 아니거나 appropriate를 적으면 실패다. 필드 검사가 실패해도 불리므로 값의 모양을 다시 본다
 */
function checkUnarmed(weapon: unknown, ctx: z.RefinementCtx): void {
  if (typeof weapon !== "object" || weapon === null || Reflect.get(weapon, "unarmed") !== true) return;
  for (const kind of ["physical", "elemental"] as const) {
    const field: unknown = Reflect.get(weapon, kind);
    const attack: unknown = typeof field === "object" && field !== null ? Reflect.get(field, "attack") : 0;
    if (typeof attack === "number" && attack !== 0)
      ctx.addIssue({
        code: "custom",
        path: [kind, "attack"],
        message: "맨손(unarmed)은 무기 몫이 없습니다: attack은 0입니다(D-502, 공격력 = 스탯 공격력만).",
        params: { rule: "unarmed_attack" },
      });
  }
  if (Reflect.get(weapon, "appropriate") !== undefined)
    ctx.addIssue({
      code: "custom",
      path: ["appropriate"],
      message:
        "맨손(unarmed)의 적정 DEX·AGI는 레벨로 셉니다(계산식 bare_appropriate). appropriate를 적지 않습니다.",
      params: { rule: "unarmed_appropriate" },
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
    /** 양손 무기(48 §5.5): 든 동안 보조 칸 장비를 쓰지 않는다(전투 연결 WP-5) */
    twoHanded: z.boolean().optional(),
    /**
     * 탄약 연결(48 §5.5, D-496): 이 무기가 쓰는 보조 칸 무기 종류(화살통·탄창). 원거리 타격마다 1씩 쓰고 떨어지면 원거리 공격을
     * 못 한다(전투 규칙은 다음 줄기). 보조 칸 종류만 가리킨다(팩 검사)
     */
    ammo: ref("weapon_types").optional(),
  })
  .superRefine(checkWeaponFields);

/** 타고난 무기(D-436 맨손): 물리 칸이 꼭 있다(기본 공격·물리 기반 맨손 스킬이 쓴다, D-490) */
const naturalWeaponSchema = z
  .strictObject({
    physical: weaponAttackField,
    elemental: weaponAttackField.optional(),
    basic: attackFieldKind.optional(),
    ...weaponBody,
    /**
     * 사람형 맨손(D-502): 참이면 무기 몫이 없고(attack 0) 적정 DEX·AGI = 계산식 bare_appropriate(레벨 × 1.5 + 10)(checkUnarmed).
     * 없으면 무기와 같다(크리쳐 발톱 등: 무기 공격력·1차 적정 스탯)
     */
    unarmed: z.boolean().optional(),
  })
  .superRefine((weapon, ctx) => {
    checkWeaponFields(weapon, ctx);
    checkUnarmed(weapon, ctx);
  });

/** 맨손 속성 자료(D-463): 속성 칸만 있다(기본 공격에는 쓰지 않아 basic도 없다). unarmed는 타고난 무기와 같다(D-502) */
const naturalElementalWeaponSchema = z
  .strictObject({ elemental: weaponAttackField, ...weaponBody, unarmed: z.boolean().optional() })
  .superRefine(checkUnarmed);

export const unitKindEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  /**
   * 장비 칸 차례(구조 값 D-5054: 바꾸면 칸 번호에 기댄 곳이 흔들린다 — 편집기 화면에는 바꾸는 칸이 없고 팩 커밋으로만 바꾼다): 사람형 공통 6칸 + 종류별 강화 칸,
   * 크리쳐 3칸 무기·방어구·장신구(D-494가 D-422 "크리쳐 2칸"을 바꿈)
   */
  slots: z.array(z.enum(EQUIP_SLOT_KINDS)).min(1).max(32),
  /** 스킬 칸(D-427): 종 기본 + 환생마다, 상한 10(구조 값) */
  skillSlots: z.strictObject({
    base: z.int().min(0).max(10),
    perRebirth: z.int().min(0).max(10),
    max: z.int().min(1).max(10),
  }),
  /** 타고난 무기(D-436): 크리쳐의 발톱·이빨 등, 사람형은 맨손. 무기 칸이 비었을 때 쓴다(D-502 같은 공식). 물리 칸 필수 */
  naturalWeapon: naturalWeaponSchema,
  /** 맨손 속성 자료(D-463): 속성 기반 맨손 스킬(D-490)이 쓴다(맨손이면 무기 몫 0, D-502). 속성 칸만 */
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
    /** 무기 종류(48 §5.5): 무기·보조 칸만. 그 종류의 칸이 이 아이템 칸과 같아야 한다(팩 검사) */
    weaponType: ref("weapon_types").optional(),
    /** 최대 내구도(전투마다 조금씩, 지면 더 닳는다 D-496. 실행 규칙은 내구도 줄기) */
    maxDurability: z.int().min(1).max(1_000_000).optional(),
    /**
     * 전투 직접 값(D-421, 48 §3.4): 속성별 저항‰ 12칸(ELEMENT_IDS 차례)·고정 방어·비율 관통‰. 여러 장비의 값은 더한다(D-178).
     * 전투 연결은 WP-5(sim 유닛 사양 resistPm·defenseFlat·penetrationPm)
     */
    combat: z
      .strictObject({
        resistPm: z.array(z.int().min(-1000).max(1000)).length(ELEMENT_IDS.length).optional(),
        defenseFlat: z.int().min(0).max(10_000_000).optional(),
        penetrationPm: z.int().min(0).max(1000).optional(),
      })
      .optional(),
    /** 입을 수 있는 유닛 종류(D-494 크리쳐 전용 장비 등). 없으면 그 칸을 가진 모든 종류. 거르기는 WP-5·WP-C */
    kinds: z.array(ref("unit_kinds")).min(1).max(8).optional(),
    /**
     * 크리쳐 보유(D-494): 조우 때 개체마다 무작위로 가지는 상대 빈도(weight, 후보끼리)와 훔치기로 얻는 확률(stealPm, 드롭률보다 높게).
     * 굴리기·훔치기는 크리쳐·전투 줄기
     */
    creature: z
      .strictObject({ weight: z.int().min(0).max(1_000_000), stealPm: z.int().min(0).max(1000) })
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
          params: { rule: wantPrimary ? "equip_stat_primary" : "equip_stat_secondary" },
        });
      if (entry.stat instanceof ContentRef && GEAR_FORBIDDEN_ROWS.includes(entry.stat.id))
        ctx.addIssue({
          code: "custom",
          path: ["stats", index, "stat"],
          message: "장비는 스탯 공격력을 올리지 않습니다(D-438 1, 무기 몫은 weapon 칸의 무기 공격력 D-502).",
          params: { rule: "equip_stat_forbidden" },
        });
      if (typeof entry.min === "number" && typeof entry.max === "number" && entry.min > entry.max)
        ctx.addIssue({
          code: "custom",
          path: ["stats", index],
          message: "min이 max보다 큽니다.",
          params: { rule: "equip_stat_range" },
        });
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
            params: { rule: "equip_element_duplicate" },
          });
        seen.add(entry.element);
      });
    }
    if ((equip.weapon !== undefined) !== (equip.slot === "weapon"))
      ctx.addIssue({
        code: "custom",
        path: ["weapon"],
        message: "무기 칸(weapon)에는 무기 사양을 꼭, 다른 칸에는 쓰지 않습니다.",
        params: { rule: "equip_weapon_slot" },
      });
    if (equip.weaponType !== undefined && equip.slot !== "weapon" && equip.slot !== "offhand")
      ctx.addIssue({
        code: "custom",
        path: ["weaponType"],
        message: "무기 종류(weaponType)는 무기·보조 칸(weapon·offhand) 장비에만 씁니다.",
        params: { rule: "equip_weapon_type_slot" },
      });
    if (Array.isArray(equip.kinds)) {
      const seen = new Set<string>();
      equip.kinds.forEach((kind, index) => {
        const id = kind instanceof ContentRef ? kind.id : undefined;
        if (id === undefined) return;
        if (seen.has(id))
          ctx.addIssue({
            code: "custom",
            path: ["kinds", index],
            message: `유닛 종류 ${id}가 두 번 있습니다.`,
            params: { rule: "equip_kind_duplicate" },
          });
        seen.add(id);
      });
    }
  });
export type EquipEntry = z.output<typeof equipSchema>;
