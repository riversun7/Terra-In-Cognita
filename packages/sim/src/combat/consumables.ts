// 전투 중 물건 쓰기(287) — 자동 물약(D-509·D-510)과 탄약(D-497·D-509). docs/adr/2026-10-31-combat-core.md "바뀜 (2026-11-07, D-514·287)".
// 서버가 그 유닛이 든 보유 물건에서 사양(CombatUnitSpec.potions·ammo)을 만들고, 판정은 정수만 쓴다(굴림 없음 — 물약 양은 서버가
// 미리 셈한 값). 상태(남은 수·쿨 끝)는 유닛 상태라 스냅숏 재생이 바이트까지 같다. 사양에 칸이 없으면 아무것도 하지 않는다.
// - 물약: HP가 문턱(‰) 아래로 떨어지고 물약 쿨이 끝났으면 모자란 HP를 가장 덜 넘치게 채우는 것을 마신다(items/holding.ts pickPotion —
//   보유 물건 서비스 pickAutoPotion과 같은 고르기). 스태미나·행동 시각을 쓰지 않는다(D-509). 기절 중에는 마시지 않는다(행동 막힘).
//   한 번 채우는 양은 바로, 주기 회복 줄은 걸린 효과(heal, 주기)로 넣는다(효과 사전과 같은 틱 처리 tickEffects).
// - 탄약: 사양에 남은 탄이 있으면 기본 공격(유닛·건물) 한 번에 1 쓴다(빗나가도 쓴다 — 쏜 것). 0이면 기본 공격을 하지 않는다(D-497
//   "0이면 원거리 공격을 못 한다"). 스킬은 탄을 쓰지 않는다([임시] 해석, 확인 대기).
import { belowPotionThreshold, pickPotion } from "../items/holding.ts";
import type { BattlePotion, CombatUnitSpec, UnitState } from "./battleTypes.ts";

/** 사양 → 유닛 상태의 물건 칸(사양에 없으면 빈 객체 — 옛 상태 모양 그대로) */
export function consumableState(
  spec: CombatUnitSpec,
): Pick<UnitState, "ammoLeft" | "potionsLeft" | "potionReadyMs"> {
  const out: Pick<UnitState, "ammoLeft" | "potionsLeft" | "potionReadyMs"> = {};
  if (spec.ammo !== undefined) out.ammoLeft = Math.max(0, Math.floor(spec.ammo));
  if (spec.potions) {
    out.potionsLeft = spec.potions.items.map((item) => Math.max(0, Math.floor(item.count)));
    out.potionReadyMs = Math.max(0, spec.potions.readyMs);
  }
  return out;
}

/** 기본 공격에 쓸 탄이 있나(탄을 쓰지 않는 무기는 늘 참) */
export function hasAmmo(unit: UnitState): boolean {
  return unit.ammoLeft === undefined || unit.ammoLeft > 0;
}

/** 기본 공격 한 번의 탄(탄을 쓰는 무기만) */
export function spendShot(unit: UnitState): void {
  if (unit.ammoLeft !== undefined && unit.ammoLeft > 0) unit.ammoLeft -= 1;
}

/** 물약 하나가 채우는 HP 합(한 번 + 주기 줄의 틱 수 × 양) — 고르기(가장 덜 넘치게)에 쓴다 */
export function potionHeal(potion: BattlePotion): number {
  let total = Math.max(0, potion.instant);
  for (const line of potion.over ?? [])
    if (line.tickMs > 0) total += Math.max(0, line.amount) * Math.floor(line.durationMs / line.tickMs);
  return total;
}

/** 마신 물약(관찰자·시험용): 사양 차례 번호와 바로 오른 HP */
export interface PotionDrink {
  readonly index: number;
  readonly healed: number;
}

/**
 * 자동 물약 한 번(D-510): 산 유닛, HP < 문턱, 쿨 끝, 남은 물약이 있으면 고르고 마신다. 마셨으면 그 물약, 아니면 null.
 * 주기 회복 줄은 같은 효과 ID가 걸려 있으면 새 값·시간으로 바꾼다(효과 사전 refresh와 같다)
 */
export function drinkPotion(unit: UnitState, nowMs: number): PotionDrink | null {
  const potions = unit.potions;
  const left = unit.potionsLeft;
  if (!potions || !left || unit.status !== "alive") return null;
  if ((unit.potionReadyMs ?? 0) > nowMs) return null;
  if (!belowPotionThreshold(unit.hp, unit.maxHp, potions.thresholdPm)) return null;
  const candidates = potions.items.flatMap((item, index) =>
    (left[index] ?? 0) > 0 ? [{ index, heal: potionHeal(item) }] : [],
  );
  const pick = pickPotion(Math.max(0, unit.maxHp - unit.hp), candidates);
  const potion = pick ? potions.items[pick.index] : undefined;
  if (!pick || !potion) return null;
  left[pick.index] = (left[pick.index] ?? 0) - 1;
  unit.potionReadyMs = nowMs + Math.max(0, potions.cooldownMs);
  const before = unit.hp;
  unit.hp = Math.min(unit.maxHp, unit.hp + Math.max(0, potion.instant));
  for (const line of potion.over ?? []) {
    if (line.tickMs <= 0 || line.durationMs <= 0 || line.amount <= 0) continue;
    const effect = {
      id: line.effect,
      kind: "heal" as const,
      stat: null,
      valueMode: "flat" as const,
      status: null,
      tickMs: line.tickMs,
      value: line.amount,
      stacks: 1,
      untilMs: nowMs + line.durationMs,
      nextTickMs: nowMs + line.tickMs,
    };
    const at = unit.effects.findIndex((entry) => entry.id === line.effect);
    if (at >= 0) unit.effects[at] = effect;
    else unit.effects.push(effect);
  }
  return { index: pick.index, healed: unit.hp - before };
}

/** 결과에 돌려주는 물건 쓴 양 */
export interface ConsumablesUsed {
  shots?: number;
  potions?: { id: number; used: number }[];
  /** 마신 물약이 있으면 물약 쿨이 끝나는 전투 시각(ms) — 세계가 그 실제 시각까지 물약 쿨을 건다(D-509 전투·비전투 하나) */
  potionReadyMs?: number;
}

/** 결과에 돌려주는 물건 쓴 양: 쏜 탄 수, 물약 칸마다 마신 수(0인 칸은 뺀다)와 쿨 끝. 사양에 칸이 없으면 없음 */
export function consumablesUsed(unit: UnitState): ConsumablesUsed {
  const out: ConsumablesUsed = {};
  if (unit.ammo !== undefined && unit.ammoLeft !== undefined)
    out.shots = Math.max(0, Math.floor(unit.ammo) - unit.ammoLeft);
  if (unit.potions && unit.potionsLeft) {
    const left = unit.potionsLeft;
    const used = unit.potions.items.flatMap((item, index) => {
      const count = Math.max(0, Math.floor(item.count)) - (left[index] ?? 0);
      return count > 0 ? [{ id: item.id, used: count }] : [];
    });
    if (used.length > 0) {
      out.potions = used;
      out.potionReadyMs = unit.potionReadyMs ?? 0;
    }
  }
  return out;
}
