// 보유 물건 화면 자료 다듬기 — 순수 함수(시험 대상, holdingsModel.test.ts). 문구는 holdingsText.ts가 붙인다.
// - 수치(내구도·신선도·점수·남은 시각)는 서버가 보낸 값을 그대로 보인다. 기기는 다시 셈하지 않고 단위만 바꾼다.
// - 칸 번호(slot) = 그 유닛 칸 배치의 차례(서버 holdings.list units, 없으면 화면이 가진 팩 칸 배치). 입을 칸은 버튼을 고르는 데만 쓰고
//   맞는지는 서버가 판정한다(wrong_slot·broken).
// - 정렬·묶음은 옛 LocationInventory를 따른다: 장비 → 소모품 → 그 밖, 같은 묶음은 이름 차례. 걸러 보기는 전체·장비·소모품.
import type {
  HoldingView,
  HoldingsListResponse,
  UnitCooldownView,
  UnitEffectView,
} from "@terra/shared/holdings";

export type HoldingFilter = "all" | "equipment" | "consumable";
export const HOLDING_FILTERS: readonly HoldingFilter[] = ["all", "equipment", "consumable"];

/** 막대 색 단계(옛 화면: 60% 넘음 초록, 30% 넘음 노랑, 그 아래 빨강) */
export type Tone = "high" | "mid" | "low";

export interface SlotCell {
  /** 칸 번호(칸 배치 차례) */
  readonly index: number;
  /** 칸 종류(팩 unit_kinds slots 값) */
  readonly kind: string;
  readonly holding: HoldingView | null;
}

export interface UnitHoldings {
  readonly unit: number;
  readonly slots: readonly SlotCell[];
  /** 든 물건(입지 않은 것, 칸 배치 밖 번호에 입은 것 포함) */
  readonly carried: readonly HoldingView[];
  /** 지금 걸린 효과(끝난 것 뺌, 남은 시간 짧은 차례) */
  readonly effects: readonly UnitEffectView[];
  /** 아직 도는 쓰기 쿨 */
  readonly cooldowns: readonly UnitCooldownView[];
}

/** 이 물건이 장비인가(입는 칸이 있거나 하나하나 모양) */
export const isEquipment = (holding: HoldingView): boolean =>
  (holding.equipSlot ?? null) !== null || holding.kind === "instance";

/** 이 물건을 쓸 수 있는가(쓰기 쿨 종류가 있음) */
export const isUsable = (holding: HoldingView): boolean => (holding.useCooldown ?? null) !== null;

/** 포장된 식품 칸인가(D-524 — [포장 풀기]를 보인다). 옛 서버는 packed를 보내지 않는다(false) */
export const isPacked = (holding: HoldingView): boolean => holding.packed === true;

/** 내구도 0(입지 못함, 수리 필요 — N49 286) */
export const isBroken = (holding: HoldingView): boolean =>
  holding.durability !== null && holding.maxDurability !== null && holding.durability <= 0;

/** 정렬 묶음: 장비 0 → 쓸 수 있는 것 1 → 그 밖 2 */
const groupOf = (holding: HoldingView): number => (isEquipment(holding) ? 0 : isUsable(holding) ? 1 : 2);

/** 유닛 하나의 칸·든 물건·효과·쿨. layout은 서버 칸 배치가 없을 때 쓰는 팩 칸 배치(사이보그 화면의 본체 칸 등) */
export function unitHoldings(
  data: HoldingsListResponse,
  unit: number,
  fallbackLayout: readonly string[],
  now: number,
  compare: (a: string, b: string) => number,
  nameOf: (holding: HoldingView) => string,
): UnitHoldings {
  const layout = data.units?.find((entry) => entry.unit === unit)?.slots ?? fallbackLayout;
  const mine = data.holdings.filter((holding) => holding.unit === unit);
  const slots = layout.map(
    (kind, index): SlotCell => ({
      index,
      kind,
      holding: mine.find((holding) => holding.slot === index) ?? null,
    }),
  );
  const carried = mine
    .filter((holding) => holding.slot === null || holding.slot >= layout.length)
    .toSorted((a, b) => groupOf(a) - groupOf(b) || compare(nameOf(a), nameOf(b)) || a.id - b.id);
  return {
    unit,
    slots,
    carried,
    effects: data.effects
      .filter((effect) => effect.unit === unit && effect.until > now)
      .toSorted((a, b) => a.until - b.until || compare(a.effect, b.effect)),
    cooldowns: data.cooldowns
      .filter((cooldown) => cooldown.unit === unit && cooldown.until > now)
      .toSorted((a, b) => a.until - b.until),
  };
}

export function filterHoldings(list: readonly HoldingView[], filter: HoldingFilter): HoldingView[] {
  if (filter === "equipment") return list.filter(isEquipment);
  if (filter === "consumable") return list.filter((holding) => !isEquipment(holding));
  return [...list];
}

/** 이 칸에 입을 수 있는 든 물건(칸 종류가 같은 장비, 파손도 보이고 화면이 막는다) */
export function slotChoices(view: UnitHoldings, cell: SlotCell): HoldingView[] {
  return view.carried.filter((holding) => holding.slot === null && (holding.equipSlot ?? null) === cell.kind);
}

/**
 * [장착]이 입을 칸: 칸 종류가 같은 칸 가운데 빈 칸 먼저, 다 찼으면 첫 칸(서버가 그 칸의 것을 벗겨 든다). 맞는 칸이 없으면 null
 */
export function pickSlot(view: UnitHoldings, holding: HoldingView): SlotCell | null {
  const kind = holding.equipSlot ?? null;
  if (kind === null) return null;
  const fits = view.slots.filter((cell) => cell.kind === kind);
  return fits.find((cell) => cell.holding === null) ?? fits[0] ?? null;
}

/** 그 유닛의 그 쿨이 끝나는 시각(돌지 않으면 null) */
export function cooldownFor(view: UnitHoldings, holding: HoldingView): number | null {
  const kind = holding.useCooldown ?? null;
  if (kind === null) return null;
  return view.cooldowns.find((cooldown) => cooldown.kind === kind)?.until ?? null;
}

/** 값/최대 → 막대 몫(0~1)과 색 단계 */
export function ratioTone(value: number, max: number): { readonly ratio: number; readonly tone: Tone } {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return { ratio, tone: ratio > 0.6 ? "high" : ratio > 0.3 ? "mid" : "low" };
}

/** ‰ → 정수 % (내림, 늘려 말하지 않는다) */
export const percentOf = (pm: number): number => Math.floor(Math.max(0, pm) / 10);

/** 남은 ms → "m:ss" 또는 "h:mm:ss"(초는 올림: 0.2초 남으면 0:01). 지났으면 "0:00" */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${ss}`
    : `${String(minutes)}:${ss}`;
}

/** 시계가 돌아야 하는 가장 이른 끝 시각(효과·쿨·썩기 가운데 지금 뒤로 가장 이른 것). 없으면 null */
export function nextDeadline(data: HoldingsListResponse, now: number): number | null {
  let next: number | null = null;
  const consider = (at: number | null): void => {
    if (at !== null && at > now && (next === null || at < next)) next = at;
  };
  for (const effect of data.effects) consider(effect.until);
  for (const cooldown of data.cooldowns) consider(cooldown.until);
  return next;
}
