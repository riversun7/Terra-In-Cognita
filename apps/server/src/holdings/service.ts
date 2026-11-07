// 보유 물건 서비스(서버 권위) — docs/adr/2026-11-03-item-holdings.md 3·4절, 기획 D-496(285~289)·D-497·D-501·D-5006·D-5031·N49.
// 판정은 @terra/sim items/holding.ts 한 벌(굴림·닳기·수리·썩기·효과 교체)이고, 여기는 메모리 표·쓰기 대기열·소유 검사만 한다.
// - 모든 명령은 동기다: 한 번의 동기 처리에서 넣은 바뀜은 한 커밋에 들어간다(S3 U2). 물건·소유를 바꾼 응답은 부르는 쪽(gateway)이
//   writer.durable()을 기다린 뒤 보낸다. 전투 닳기는 전투 결과 적용과 같은 동기 처리에서 부른다(결과 기록과 한 커밋, 두 번 닳지 않는다).
// - 얻기(acquire): 실효 팩의 켜진 아이템만(끈 항목은 새로 나오지 않는다 D-398). 장비는 칸마다 굴림(N49 285: 굴린 값은 만들 때 정해짐),
//   내구도 = 지금 정의의 최대 내구도. 신선도 묶음은 같은 숙성 상태끼리, 쌓이는 소모품은 같은 것끼리 stackMax까지 쌓는다.
// - 입기(equip): 내구도 0이면 못 입는다(N49 286). 그 칸에 있던 것은 벗는다. 칸 종류·입을 수 있는 유닛 종류는 지금 정의를 읽는다.
// - 쓰기(use): 효과량 = @terra/sim useAmountRange·rollUseAmount(D-501) × 신선도(D-512 320, 신선도 묶음만), 교체는 planEffects(같은 효과는
//   높은 것만, 다른 효과는 확인), 수량 −1(0이면 칸을 지운다). 전투 밖에서는 시간 버프와 한 번에 채우는 HP 회복(D-512 327, 저장한 HP —
//   src/vitals/)만 건다. 주기 회복·상태·도트와 전투 중 사용(287)·자동 사용 판단식은 전투 사용 줄기다. 버프 지속은 아이템 효과 줄의
//   편집기 값(1시간 상한 없음, D-512 328)이고 실제 시간으로 끝난다.
// - 썩기(spoilDue): 신선도 0이 된 묶음을 고른 아이템으로 바꾼다(사슬, 꺼진 대상이면 버림). 목록을 읽기 전과 타이머가 부른다. 보존 배율은
//   보관 곳마다 설정 칸(D-512 322: 유닛이 듦 ×1, 창고·냉장·절임·통조림·냉동·거래소 — 지금 서버의 보관 곳은 유닛·창고 둘뿐)이고 셀 때마다 읽는다.
// - 전투 닳기(applyBattle): 퇴각한 유닛은 닳지 않는다(D-514 352, D-190 — 전투마다 닳음도 없음).
// - 탄약(spendAmmo)·수리(repair)는 고리다: 전투 판정이 원거리 타격 수를 알려 주면(다음 줄기) spendAmmo를 부른다. 수리(D-512 323)는
//   시설 수리 줄·장인 1차 스탯을 받아 끝까지 고치고 재료를 돌려준다(차감·장인 직무 시간은 시설 줄기).
import type { EffectEntry, ItemEntry } from "@terra/content";
import { createRng } from "@terra/shared";
import {
  type ItemBuff,
  type IncomingEffect,
  type PreserveTable,
  type SpoilDef,
  TEST_STAT_TABLE,
  battleWearAmount,
  craftScore,
  craftSkillPm,
  planEquipmentRepair,
  preservePmOf,
  repairRuleFor,
  storagePlaceOfLocation,
  belowPotionThreshold,
  holdingKindOf,
  pickPotion,
  planEffects,
  refillAmmo,
  repairMaterialQty,
  rollHoldingStats,
  rollUseAmount,
  settleAge,
  agedAt,
  freshnessPm,
  settleSpoilage,
  spoilAtMs,
  stackMaxOf,
  potionHeal,
  useAmountRange,
  wearDurable,
  wearable,
} from "@terra/sim";
import { wearRulesOf } from "./rules.ts";
import { hotPerMinute, potionOf } from "./battleKit.ts";
import {
  type CooldownKind,
  type HoldingRecord,
  type UnitCooldownRecord,
  type UnitEffectRecord,
  carriedBy,
  carrierOf,
  holdingRow,
  unitCooldownRow,
  unitEffectRow,
} from "./state.ts";

import type {
  AcquireInput,
  HeldDef,
  HoldingContent,
  HoldingService,
  HoldingServiceOptions,
  HoldingVitals,
} from "./serviceTypes.ts";

export type {
  AcquireInput,
  BattleKit,
  BattleUse,
  BattleUnitWear,
  BattleWearSummary,
  GeneInput,
  HeldDef,
  HoldingContent,
  HoldingFailure,
  HoldingResult,
  HoldingService,
  HoldingServiceOptions,
  HoldingVitals,
  HoldingWorld,
  RepairInput,
  RepairOutcome,
} from "./serviceTypes.ts";

/** 팩 항목 → 보유 판정 칸 */
export function heldDefOf(item: ItemEntry): HeldDef {
  const { equip, perish, use, gene } = item;
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    enabled: item.enabled,
    tier: item.tier,
    ...(item.subcategory ? { subcategory: item.subcategory.id } : {}),
    ...(item.stackMax === undefined ? {} : { stackMax: item.stackMax }),
    ...(gene ? { gene: { kind: gene.kind, species: gene.species.id } } : {}),
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
            ...(equip.weapon?.ammo ? { ammo: equip.weapon.ammo.id } : {}),
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

/** 전투 밖에서 HP를 한 번에 채우는 회복인가(D-512). 세계에 생명 수치가 있을 때만 */
const healsOutside = (effect: EffectEntry, vitals: HoldingVitals | undefined): boolean =>
  vitals !== undefined && effect.kind === "heal" && effect.tickMs <= 0;

/** 전투 밖 주기 회복인가(D-514 346: 분 단위 틱 — 걸린 효과로 두고 생명 수치가 분당 양을 더한다). 생명 수치가 있을 때만 */
const hotOutside = (effect: EffectEntry, vitals: HoldingVitals | undefined): boolean =>
  vitals?.touch !== undefined && effect.kind === "heal" && effect.tickMs > 0;

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
  const placeOf = options.storagePlaceOf ?? storagePlaceOfLocation;
  /** 지금 보존 배율 표(설정 칸 실효 값). 한 번의 명령·조회에서 한 번 읽어 넘긴다 */
  const preserveTable = (): PreserveTable => options.rules().consumables.preservePm;
  const preserve = (location: number, table: PreserveTable): number => preservePmOf(placeOf(location), table);
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
  const settleLot = (record: HoldingRecord, nowMs: number, map: Lookup, table: PreserveTable): boolean => {
    if (record.age === null) return true;
    const pm = preserve(record.location, table);
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
  const spoilTime = (record: HoldingRecord, map: Lookup, table: PreserveTable): number | null => {
    const perish = map.items.get(record.itemId)?.perish;
    if (!perish || record.age === null) return null;
    return spoilAtMs(record.age, perish.shelfLifeMs, preserve(record.location, table));
  };

  /** 지금 신선도(‰, D-512 320 효과량에 곱한다). 신선도가 없는 물건은 1000 */
  const freshNow = (record: HoldingRecord, nowMs: number, map: Lookup, table: PreserveTable): number => {
    const perish = map.items.get(record.itemId)?.perish;
    if (!perish || record.age === null) return 1000;
    return freshnessPm(agedAt(record.age, nowMs, preserve(record.location, table)), perish.shelfLifeMs);
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
  const stackable = (input: AcquireInput, age: HoldingRecord["age"], table: PreserveTable): HoldingRecord[] =>
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
              settleAge(record.age, input.atMs, preserve(record.location, table)).agedMs === age.agedMs),
      )
      .toSorted(byId);

  /** 유닛이 든 물약(물약 쿨 종류, 회복 줄이 있는 것, 칸 ID 차례) → 판정 사양(287·D-510, battleKit.ts potionOf) */
  const carriedPotions = (
    unitId: number,
    maxHp: number,
    nowMs: number,
    map: Lookup,
    rules: ReturnType<typeof options.rules>,
  ) => {
    const primaries = world.unitPrimaries(unitId);
    const table = preserveTable();
    return [...holdings.values()]
      .filter((record) => record.location === carriedBy(unitId))
      .toSorted(byId)
      .flatMap((record) => {
        const def = map.items.get(record.itemId);
        if (!def?.use || cooldownKindOf(def, map) !== "potion") return [];
        const potion = potionOf(record, def, (id) => map.effects.get(id), {
          primaries,
          rules,
          freshPm: freshNow(record, nowMs, map, table),
          maxHp,
        });
        return potion ? [potion] : [];
      });
  };

  const equippedOn = (unitId: number): HoldingRecord[] =>
    [...holdings.values()]
      .filter((record) => record.location === carriedBy(unitId) && record.slot !== null)
      .toSorted((a, b) => (a.slot ?? 0) - (b.slot ?? 0) || a.id - b.id);

  /** 원거리 타격 shots번: 입은 탄약 내구도를 줄이고 0이면 같은 종류 예비를 입힌다(D-497·D-501 294) */
  const spendAmmo = (unitId: number, shots: number): { spent: number; replacedBy: number | null } => {
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
  };

  return {
    list(ownerId, nowMs) {
      const map = lookup();
      const table = preserveTable();
      const mine = [...holdings.values()].filter((record) => record.ownerId === ownerId).toSorted(byId);
      const kept = mine.filter((record) => settleLot(record, nowMs, map, table));
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
      // 유전자는 값(총합·분포·속성·스킬)이 있어야 하므로 addGene으로만 생긴다(D-516)
      if (kind === null || def.gene !== undefined) return { ok: false, code: "not_holdable" };
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
      for (const record of stackable(input, age, preserveTable())) {
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

    addGene(input) {
      const def = lookup().items.get(input.item);
      if (!def?.enabled || def.gene?.kind !== input.gene.kind) return undefined;
      const record: HoldingRecord = {
        id: nextId(),
        ownerId: input.ownerId,
        itemId: input.item,
        location: input.location,
        slot: null,
        quantity: 1,
        stats: [],
        scorePm: null,
        durability: null,
        maxDurability: null,
        age: null,
        createdAtMs: input.atMs,
        source: input.source,
        gene: input.gene,
      };
      holdings.set(record.id, record);
      save(record);
      return record.id;
    },

    geneOf(ownerId, holdingId) {
      const record = owned(ownerId, holdingId);
      return record?.gene ? record : undefined;
    },

    remove(holdingId) {
      const record = holdings.get(holdingId);
      if (!record) return false;
      drop(record);
      return true;
    },

    moveCarried(unitId, location) {
      let moved = 0;
      for (const record of [...holdings.values()].toSorted(byId)) {
        if (record.location !== carriedBy(unitId)) continue;
        record.location = location;
        record.slot = null;
        save(record);
        moved += 1;
      }
      return moved;
    },

    equip(ownerId, holdingId, slot) {
      const record = owned(ownerId, holdingId);
      if (!record) return { ok: false, code: "unknown_holding" };
      if (options.locked?.(holdingId)) return { ok: false, code: "busy" };
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
      if (options.locked?.(holdingId)) return { ok: false, code: "busy" };
      if (record.slot !== null) {
        record.slot = null;
        save(record);
      }
      return { ok: true };
    },

    use(ownerId, holdingId, use) {
      const map = lookup();
      const table = preserveTable();
      const record = owned(ownerId, holdingId);
      if (!record || !settleLot(record, use.nowMs, map, table)) return { ok: false, code: "unknown_holding" };
      const unitId = carrierOf(record.location);
      if (unitId === null) return { ok: false, code: "not_carried" };
      if (world.unitOwner(unitId) !== ownerId) return { ok: false, code: "unknown_unit" };
      const def = map.items.get(record.itemId);
      const lines = def?.use?.effects;
      if (!def || !lines) return { ok: false, code: "not_usable" };
      const rules = options.rules();
      const kind = cooldownKindOf(def, map);
      const primaries = world.unitPrimaries(unitId);
      // 신선도(D-512 320): 효과량 = 기준 × 신선도. 거래소 안 식품은 최대 신선도(D-289)라 거래소 물건은 모두 같다
      const fresh = freshNow(record, use.nowMs, map, table);
      const rng = createRng(use.seed);
      const rolled: { line: IncomingEffect; hit: boolean }[] = [];
      /** 전투 밖 회복 줄(D-512, 확률에 든 것만): 시간 효과가 아니라 저장한 HP를 채운다 */
      const heals: { effect: string; mode: "flat" | "permille"; value: number }[] = [];
      let healLines = 0;
      let hotLines = 0;
      for (const line of lines) {
        const effect = map.effects.get(line.effect);
        const durationMs = line.durationMs ?? effect?.durationMs ?? 0;
        const heal = effect !== undefined && healsOutside(effect, world.vitals);
        const hot = effect !== undefined && durationMs > 0 && hotOutside(effect, world.vitals);
        if (!effect || (!timedOutside(effect.kind, durationMs) && !heal && !hot))
          return { ok: false, code: "battle_only" };
        const scale = line.scale
          ? { statValue: primaries[line.scale.stat], appropriate: line.scale.appropriate }
          : null;
        const range = useAmountRange(
          line.value,
          scale,
          rules.appropriateCapPm,
          line.variancePm ?? rules.useVariancePm,
          fresh,
        );
        const amount = rollUseAmount(range, rng);
        const hit = rng.nextInt(1000) < line.chancePm;
        if (heal) {
          healLines += 1;
          if (hit) heals.push({ effect: line.effect, mode: effect.valueMode, value: amount });
          continue;
        }
        if (hot) {
          // 분당 양으로 바꿔 걸린 효과로 둔다(끝 = 생명 수치의 마지막 분 경계 + 분 수 — 그 분 경계부터 분마다 더한다, D-514 346)
          healLines += 1;
          hotLines += 1;
          const perTick =
            effect.valueMode === "permille"
              ? Math.floor(((world.vitals?.hp(unitId, use.nowMs)?.max ?? 0) * amount) / 1000)
              : amount;
          const { perMinute, minutes } = hotPerMinute(perTick, effect.tickMs, durationMs);
          const from = world.vitals?.touch?.(unitId, use.nowMs) ?? use.nowMs;
          rolled.push({
            line: {
              effect: line.effect,
              value: perMinute,
              untilMs: from + minutes * 60_000,
              group: effect.exclusive ?? null,
            },
            hit,
          });
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
      if ((rolled.length === 0 || rolled.length === hotLines) && !healUseful)
        return { ok: false, code: "not_better" };
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
          const amount = battleWearAmount(unit.outcome, rules, createRng(wearSeed(battleSeed, record.id)));
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

    spendAmmo,

    repair(holdingId, input) {
      const map = lookup();
      const record = holdings.get(holdingId);
      if (!record) return { ok: false, code: "unknown_holding" };
      const def = map.items.get(record.itemId);
      if (record.durability === null || record.maxDurability === null || !def?.equip)
        return { ok: false, code: "not_usable" };
      const rules = options.rules();
      if (record.maxDurability <= rules.durability.destroyAtMax) return { ok: false, code: "broken" };
      // 그 시설의 수리 줄(옛 REPAIR_MAP): 무기 종류나 칸이 맞는 첫 줄
      const rule = repairRuleFor(input.rules, { slot: def.equip.slot, weaponType: def.equip.weaponType });
      if (!rule) return { ok: false, code: "wrong_slot" };
      const table = options.statTable?.() ?? TEST_STAT_TABLE;
      const skillPm = craftSkillPm(craftScore(input.craftsman, table), rules.durability.craftAppropriate);
      const done = planEquipmentRepair(
        { durability: record.durability, maxDurability: record.maxDurability },
        { rule, tier: def.tier, facilityLevel: input.facilityLevel, skillPm },
        rules,
      );
      if (done.item.durability !== record.durability || done.item.maxDurability !== record.maxDurability) {
        record.durability = done.item.durability;
        record.maxDurability = done.item.maxDurability;
        if (done.destroyed) record.slot = null;
        save(record);
      }
      return {
        ok: true,
        destroyed: done.destroyed,
        maxLoss: done.maxLoss,
        restored: done.restored,
        materials: done.materials,
        skillPm,
      };
    },

    spoilDue(nowMs) {
      const map = lookup();
      const table = preserveTable();
      let changed = 0;
      for (const record of [...holdings.values()].toSorted(byId)) {
        const at = spoilTime(record, map, table);
        if (at === null || at > nowMs) continue;
        settleLot(record, nowMs, map, table);
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
      const candidates = carriedPotions(unitId, hp.max, nowMs, map, rules).map((potion) => ({
        holding: potion.id,
        heal: potionHeal(potion),
      }));
      return pickPotion(Math.max(0, hp.max - hp.current), candidates);
    },

    battleKit(unitId, maxHp, nowMs, thresholdPm) {
      const map = lookup();
      const rules = options.rules();
      const items = carriedPotions(unitId, maxHp, nowMs, map, rules);
      // 든 무기(무기 칸, 내구도 > 0)가 탄약 종류를 쓰면 입은 그 종류 탄약의 내구도 = 남은 탄(D-497, 없으면 0)
      const ammoType = equippedOn(unitId)
        .filter((record) => wearable(record))
        .map((record) => map.items.get(record.itemId)?.equip)
        .find((equip) => equip?.slot === "weapon" && equip.ammo !== undefined)?.ammo;
      const ammoWorn =
        ammoType === undefined
          ? undefined
          : equippedOn(unitId).find((record) => map.items.get(record.itemId)?.equip?.weaponType === ammoType);
      return {
        ...(items.length > 0
          ? {
              potions: {
                items,
                thresholdPm: thresholdPm ?? rules.consumables.potionHpThresholdPm,
                cooldownMs: cooldownMs("potion"),
                readyMs: Math.max(0, cooldownUntil(unitId, "potion") - nowMs),
              },
            }
          : {}),
        ...(ammoType === undefined ? {} : { ammo: ammoWorn?.durability ?? 0 }),
      };
    },

    applyBattleUse(unitId, used) {
      let drunk = 0;
      for (const entry of used.potions ?? []) {
        const record = holdings.get(entry.id);
        if (!record || record.location !== carriedBy(unitId) || entry.used <= 0) continue;
        const take = Math.min(record.quantity, entry.used);
        drunk += take;
        record.quantity -= take;
        if (record.quantity <= 0) drop(record);
        else save(record);
      }
      const until = used.potionReadyAtMs ?? 0;
      if (drunk > 0 && until > cooldownUntil(unitId, "potion")) {
        const entry: UnitCooldownRecord = { unitId, kind: "potion", untilMs: until };
        cooldowns.set(`${unitId}:potion`, entry);
        writer.upsert("unitCooldowns", unitCooldownRow(entry));
      }
      if ((used.shots ?? 0) > 0) spendAmmo(unitId, used.shots ?? 0);
      return drunk;
    },
    equippedOn,
    effectsOn: unitEffects,
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
      const pm = preserve(record.location, preserveTable());
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
