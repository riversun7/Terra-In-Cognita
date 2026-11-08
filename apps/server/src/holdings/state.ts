// 보유 물건 메모리 자료·DB 줄 모양·부팅 읽기 — docs/adr/2026-11-03-item-holdings.md 2절.
// 메모리 표가 원본의 캐시이고(쓰는 프로세스 하나, ADR 3) 쓰기는 월드 쓰기 대기열(holdings·unitEffects 표)이다.
import type { AgeState, RolledStat } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import type { Row } from "../world/persist/tables.ts";
import { type GenePayload, genePayloadOf } from "./genePayload.ts";

/** 보유 물건 한 칸 */
export interface HoldingRecord {
  readonly id: number;
  readonly ownerId: number;
  itemId: string;
  /** 원장 위치와 같은 뜻: 음수 = −유닛 ID(들고 있음), 양수 = 창고 위치 */
  location: number;
  /** 입은 칸 번호(그 유닛 칸 배치 차례). null = 듦 */
  slot: number | null;
  quantity: number;
  readonly stats: readonly RolledStat[];
  readonly scorePm: number | null;
  durability: number | null;
  maxDurability: number | null;
  /** 신선도 묶음의 숙성 상태(없으면 null) */
  age: AgeState | null;
  /**
   * 식품 포장 상태(D-524, 신선도 묶음만): true = 포장(겹쳐 쌓임, 숙성 멈춤), false·없음 = 풀린 낱개(숙성이 흐름). 부팅 때 읽은 D-524 전 줄은
   * 없음(undefined)이고 packLegacy가 포장 칸으로 바꾼다
   */
  packed?: boolean;
  readonly createdAtMs: number;
  source: string;
  /** 유전자 하나의 값(D-516, 유전자 아이템만 — 하나하나 값이 다른 인스턴스). 없으면 유전자가 아니다 */
  readonly gene?: GenePayload | null | undefined;
}

/** 유닛에 걸린 효과 하나(D-501) */
export interface UnitEffectRecord {
  readonly unitId: number;
  readonly effect: string;
  readonly value: number;
  readonly untilMs: number;
  readonly group: string | null;
  readonly item: string;
}

/** 유닛 쓰기 쿨 종류: 물약(D-509, 전투·비전투 같은 30초 쿨), 요리(D-510, 5분 쿨) */
export const COOLDOWN_KINDS = ["potion", "food"] as const;
export type CooldownKind = (typeof COOLDOWN_KINDS)[number];

/** 유닛 쓰기 쿨 하나 */
export interface UnitCooldownRecord {
  readonly unitId: number;
  readonly kind: CooldownKind;
  readonly untilMs: number;
}

export interface LoadedHoldings {
  readonly holdings: HoldingRecord[];
  readonly effects: UnitEffectRecord[];
  readonly cooldowns: UnitCooldownRecord[];
  /** 가장 큰 칸 ID(없으면 0) */
  readonly maxId: number;
  /** D-524 전에 저장된 신선도 묶음(packed 칸이 빈 줄) — 부팅 때 서비스 packLegacy가 포장 칸으로 바꾼다 */
  readonly legacyLots?: readonly number[];
}

/** 유닛이 든 물건의 위치 */
export const carriedBy = (unitId: number): number => -unitId;
/** 위치 → 들고 있는 유닛(창고면 null) */
export const carrierOf = (location: number): number | null => (location < 0 ? -location : null);

/** 쓰기 대기열 한 줄(item_holdings). stats는 JSON 글자(pg가 배열을 Postgres 배열로 바꾸지 않게) */
export function holdingRow(record: HoldingRecord): Row {
  return {
    id: record.id,
    owner_id: record.ownerId,
    item_id: record.itemId,
    location: record.location,
    slot: record.slot,
    quantity: record.quantity,
    stats: record.stats.length === 0 ? null : JSON.stringify(record.stats),
    score_pm: record.scorePm,
    durability: record.durability,
    max_durability: record.maxDurability,
    aged_ms: record.age?.agedMs ?? null,
    aged_at_ms: record.age?.atMs ?? null,
    created_at_ms: record.createdAtMs,
    source: record.source,
    gene: record.gene ? JSON.stringify(record.gene) : null,
    // 신선도 묶음만 포장 상태를 적는다(그 밖은 빈 칸). 빈 칸인 묶음 = D-524 전 줄(부팅 때 포장 칸으로 바뀐다)
    packed: record.age === null || record.packed === undefined ? null : record.packed,
  };
}

/** 쓰기 대기열 한 줄(unit_cooldowns) */
export function unitCooldownRow(record: UnitCooldownRecord): Row {
  return { unit_id: record.unitId, kind: record.kind, until_ms: record.untilMs };
}

const isCooldownKind = (value: unknown): value is CooldownKind =>
  typeof value === "string" && (COOLDOWN_KINDS as readonly string[]).includes(value);

/** 쓰기 대기열 한 줄(unit_effects) */
export function unitEffectRow(record: UnitEffectRecord): Row {
  return {
    unit_id: record.unitId,
    effect_id: record.effect,
    value: record.value,
    until_ms: record.untilMs,
    exclusive: record.group,
    item_id: record.item,
  };
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/** DB jsonb의 스탯 목록(모양이 틀린 줄은 빼고 읽는다) */
function statsOf(value: unknown): RolledStat[] {
  if (!Array.isArray(value)) return [];
  const out: RolledStat[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const stat: unknown = Reflect.get(entry, "stat");
    const statValue: unknown = Reflect.get(entry, "value");
    const pm: unknown = Reflect.get(entry, "pm");
    if (typeof stat === "string" && typeof statValue === "number" && typeof pm === "number")
      out.push({ stat, value: statValue, pm });
  }
  return out;
}

/** 부팅 때 한 번(쓰기 대기열이 돌기 전). int8은 pg가 문자열로 주므로 숫자로 바꾼다 */
export async function loadHoldings(pool: QueryPool): Promise<LoadedHoldings> {
  const [holdings, effects, cooldowns, max] = await Promise.all([
    pool.query(
      `select id, owner_id, item_id, location, slot, quantity, stats, score_pm, durability, max_durability,
              aged_ms, aged_at_ms, created_at_ms, source, gene, packed from item_holdings order by id`,
    ),
    pool.query(
      `select unit_id, effect_id, value, until_ms, exclusive, item_id from unit_effects order by unit_id, effect_id`,
    ),
    pool.query(`select unit_id, kind, until_ms from unit_cooldowns order by unit_id, kind`),
    pool.query(`select max(id) as id from item_holdings`),
  ]);
  const legacyLots: number[] = [];
  return {
    holdings: holdings.rows.map((row): HoldingRecord => {
      const agedMs = numOrNull(row.aged_ms);
      const agedAtMs = numOrNull(row.aged_at_ms);
      const age = agedMs === null || agedAtMs === null ? null : { agedMs, atMs: agedAtMs };
      const packed = typeof row.packed === "boolean" ? row.packed : undefined;
      if (age !== null && packed === undefined) legacyLots.push(num(row.id));
      return {
        id: num(row.id),
        ownerId: num(row.owner_id),
        itemId: String(row.item_id),
        location: num(row.location),
        slot: numOrNull(row.slot),
        quantity: num(row.quantity),
        stats: statsOf(row.stats),
        scorePm: numOrNull(row.score_pm),
        durability: numOrNull(row.durability),
        maxDurability: numOrNull(row.max_durability),
        age,
        ...(packed === undefined ? {} : { packed }),
        createdAtMs: num(row.created_at_ms),
        source: String(row.source),
        gene: genePayloadOf(row.gene),
      };
    }),
    effects: effects.rows.map(
      (row): UnitEffectRecord => ({
        unitId: num(row.unit_id),
        effect: String(row.effect_id),
        value: num(row.value),
        untilMs: num(row.until_ms),
        group: typeof row.exclusive === "string" ? row.exclusive : null,
        item: String(row.item_id),
      }),
    ),
    cooldowns: cooldowns.rows.flatMap((row): UnitCooldownRecord[] =>
      isCooldownKind(row.kind)
        ? [{ unitId: num(row.unit_id), kind: row.kind, untilMs: num(row.until_ms) }]
        : [],
    ),
    maxId: num(max.rows[0]?.id ?? 0),
    legacyLots,
  };
}
