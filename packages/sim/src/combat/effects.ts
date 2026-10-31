// 효과 — docs/adr/2026-10-31-combat-core.md 7절, 기획 D-425(효과 사전 하나)·D-429(상태이상 저항 = 1차 스탯)
// 효과 사전 항목(EffectDef)은 콘텐츠 팩 `effects`에서 온다. 전투가 쓰는 종류만 둔다: 버프·디버프(수치 바꿈), 지속 피해(dot),
// 회복(heal, 한 번 또는 주기), 상태이상(기절·묶임·침묵). 값(세기)은 효과를 거는 쪽(스킬·아이템)이 정한다.
// 걸린 효과(ActiveEffect)는 유닛 상태에 들어가므로 스냅숏에 남는다(직렬화할 수 있는 값만).
// [임시] 종류·수치 칸·쌓임 규칙은 기획 본문 48을 받기 전 기술 기본안이다.

export type EffectKind = "buff" | "debuff" | "dot" | "heal" | "status";
/** 버프·디버프가 바꾸는 전투 수치. attack은 ‰ 배율(버프 항), 나머지는 ‰ 더하기 */
export type ModifierStat = "attack" | "defense_rate" | "evade" | "penetration" | "crit_multiplier";
export type StatusKind = "stun" | "root" | "silence";

export interface EffectDef {
  readonly id: string;
  readonly kind: EffectKind;
  /** 버프·디버프가 바꾸는 수치 */
  readonly stat?: ModifierStat | undefined;
  /** dot·heal 세기: flat = 값 그대로, permille = 대상 최대 체력의 ‰ */
  readonly valueMode: "flat" | "permille";
  /** 기본 지속(ms, 0 = 전투 내내). 거는 쪽(스킬 효과 부품)이 바꿀 수 있다 */
  readonly durationMs: number;
  /** 주기(ms). dot·heal에서 0이면 한 번만(heal) */
  readonly tickMs: number;
  /** 같은 효과가 또 걸릴 때: refresh = 시간·값 새로, stack = 겹침(최대 maxStacks), ignore = 그대로 */
  readonly stacking: "refresh" | "stack" | "ignore";
  readonly maxStacks: number;
  readonly status?: StatusKind | undefined;
  /** 상태이상 저항(D-429): 확률 모양 상한(‰) × 점수 ÷ (점수 + 반감 상수), 점수 = Σ 1차 × 가중치‰ ÷ 1000 */
  readonly resist?:
    | { readonly cap: number; readonly halfConstant: number; readonly weights: readonly number[] }
    | undefined;
}

export interface ActiveEffect {
  readonly id: string;
  readonly kind: EffectKind;
  readonly stat: ModifierStat | null;
  readonly valueMode: "flat" | "permille";
  readonly status: StatusKind | null;
  readonly tickMs: number;
  value: number;
  stacks: number;
  /** 끝나는 시각(ms). −1이면 전투 내내(지속형 스킬) */
  untilMs: number;
  nextTickMs: number;
}

/** 효과를 받는 쪽이 들고 있어야 하는 것 */
export interface EffectHolder {
  hp: number;
  readonly maxHp: number;
  status: "alive" | "down" | "retreated";
  effects: ActiveEffect[];
  command: unknown;
}

export interface Modifiers {
  readonly attackPm: number;
  readonly defenseRatePm: number;
  readonly evadePm: number;
  readonly penetrationPm: number;
  readonly critMulPm: number;
}

/** 상태이상 저항(‰). 저항 칸이 없으면 0 */
export function statusResistPm(def: EffectDef, primaries: readonly number[]): number {
  if (!def.resist) return 0;
  let weighted = 0;
  for (let i = 0; i < 6; i++) weighted += (primaries[i] ?? 0) * (def.resist.weights[i] ?? 0);
  const score = Math.floor(weighted / 1000);
  if (score <= 0) return 0;
  return Math.floor((def.resist.cap * score) / (score + def.resist.halfConstant));
}

/** 효과를 건다. durationMs 0 = 전투 내내 */
export function applyEffect(
  target: EffectHolder,
  def: EffectDef,
  value: number,
  durationMs: number,
  nowMs: number,
): void {
  const untilMs = durationMs > 0 ? nowMs + durationMs : -1;
  if (def.kind === "heal" && def.tickMs <= 0) {
    heal(target, def.valueMode, value);
    return;
  }
  const found = target.effects.find((effect) => effect.id === def.id);
  if (found) {
    if (def.stacking === "ignore") return;
    if (def.stacking === "stack") found.stacks = Math.min(def.maxStacks, found.stacks + 1);
    found.value = value;
    found.untilMs = untilMs;
    return;
  }
  target.effects.push({
    id: def.id,
    kind: def.kind,
    stat: def.stat ?? null,
    valueMode: def.valueMode,
    status: def.status ?? null,
    tickMs: def.tickMs,
    value,
    stacks: 1,
    untilMs,
    nextTickMs: nowMs + def.tickMs,
  });
}

function amountOf(target: EffectHolder, mode: "flat" | "permille", value: number): number {
  return mode === "flat" ? value : Math.floor((target.maxHp * value) / 1000);
}

function heal(target: EffectHolder, mode: "flat" | "permille", value: number): void {
  target.hp = Math.min(target.maxHp, target.hp + Math.max(0, amountOf(target, mode, value)));
}

/** 틱 처음: 끝난 효과를 지우고, 주기가 된 dot·heal을 적용한다. dot로 쓰러질 수 있다 */
export function tickEffects(target: EffectHolder, nowMs: number): void {
  if (target.effects.length === 0) return;
  target.effects = target.effects.filter((effect) => effect.untilMs < 0 || effect.untilMs > nowMs);
  for (const effect of target.effects) {
    if ((effect.kind !== "dot" && effect.kind !== "heal") || effect.tickMs <= 0) continue;
    while (effect.nextTickMs <= nowMs && target.status === "alive") {
      effect.nextTickMs += effect.tickMs;
      const amount = Math.max(0, amountOf(target, effect.valueMode, effect.value)) * effect.stacks;
      if (effect.kind === "heal") target.hp = Math.min(target.maxHp, target.hp + amount);
      else target.hp -= amount;
      if (target.hp <= 0) {
        target.hp = 0;
        target.status = "down";
        target.command = null;
      }
    }
  }
}

export function hasStatus(target: EffectHolder, status: StatusKind): boolean {
  return target.effects.some((effect) => effect.status === status);
}

export function hasEffect(target: EffectHolder, id: string): boolean {
  return target.effects.some((effect) => effect.id === id);
}

const NO_MODIFIERS: Modifiers = {
  attackPm: 0,
  defenseRatePm: 0,
  evadePm: 0,
  penetrationPm: 0,
  critMulPm: 0,
};

/** 버프(+)·디버프(−) 합 */
export function modifiersOf(target: EffectHolder): Modifiers {
  if (target.effects.length === 0) return NO_MODIFIERS;
  const sum = { ...NO_MODIFIERS };
  for (const effect of target.effects) {
    if ((effect.kind !== "buff" && effect.kind !== "debuff") || effect.stat === null) continue;
    const value = (effect.kind === "buff" ? effect.value : -effect.value) * effect.stacks;
    if (effect.stat === "attack") sum.attackPm += value;
    else if (effect.stat === "defense_rate") sum.defenseRatePm += value;
    else if (effect.stat === "evade") sum.evadePm += value;
    else if (effect.stat === "penetration") sum.penetrationPm += value;
    else sum.critMulPm += value;
  }
  return sum;
}
