// 보유 물건 서비스(서버 권위) — docs/adr/2026-11-03-item-holdings.md 3·4절, 기획 D-496(285~289)·D-497·D-501·D-5006·D-5031·N49.
// 판정은 @terra/sim items/holding.ts 한 벌(굴림·닳기·수리·썩기·효과 교체)이고, 여기는 메모리 표·쓰기 대기열·소유 검사만 한다.
// - 모든 명령은 동기다: 한 번의 동기 처리에서 넣은 바뀜은 한 커밋에 들어간다(S3 U2). 물건·소유를 바꾼 응답은 부르는 쪽(gateway)이
//   writer.durable()을 기다린 뒤 보낸다. 전투 닳기는 전투 결과 적용과 같은 동기 처리에서 부른다(결과 기록과 한 커밋, 두 번 닳지 않는다).
// - 얻기(acquire): 실효 팩의 켜진 아이템만(끈 항목은 새로 나오지 않는다 D-398). 장비는 칸마다 굴림(N49 285: 굴린 값은 만들 때 정해짐),
//   내구도 = 지금 정의의 최대 내구도. 신선도 묶음은 같은 숙성 상태끼리, 쌓이는 소모품은 같은 것끼리 stackMax까지 쌓는다.
// - 입기(equip): 내구도 0이면 못 입는다(N49 286). 그 칸에 있던 것은 벗는다. 칸 종류·입을 수 있는 유닛 종류는 지금 정의를 읽는다.
// - 쓰기(use): 효과량 = @terra/sim useAmountRange·rollUseAmount(D-501), 교체는 planEffects(같은 효과는 높은 것만, 다른 효과는 확인),
//   수량 −1(0이면 칸을 지운다). 전투 밖에서는 시간 버프와 한 번에 채우는 HP 회복(D-512, 저장한 HP — src/vitals/)만 건다.
//   주기 회복·상태·도트와 전투 중 사용(287)·자동 사용 판단식은 전투 사용 줄기다.
// - 썩기(spoilDue): 신선도 0이 된 묶음을 고른 아이템으로 바꾼다(사슬, 꺼진 대상이면 버림). 목록을 읽기 전과 타이머가 부른다.
// - 탄약(spendAmmo)·수리(repair)는 고리다: 전투 판정이 원거리 타격 수를 알려 주면(다음 줄기) spendAmmo를 부른다. 탄약 보충(291·294)과
//   수리 시설·장인·재료(D-5031)는 기획·시설 줄기에서 정해지면 부른다.
import type {
  EffectEntry,
  ItemEntry,
  ItemSubcategoryEntry,
  UnitKindEntry,
  WeaponTypeEntry,
} from "@terra/content";
import { createRng } from "@terra/shared";
import {
  type ItemBuff,
  type IncomingEffect,
  type Primaries,
  type SpoilDef,
  type StatRange,
  type HoldableDef,
  battleWearAmount,
  belowPotionThreshold,
  holdingKindOf,
  pickPotion,
  planEffects,
  refillAmmo,
  repairDurable,
  repairMaterialQty,
  rollHoldingStats,
  rollUseAmount,
  settleAge,
  agedAt,
  freshnessPm,
  settleSpoilage,
  spoilAtMs,
  stackMaxOf,
  useAmountRange,
  wearDurable,
  wearable,
} from "@terra/sim";
import type { WorldWriter } from "../world/persist/writer.ts";
import { type HoldingRules, wearRulesOf } from "./rules.ts";
import {
  type CooldownKind,
  type HoldingRecord,
  type LoadedHoldings,
  type UnitCooldownRecord,
  type UnitEffectRecord,
  carriedBy,
  carrierOf,
  holdingRow,
  unitCooldownRow,
  unitEffectRow,
} from "./state.ts";

/** 서비스가 읽는 실효 콘텐츠(팩 + 그 세계의 덮어쓰기). 부를 때마다 읽는다 */
export interface HoldingContent {
  readonly items: readonly ItemEntry[];
  /** 중분류(식품 중분류 = 요리 쿨 종류, 그 밖 소모품 = 물약 쿨, D-509) */
  readonly itemSubcategories: readonly ItemSubcategoryEntry[];
  readonly effects: readonly EffectEntry[];
  readonly unitKinds: readonly UnitKindEntry[];
  readonly weaponTypes: readonly WeaponTypeEntry[];
}

/** 세계에서 읽는 것 */
export interface HoldingWorld {
  /** 유닛 주인(소유 주체 ID). 없는 유닛이면 undefined */
  unitOwner(unitId: number): number | undefined;
  /** 유닛의 팩 unit_kinds ID(칸 배치). 없으면 undefined */
  unitKind(unitId: number): string | undefined;
  /** 쓰는 유닛의 1차 스탯(소모품 효과량 D-501) */
  unitPrimaries(unitId: number): Primaries;
  /**
   * 전투 밖 HP(D-512: HP는 전투 뒤에도 남고 회복 물약은 전투 밖에서도 채운다, 생명 수치 서비스 src/vitals/). 없으면 회복은 전투 중에만
   * (battle_only, 시험 세계)
   */
  readonly vitals?: HoldingVitals | undefined;
}

/** 보유 물건이 쓰는 생명 수치 고리(src/vitals/service.ts) */
export interface HoldingVitals {
  /** 지금 HP와 최대(분 단위 회복을 셈한 값). 몸 자료를 모르면 undefined */
  hp(unitId: number, nowMs: number): { readonly current: number; readonly max: number } | undefined;
  /** HP를 채운다(flat = 값, permille = 최대 HP의 ‰). 실제로 찬 양 */
  heal(
    unitId: number,
    amount: { readonly mode: "flat" | "permille"; readonly value: number },
    nowMs: number,
  ): number;
}

/** 명령 실패 코드(@terra/protocol ITEM_RESULT_CODES 가운데 서비스가 내는 것) */
export type HoldingFailure =
  | "unknown_holding"
  | "unknown_unit"
  | "unknown_item"
  | "not_holdable"
  | "not_carried"
  | "wrong_slot"
  | "broken"
  | "not_usable"
  | "battle_only"
  | "not_better"
  | "confirm_replace"
  | "cooldown";

export type HoldingResult<T = object> =
  | ({ readonly ok: true } & T)
  | {
      readonly ok: false;
      readonly code: HoldingFailure;
      readonly effects?: readonly string[];
      /** cooldown이면 다시 쓸 수 있는 시각 */
      readonly readyAt?: number;
    };

export interface AcquireInput {
  readonly ownerId: number;
  readonly item: string;
  readonly quantity: number;
  readonly location: number;
  /** 얻은 길(dev_grant·craft·drop·gather 등) */
  readonly source: string;
  readonly atMs: number;
  /** 굴림 시드(운영: crypto, 시험: 고정) */
  readonly seed: number;
}

/** 전투 하나에서 유닛 하나(이긴 쪽인가) */
export interface BattleUnitWear {
  readonly unit: number;
  readonly won: boolean;
}

export interface BattleWearSummary {
  /** 닳은 물건 수 */
  readonly worn: number;
  /** 0이 돼 벗은 물건 수 */
  readonly broken: number;
}

export interface RepairOutcome {
  readonly destroyed: boolean;
  readonly maxLoss: number;
  readonly restored: number;
}

export interface HoldingService {
  /** 소유 주체의 물건·그 주체 유닛에 걸린 효과(썩기를 먼저 셈한다) */
  list(
    ownerId: number,
    nowMs: number,
  ): {
    readonly holdings: readonly HoldingRecord[];
    readonly effects: readonly UnitEffectRecord[];
    readonly cooldowns: readonly UnitCooldownRecord[];
  };
  acquire(input: AcquireInput): HoldingResult<{ readonly holdings: readonly number[] }>;
  equip(ownerId: number, holdingId: number, slot: number): HoldingResult;
  unequip(ownerId: number, holdingId: number): HoldingResult;
  use(
    ownerId: number,
    holdingId: number,
    options: { readonly confirm: boolean; readonly nowMs: number; readonly seed: number },
  ): HoldingResult<{ readonly effects: readonly { readonly effect: string; readonly amount: number }[] }>;
  /** 전투가 끝날 때(결과 적용과 같은 동기 처리): 참전 유닛이 입은 장비를 닳게 한다(탄약 종류는 빼고 — 탄 수는 spendAmmo) */
  applyBattle(battleSeed: number, units: readonly BattleUnitWear[]): BattleWearSummary;
  /**
   * 원거리 타격 shots번(전투 판정이 알려 줄 고리): 입은 탄약(보조 칸, 무기 종류 ammo)의 내구도 = 남은 탄 수를 줄인다(D-497). 0이면 벗고
   * 같은 유닛이 든 같은 탄약 종류(같은 아이템 먼저, 그다음 많이 남은 것)를 입는다(옛 BattleResult 자동 교체, D-501 294). 보충은 하지 않는다
   */
  spendAmmo(unitId: number, shots: number): { readonly spent: number; readonly replacedBy: number | null };
  /** 수리 고리(D-5031·F11·F12): 시설 Lv·장인 실력‰. 파괴되면 내구도 0·벗김(분해만 가능) */
  repair(holdingId: number, facilityLevel: number, skillPm: number): HoldingResult<RepairOutcome>;
  /** 신선도 0이 된 묶음을 바꾼다. 바꾼(버린) 칸 수 */
  spoilDue(nowMs: number): number;
  /** 끝난 효과·쿨을 지운다. 지운 수 */
  sweepEffects(nowMs: number): number;
  /**
   * 탄약 보충 고리(D-509 "재료로 내구도 회복. 최대내구도 점차 감소"): 탄약 종류 장비만. 재료 양 = repairMaterialQty(기본 양, 티어, 쓴 탄, 최대)
   * (보충 전에 셈, 재료 차감은 부르는 쪽), 최대 감소 = 설정 칸 d509_ammo_refill_loss, 파괴 문턱 F12. 재료 기본 양·어디서 보충하는지는 시설 줄기
   */
  refillAmmo(
    holdingId: number,
    materialBase: number,
  ): HoldingResult<RepairOutcome & { readonly materials: number }>;
  /**
   * 자동 사용 후보: 그 유닛이 든, 지금 쿨이 끝나 쓸 수 있는 소모품(칸 ID 차례). 물약은 pickAutoPotion(D-510)이 고르고, 고른 뒤에는 use와 같은 규칙
   * (planEffects auto)으로 쓴다
   */
  usableNow(unitId: number, nowMs: number): readonly HoldingRecord[];
  /** 유닛의 그 종류 쿨이 끝나는 시각(없으면 0, 전투 판정이 물약을 쓸 때 같은 쿨을 본다 D-509) */
  cooldownUntil(unitId: number, kind: CooldownKind): number;
  /**
   * 자동 물약(D-510 "HP 문턱 + 알맞은 물약"): HP가 문턱(‰, 없으면 설정 칸 d510_potion_hp_threshold — 유닛 AI 전술 설정 D-5039가 생기면 그 값)
   * 아래면, 쿨이 끝난 든 물약 가운데 모자란 HP를 가장 덜 넘치게 채우는 것(채우는 양 = 회복 줄 효과량 가운데 값, ‰ 회복은 최대 HP 기준).
   * 고른 것은 전투 판정이 같은 쿨·교체 규칙(planEffects auto)으로 쓴다(전투 사용은 다음 줄기). 없으면 null
   */
  pickAutoPotion(
    unitId: number,
    hp: { readonly current: number; readonly max: number },
    nowMs: number,
    thresholdPm?: number,
  ): { readonly holding: number; readonly heal: number } | null;
  /** 유닛이 입은 물건(칸 차례) */
  equippedOn(unitId: number): readonly HoldingRecord[];
  /** 유닛의 칸 배치(팩 unit_kinds ID와 칸 차례 — 화면이 칸 번호를 칸 종류로 읽는다). 없는 유닛·종류면 undefined */
  unitLayout(unitId: number): { readonly kind: string; readonly slots: readonly string[] } | undefined;
  /** 쓸 수 있는 물건의 쓰기 쿨 종류(D-509·D-510). 쓸 수 없거나 팩에서 사라졌으면 null */
  useCooldownOf(itemId: string): CooldownKind | null;
  /** 지금 실효 정의(보유 판정 칸, 팩에서 사라졌으면 undefined) */
  defOf(itemId: string): HeldDef | undefined;
  /** 신선도 묶음의 지금 신선도(‰)와 그 자리에 두면 다 썩는 시각(신선도가 없으면 null) */
  freshnessOf(
    record: HoldingRecord,
    nowMs: number,
  ): { readonly freshnessPm: number; readonly spoilsAt: number | null } | null;
  readonly size: number;
}

export interface HoldingServiceOptions {
  readonly loaded: LoadedHoldings;
  readonly writer: WorldWriter;
  readonly world: HoldingWorld;
  readonly content: () => HoldingContent;
  readonly rules: () => HoldingRules;
  /** 보존 배율 ‰(위치마다, 1000 = 그대로, 0 = 멈춤). 없으면 모두 1000(창고 종류·냉장 시설이 서버에 아직 없다) */
  readonly preservePm?: ((location: number) => number) | undefined;
}

/** 팩 아이템 항목에서 보유 판정이 읽는 칸(참조 ContentRef → ID 글자) */
export interface HeldDef extends HoldableDef {
  readonly id: string;
  readonly name: ItemEntry["name"];
  readonly enabled: boolean;
  readonly subcategory?: string | undefined;
  readonly tier: number;
  readonly stackMax?: number | undefined;
  readonly perish?: { readonly shelfLifeMs: number; readonly spoilsTo: string } | undefined;
  readonly use?:
    | {
        readonly effects: readonly {
          readonly effect: string;
          readonly value: number;
          readonly chancePm: number;
          readonly durationMs?: number | undefined;
          readonly scale?: { readonly stat: keyof Primaries; readonly appropriate: number } | undefined;
          readonly variancePm?: number | undefined;
        }[];
      }
    | undefined;
  readonly equip?:
    | {
        readonly slot: string;
        readonly stats: readonly StatRange[];
        readonly maxDurability?: number | undefined;
        readonly weaponType?: string | undefined;
        readonly kinds?: readonly string[] | undefined;
      }
    | undefined;
}

/** 팩 항목 → 보유 판정 칸 */
export function heldDefOf(item: ItemEntry): HeldDef {
  const { equip, perish, use } = item;
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    enabled: item.enabled,
    tier: item.tier,
    ...(item.subcategory ? { subcategory: item.subcategory.id } : {}),
    ...(item.stackMax === undefined ? {} : { stackMax: item.stackMax }),
    ...(perish ? { perish: { shelfLifeMs: perish.shelfLifeMs, spoilsTo: perish.spoilsTo.id } } : {}),
    ...(use
      ? {
          use: {
            effects: use.effects.map((line) => ({
              effect: line.effect.id,
              value: line.value,
              chancePm: line.chancePm,
              ...(line.durationMs === undefined ? {} : { durationMs: line.durationMs }),
              ...(line.scale
                ? { scale: { stat: line.scale.stat, appropriate: line.scale.appropriate } }
                : {}),
              ...(line.variancePm === undefined ? {} : { variancePm: line.variancePm }),
            })),
          },
        }
      : {}),
    ...(equip
      ? {
          equip: {
            slot: equip.slot,
            stats: equip.stats.map((range) => ({
              stat: typeof range.stat === "string" ? range.stat : range.stat.id,
              min: range.min,
              max: range.max,
            })),
            ...(equip.maxDurability === undefined ? {} : { maxDurability: equip.maxDurability }),
            ...(equip.weaponType ? { weaponType: equip.weaponType.id } : {}),
            ...(equip.kinds ? { kinds: equip.kinds.map((kind) => kind.id) } : {}),
          },
        }
      : {}),
  };
}

/** 콘텐츠 스냅숏마다 한 번 만드는 찾기 표 */
interface Lookup {
  readonly items: ReadonlyMap<string, HeldDef>;
  readonly effects: ReadonlyMap<string, EffectEntry>;
  readonly unitSlots: ReadonlyMap<string, readonly string[]>;
  readonly ammoTypes: ReadonlySet<string>;
  readonly foodSubcategories: ReadonlySet<string>;
}

function lookupOf(content: HoldingContent): Lookup {
  return {
    items: new Map(content.items.map((item) => [item.id, heldDefOf(item)])),
    effects: new Map(content.effects.map((effect) => [effect.id, effect])),
    unitSlots: new Map(content.unitKinds.map((kind) => [kind.id, kind.slots])),
    ammoTypes: new Set(content.weaponTypes.filter((type) => type.ammo === true).map((type) => type.id)),
    foodSubcategories: new Set(
      content.itemSubcategories.filter((entry) => entry.food === true).map((entry) => entry.id),
    ),
  };
}

/**
 * 소모품의 쿨 종류(D-509·D-510): 식품 중분류(요리·음료) = food(5분), 그 밖(약·버프·중분류 없음) = potion(30초)
 * (질문 331: 버프 아이템도 물약 쿨인가)
 */
function cooldownKindOf(def: HeldDef, map: Lookup): CooldownKind {
  return def.subcategory !== undefined && map.foodSubcategories.has(def.subcategory) ? "food" : "potion";
}

/** 전투 시드 + 칸 ID → 닳기 시드(같은 전투·같은 칸 = 같은 굴림) */
const wearSeed = (battleSeed: number, holdingId: number): number =>
  (Math.imul(battleSeed >>> 0, 0x01000193) ^ Math.imul(holdingId, 0x9e3779b1)) >>> 0;

/** 효과가 전투 밖에서 시간 버프로 걸리는가(전투 중 회복·상태·도트는 287 전투 사용 줄기) */
const timedOutside = (kind: string, durationMs: number): boolean =>
  (kind === "buff" || kind === "debuff") && durationMs > 0;

/** 전투 밖에서 HP를 한 번에 채우는 회복인가(D-512, 주기 회복·쉴드 회복은 전투 중에만). 세계에 생명 수치가 있을 때만 */
const healsOutside = (effect: EffectEntry, vitals: HoldingVitals | undefined): boolean =>
  vitals !== undefined && effect.kind === "heal" && effect.tickMs <= 0;

const byId = (a: { readonly id: number }, b: { readonly id: number }): number => a.id - b.id;

/** 썩는 사슬이 읽는 정의(실효 아이템) */
const spoilDef =
  (map: Lookup) =>
  (id: string): SpoilDef | undefined =>
    map.items.get(id);

export function createHoldingService(options: HoldingServiceOptions): HoldingService {
  const { writer, world } = options;
  const holdings = new Map<number, HoldingRecord>(
    options.loaded.holdings.map((record) => [record.id, record]),
  );
  const effects = new Map<number, UnitEffectRecord[]>();
  /** 유닛·종류 → 끝나는 시각 */
  const cooldowns = new Map<string, UnitCooldownRecord>(
    options.loaded.cooldowns.map((entry) => [`${entry.unitId}:${entry.kind}`, entry]),
  );
  const cooldownUntil = (unitId: number, kind: CooldownKind): number =>
    cooldowns.get(`${unitId}:${kind}`)?.untilMs ?? 0;
  /** 쿨 길이(ms): 물약 30초(D-509)·요리 5분(D-510), 설정 칸 */
  const cooldownMs = (kind: CooldownKind): number => {
    const { consumables } = options.rules();
    return Math.max(0, kind === "potion" ? consumables.potionCooldownMs : consumables.foodCooldownMs);
  };
  for (const effect of options.loaded.effects)
    effects.set(effect.unitId, [...(effects.get(effect.unitId) ?? []), effect]);
  // 큰 표에서도 인자 수 상한에 걸리지 않게 하나씩 본다
  let lastId = Math.max(0, options.loaded.maxId);
  for (const id of holdings.keys()) lastId = Math.max(lastId, id);
  const nextId = (): number => (lastId += 1);
  const preserve = options.preservePm ?? (() => 1000);
  let cached: { source: HoldingContent; lookup: Lookup } | undefined;
  const lookup = (): Lookup => {
    const content = options.content();
    if (cached?.source !== content) cached = { source: content, lookup: lookupOf(content) };
    return cached.lookup;
  };
  const save = (record: HoldingRecord): void => writer.upsert("holdings", holdingRow(record));
  const drop = (record: HoldingRecord): void => {
    holdings.delete(record.id);
    writer.remove("holdings", { id: record.id });
  };
  const owned = (ownerId: number, holdingId: number): HoldingRecord | undefined => {
    const record = holdings.get(holdingId);
    return record?.ownerId === ownerId ? record : undefined;
  };
  /** 묶음 하나를 nowMs까지 썩힌다(바뀌면 저장). 버렸으면 false */
  const settleLot = (record: HoldingRecord, nowMs: number, map: Lookup): boolean => {
    if (record.age === null) return true;
    const pm = preserve(record.location);
    const outcome = settleSpoilage({ item: record.itemId, age: record.age }, nowMs, pm, spoilDef(map));
    if (outcome.kind === "disposed") {
      drop(record);
      return false;
    }
    if (outcome.kind === "changed") {
      record.itemId = outcome.item;
      record.age = map.items.get(outcome.item)?.perish ? outcome.age : null;
      record.source = "spoil";
      save(record);
    }
    return true;
  };

  /** 지금 정의로 그 물건이 다 썩을 시각(신선도가 없거나 멈춤이면 null) */
  const spoilTime = (record: HoldingRecord, map: Lookup): number | null => {
    const perish = map.items.get(record.itemId)?.perish;
    if (!perish || record.age === null) return null;
    return spoilAtMs(record.age, perish.shelfLifeMs, preserve(record.location));
  };

  const unitEffects = (unitId: number, nowMs: number): UnitEffectRecord[] =>
    (effects.get(unitId) ?? []).filter((entry) => entry.untilMs > nowMs);

  /** 유닛 효과를 바꾼다(지운 것은 지우고, 새로 걸리거나 바뀐 것은 쓴다) */
  const replaceEffects = (unitId: number, next: readonly ItemBuff[]): void => {
    const before = effects.get(unitId) ?? [];
    const after = next.map(
      (entry): UnitEffectRecord => ({
        unitId,
        effect: entry.effect,
        value: entry.value,
        untilMs: entry.untilMs,
        group: entry.group,
        item: entry.item,
      }),
    );
    for (const old of before)
      if (!after.some((entry) => entry.effect === old.effect))
        writer.remove("unitEffects", { unit_id: unitId, effect_id: old.effect });
    for (const entry of after) {
      const old = before.find((candidate) => candidate.effect === entry.effect);
      if (!old || old.value !== entry.value || old.untilMs !== entry.untilMs || old.item !== entry.item)
        writer.upsert("unitEffects", unitEffectRow(entry));
    }
    if (after.length === 0) effects.delete(unitId);
    else effects.set(unitId, after);
  };

  /** 같은 주인·아이템·자리에서 같이 쌓을 수 있는 칸(듦·창고, 입지 않음, 같은 숙성 상태) */
  const stackable = (input: AcquireInput, age: HoldingRecord["age"]): HoldingRecord[] =>
    [...holdings.values()]
      .filter(
        (record) =>
          record.ownerId === input.ownerId &&
          record.itemId === input.item &&
          record.location === input.location &&
          record.slot === null &&
          record.durability === null &&
          record.stats.length === 0 &&
          (age === null
            ? record.age === null
            : record.age !== null &&
              settleAge(record.age, input.atMs, preserve(record.location)).agedMs === age.agedMs),
      )
      .toSorted(byId);

  const equippedOn = (unitId: number): HoldingRecord[] =>
    [...holdings.values()]
      .filter((record) => record.location === carriedBy(unitId) && record.slot !== null)
      .toSorted((a, b) => (a.slot ?? 0) - (b.slot ?? 0) || a.id - b.id);

  return {
    list(ownerId, nowMs) {
      const map = lookup();
      const mine = [...holdings.values()].filter((record) => record.ownerId === ownerId).toSorted(byId);
      const kept = mine.filter((record) => settleLot(record, nowMs, map));
      const units = new Set<number>();
      for (const [unitId] of effects) if (world.unitOwner(unitId) === ownerId) units.add(unitId);
      // 효과 없이 쿨만 남은 유닛(확률에 빠진 쓰기 등)도 쿨을 보인다
      for (const entry of cooldowns.values())
        if (world.unitOwner(entry.unitId) === ownerId) units.add(entry.unitId);
      const live = [...units].toSorted((a, b) => a - b).flatMap((unitId) => unitEffects(unitId, nowMs));
      const waits = [...cooldowns.values()]
        .filter((entry) => entry.untilMs > nowMs && units.has(entry.unitId))
        .toSorted((a, b) => a.unitId - b.unitId || (a.kind < b.kind ? -1 : 1));
      return { holdings: kept, effects: live, cooldowns: waits };
    },

    acquire(input) {
      if (!Number.isInteger(input.quantity) || input.quantity < 1)
        throw new RangeError("quantity must be >= 1");
      const map = lookup();
      const def = map.items.get(input.item);
      if (!def?.enabled) return { ok: false, code: "unknown_item" };
      const kind = holdingKindOf(def);
      if (kind === null) return { ok: false, code: "not_holdable" };
      const created: number[] = [];
      const base = {
        ownerId: input.ownerId,
        itemId: input.item,
        location: input.location,
        slot: null,
        createdAtMs: input.atMs,
        source: input.source,
      };
      if (kind === "instance") {
        const rng = createRng(input.seed);
        const max = def.equip?.maxDurability ?? null;
        for (let i = 0; i < input.quantity; i++) {
          const rolled = rollHoldingStats(def.equip?.stats ?? [], rng);
          const record: HoldingRecord = {
            ...base,
            id: nextId(),
            quantity: 1,
            stats: rolled.stats,
            scorePm: rolled.scorePm,
            durability: max,
            maxDurability: max,
            age: null,
          };
          holdings.set(record.id, record);
          save(record);
          created.push(record.id);
        }
        return { ok: true, holdings: created };
      }
      const age = kind === "lot" ? { agedMs: 0, atMs: input.atMs } : null;
      const cap = stackMaxOf(def);
      let left = input.quantity;
      for (const record of stackable(input, age)) {
        if (left <= 0) break;
        const room = cap - record.quantity;
        if (room <= 0) continue;
        const add = Math.min(room, left);
        record.quantity += add;
        if (age !== null) record.age = age;
        left -= add;
        save(record);
        created.push(record.id);
      }
      while (left > 0) {
        const add = Math.min(cap, left);
        const record: HoldingRecord = {
          ...base,
          id: nextId(),
          quantity: add,
          stats: [],
          scorePm: null,
          durability: null,
          maxDurability: null,
          age,
        };
        holdings.set(record.id, record);
        save(record);
        created.push(record.id);
        left -= add;
      }
      return { ok: true, holdings: created };
    },

    equip(ownerId, holdingId, slot) {
      const record = owned(ownerId, holdingId);
      if (!record) return { ok: false, code: "unknown_holding" };
      const unitId = carrierOf(record.location);
      if (unitId === null) return { ok: false, code: "not_carried" };
      const kind = world.unitKind(unitId);
      if (world.unitOwner(unitId) !== ownerId || kind === undefined)
        return { ok: false, code: "unknown_unit" };
      const map = lookup();
      const equip = map.items.get(record.itemId)?.equip;
      const slots = map.unitSlots.get(kind) ?? [];
      if (!equip || slots[slot] !== equip.slot || (equip.kinds !== undefined && !equip.kinds.includes(kind)))
        return { ok: false, code: "wrong_slot" };
      if (!wearable(record)) return { ok: false, code: "broken" };
      if (record.slot === slot) return { ok: true };
      for (const other of equippedOn(unitId))
        if (other.slot === slot && other.id !== record.id) {
          other.slot = null;
          save(other);
        }
      record.slot = slot;
      save(record);
      return { ok: true };
    },

    unequip(ownerId, holdingId) {
      const record = owned(ownerId, holdingId);
      if (!record) return { ok: false, code: "unknown_holding" };
      if (record.slot !== null) {
        record.slot = null;
        save(record);
      }
      return { ok: true };
    },

    use(ownerId, holdingId, use) {
      const map = lookup();
      const record = owned(ownerId, holdingId);
      if (!record || !settleLot(record, use.nowMs, map)) return { ok: false, code: "unknown_holding" };
      const unitId = carrierOf(record.location);
      if (unitId === null) return { ok: false, code: "not_carried" };
      if (world.unitOwner(unitId) !== ownerId) return { ok: false, code: "unknown_unit" };
      const def = map.items.get(record.itemId);
      const lines = def?.use?.effects;
      if (!def || !lines) return { ok: false, code: "not_usable" };
      const rules = options.rules();
      const kind = cooldownKindOf(def, map);
      const primaries = world.unitPrimaries(unitId);
      const rng = createRng(use.seed);
      const rolled: { line: IncomingEffect; hit: boolean }[] = [];
      /** 전투 밖 회복 줄(D-512, 확률에 든 것만): 시간 효과가 아니라 저장한 HP를 채운다 */
      const heals: { effect: string; mode: "flat" | "permille"; value: number }[] = [];
      let healLines = 0;
      for (const line of lines) {
        const effect = map.effects.get(line.effect);
        const durationMs = line.durationMs ?? effect?.durationMs ?? 0;
        const heal = effect !== undefined && healsOutside(effect, world.vitals);
        if (!effect || (!timedOutside(effect.kind, durationMs) && !heal))
          return { ok: false, code: "battle_only" };
        const scale = line.scale
          ? { statValue: primaries[line.scale.stat], appropriate: line.scale.appropriate }
          : null;
        const range = useAmountRange(
          line.value,
          scale,
          rules.appropriateCapPm,
          line.variancePm ?? rules.useVariancePm,
        );
        const amount = rollUseAmount(range, rng);
        const hit = rng.nextInt(1000) < line.chancePm;
        if (heal) {
          healLines += 1;
          if (hit) heals.push({ effect: line.effect, mode: effect.valueMode, value: amount });
          continue;
        }
        rolled.push({
          line: {
            effect: line.effect,
            value: amount,
            untilMs: use.nowMs + durationMs,
            group: effect.exclusive ?? null,
          },
          hit,
        });
      }
      // 쿨(D-509: 물약은 전투·비전투 같은 30초). 효과가 맞는지 본 뒤에 본다(전투 중에만 쓰는 물건은 battle_only가 먼저)
      const readyAt = cooldownUntil(unitId, kind);
      if (readyAt > use.nowMs) return { ok: false, code: "cooldown", readyAt };
      // 낭비 막기(D-501 "같거나 낮으면 쓰지 않음"을 회복에도, 해석): HP가 가득이면 회복 줄은 쓸모가 없다. 회복 줄만 있는 물건은 쓰지 않고,
      // 시간 효과도 있는 물건은 시간 효과가 나을 때만 쓴다. HP가 모자라면 시간 효과가 낫지 않아도(not_better) 회복으로 쓴다
      const hp = healLines > 0 ? world.vitals?.hp(unitId, use.nowMs) : undefined;
      const healUseful = hp !== undefined && hp.current < hp.max;
      if (rolled.length === 0 && !healUseful) return { ok: false, code: "not_better" };
      // 거절(낭비 막기·확인)은 굴린 값 전체로 본다. 확률에 빠진 줄은 걸리지 않지만 물건은 쓴다(그 아이템의 설계)
      const active = unitEffects(unitId, use.nowMs);
      if (rolled.length > 0) {
        const check = planEffects(
          active,
          rolled.map((entry) => entry.line),
          record.itemId,
          use.nowMs,
          { confirm: use.confirm, auto: false },
        );
        if (!check.ok && !(check.code === "not_better" && healUseful))
          return { ok: false, code: check.code, effects: check.effects };
      }
      const hits = rolled.filter((entry) => entry.hit).map((entry) => entry.line);
      const applied = planEffects(active, hits, record.itemId, use.nowMs, { confirm: true, auto: false });
      if (applied.ok) replaceEffects(unitId, applied.next);
      record.quantity -= 1;
      if (record.quantity <= 0) drop(record);
      else save(record);
      const wait = cooldownMs(kind);
      if (wait > 0) {
        const entry: UnitCooldownRecord = { unitId, kind, untilMs: use.nowMs + wait };
        cooldowns.set(`${unitId}:${kind}`, entry);
        writer.upsert("unitCooldowns", unitCooldownRow(entry));
      }
      // 전투 밖 회복(D-512): 같은 동기 처리 → 물건 −1·쿨과 한 커밋
      for (const heal of heals) world.vitals?.heal(unitId, heal, use.nowMs);
      return {
        ok: true,
        effects: [
          ...hits.map((line) => ({ effect: line.effect, amount: line.value })),
          ...heals.map((heal) => ({ effect: heal.effect, amount: heal.value })),
        ],
      };
    },

    applyBattle(battleSeed, units) {
      const map = lookup();
      const rules = wearRulesOf(options.rules().durability);
      let worn = 0;
      let broken = 0;
      for (const unit of [...units].toSorted((a, b) => a.unit - b.unit)) {
        for (const record of equippedOn(unit.unit)) {
          if (record.durability === null || record.maxDurability === null || record.durability <= 0) continue;
          const type = map.items.get(record.itemId)?.equip?.weaponType;
          if (type !== undefined && map.ammoTypes.has(type)) continue;
          const amount = battleWearAmount(unit.won, rules, createRng(wearSeed(battleSeed, record.id)));
          const next = wearDurable(
            { durability: record.durability, maxDurability: record.maxDurability },
            amount,
          );
          if (next.durability === record.durability) continue;
          record.durability = next.durability;
          worn += 1;
          // 옛 BattleResult: 내구도 0이면 강제로 벗긴다(N49 286: 0이면 입지 못한다)
          if (record.durability === 0) {
            record.slot = null;
            broken += 1;
          }
          save(record);
        }
      }
      return { worn, broken };
    },

    spendAmmo(unitId, shots) {
      if (shots <= 0) return { spent: 0, replacedBy: null };
      const map = lookup();
      const ammoOf = (record: HoldingRecord): string | undefined => {
        const type = map.items.get(record.itemId)?.equip?.weaponType;
        return type !== undefined && map.ammoTypes.has(type) ? type : undefined;
      };
      const worn = equippedOn(unitId).find(
        (record) => ammoOf(record) !== undefined && record.durability !== null,
      );
      if (!worn || worn.durability === null) return { spent: 0, replacedBy: null };
      const spent = Math.min(worn.durability, shots);
      worn.durability -= spent;
      let replacedBy: number | null = null;
      if (worn.durability === 0) {
        const slot = worn.slot;
        const type = ammoOf(worn);
        worn.slot = null;
        const spare = [...holdings.values()]
          .filter(
            (record) =>
              record.location === worn.location &&
              record.slot === null &&
              record.id !== worn.id &&
              ammoOf(record) === type &&
              (record.durability ?? 0) > 0,
          )
          .toSorted(
            (a, b) =>
              Number(b.itemId === worn.itemId) - Number(a.itemId === worn.itemId) ||
              (b.durability ?? 0) - (a.durability ?? 0) ||
              a.id - b.id,
          )[0];
        if (spare && slot !== null) {
          spare.slot = slot;
          save(spare);
          replacedBy = spare.id;
        }
      }
      save(worn);
      return { spent, replacedBy };
    },

    repair(holdingId, facilityLevel, skillPm) {
      const record = holdings.get(holdingId);
      if (!record) return { ok: false, code: "unknown_holding" };
      if (record.durability === null || record.maxDurability === null)
        return { ok: false, code: "not_usable" };
      if (record.maxDurability <= options.rules().durability.destroyAtMax)
        return { ok: false, code: "broken" };
      const done = repairDurable(
        { durability: record.durability, maxDurability: record.maxDurability },
        facilityLevel,
        skillPm,
        options.rules(),
      );
      record.durability = done.item.durability;
      record.maxDurability = done.item.maxDurability;
      if (done.destroyed) record.slot = null;
      save(record);
      return { ok: true, destroyed: done.destroyed, maxLoss: done.maxLoss, restored: done.restored };
    },

    spoilDue(nowMs) {
      const map = lookup();
      let changed = 0;
      for (const record of [...holdings.values()].toSorted(byId)) {
        const at = spoilTime(record, map);
        if (at === null || at > nowMs) continue;
        settleLot(record, nowMs, map);
        changed += 1;
      }
      return changed;
    },

    sweepEffects(nowMs) {
      let removed = 0;
      for (const [key, entry] of cooldowns)
        if (entry.untilMs <= nowMs) {
          cooldowns.delete(key);
          writer.remove("unitCooldowns", { unit_id: entry.unitId, kind: entry.kind });
          removed += 1;
        }
      for (const [unitId, list] of effects) {
        const live = list.filter((entry) => entry.untilMs > nowMs);
        if (live.length === list.length) continue;
        removed += list.length - live.length;
        replaceEffects(unitId, live);
      }
      return removed;
    },

    refillAmmo(holdingId, materialBase) {
      const map = lookup();
      const record = holdings.get(holdingId);
      if (!record) return { ok: false, code: "unknown_holding" };
      const def = map.items.get(record.itemId);
      const type = def?.equip?.weaponType;
      if (
        !def ||
        type === undefined ||
        !map.ammoTypes.has(type) ||
        record.durability === null ||
        record.maxDurability === null
      )
        return { ok: false, code: "not_usable" };
      const durability = options.rules().durability;
      if (record.maxDurability <= durability.destroyAtMax) return { ok: false, code: "broken" };
      const materials = repairMaterialQty(
        materialBase,
        def.tier,
        record.maxDurability - record.durability,
        record.maxDurability,
      );
      const done = refillAmmo(
        { durability: record.durability, maxDurability: record.maxDurability },
        durability.ammoRefillLossPm,
        durability.destroyAtMax,
      );
      record.durability = done.item.durability;
      record.maxDurability = done.item.maxDurability;
      if (done.destroyed) record.slot = null;
      save(record);
      return {
        ok: true,
        destroyed: done.destroyed,
        maxLoss: done.maxLoss,
        restored: done.restored,
        materials,
      };
    },

    usableNow(unitId, nowMs) {
      const map = lookup();
      return [...holdings.values()]
        .filter((record) => {
          const def = map.items.get(record.itemId);
          return (
            record.location === carriedBy(unitId) &&
            def?.use !== undefined &&
            cooldownUntil(unitId, cooldownKindOf(def, map)) <= nowMs
          );
        })
        .toSorted(byId);
    },

    cooldownUntil,

    pickAutoPotion(unitId, hp, nowMs, thresholdPm) {
      const map = lookup();
      const rules = options.rules();
      if (!belowPotionThreshold(hp.current, hp.max, thresholdPm ?? rules.consumables.potionHpThresholdPm))
        return null;
      if (cooldownUntil(unitId, "potion") > nowMs) return null;
      const primaries = world.unitPrimaries(unitId);
      const candidates = [...holdings.values()]
        .filter((record) => record.location === carriedBy(unitId))
        .toSorted(byId)
        .flatMap((record) => {
          const def = map.items.get(record.itemId);
          if (!def?.use || cooldownKindOf(def, map) !== "potion") return [];
          let heal = 0;
          for (const line of def.use.effects) {
            const effect = map.effects.get(line.effect);
            if (effect?.kind !== "heal") continue;
            const scale = line.scale
              ? { statValue: primaries[line.scale.stat], appropriate: line.scale.appropriate }
              : null;
            const { scaled } = useAmountRange(
              line.value,
              scale,
              rules.appropriateCapPm,
              line.variancePm ?? rules.useVariancePm,
            );
            heal += effect.valueMode === "permille" ? Math.floor((hp.max * scaled) / 1000) : scaled;
          }
          return heal > 0 ? [{ holding: record.id, heal }] : [];
        });
      return pickPotion(Math.max(0, hp.max - hp.current), candidates);
    },
    equippedOn,
    unitLayout(unitId) {
      const kind = world.unitKind(unitId);
      const slots = kind === undefined ? undefined : lookup().unitSlots.get(kind);
      return kind === undefined || slots === undefined ? undefined : { kind, slots };
    },
    useCooldownOf(itemId) {
      const map = lookup();
      const def = map.items.get(itemId);
      return def?.use ? cooldownKindOf(def, map) : null;
    },
    defOf: (itemId) => lookup().items.get(itemId),
    freshnessOf(record, nowMs) {
      const perish = lookup().items.get(record.itemId)?.perish;
      if (!perish || record.age === null) return null;
      const pm = preserve(record.location);
      return {
        freshnessPm: freshnessPm(agedAt(record.age, nowMs, pm), perish.shelfLifeMs),
        spoilsAt: spoilAtMs(record.age, perish.shelfLifeMs, pm),
      };
    },
    get size() {
      return holdings.size;
    },
  };
}
