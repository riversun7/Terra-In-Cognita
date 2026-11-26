// 유닛 성장 저장소(휴먼·사이보그 유닛) — 사용자 결정 2026-11-26("휴먼·사이보그 유닛도 경험치를 받고 레벨이 스탯에 들게"),
// docs/adr/2026-11-26-unit-growth.md. 사이보그 본체는 cyborg/service.ts(addExp)가 따로 든다.
// - 거울: 저장된 스탯이 있는 휴먼(world_humans.stats — 구인 카드)과 사이보그 유닛(cyborg_units)의 레벨·환생·1차 스탯·성장 K·속성, 그리고 유닛
//   경험치(unit_exp)를 부팅 때 읽어 메모리에 든다. 그 뒤로는 월드 쓰기 대기열을 지켜보며(writer.observe) 따라간다 — 휴먼·사이보그 유닛 행을
//   쓰는 곳(구인·융합·환생·인큐베이터·NPC 저장)을 하나하나 잇지 않는다.
// - 몸 바탕(baseOf): 저장된 1차 스탯 + 레벨 성장(@terra/shared primaryAtLevel — 초기 × (1 + 성장률 × K × (Lv − 1)), 사이보그와 같은 식).
//   성장 K가 없는 유닛(구인 휴먼·사이보그 유닛)은 기준 K(DEFAULT_GROWTH_K_PM = 1000‰, 사이보그 K 범위의 가운데)로 자란다 [임시].
//   저장된 스탯이 없는 휴먼(처음부터 있던 NPC 휴먼)은 거울에 없다 → 기본 몸 그대로.
// - 경험치(gain): 구간을 넘으면 레벨이 오른다(경험치 표 = 팩 exp_table, 만렙 = 설정 칸 cyborg.maxLevel — 본체와 같다). 레벨은 그 유닛 표의
//   level 칸만 고치는 쓰기(humanLevel·cyborgUnitLevel)로, 경험치는 unit_exp로 남긴다.
import { DEFAULT_EXP_TABLE, type ExpTableEntryJson, applyExpGain, expSpanAt } from "@terra/shared/expTable";
import type { SocietyCoefficients } from "@terra/sim";
import type { BodyBase } from "../roster/unitBody.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 성장 K가 없는 유닛의 기준 K(‰, 1차 스탯마다) [임시 — 사이보그 K 범위 800~1200의 가운데] */
export const DEFAULT_GROWTH_K_PM = 1000;

/** 거울 한 줄(유닛 하나). 스탯 배열 차례 = STR·DEX·AGI·VIT·INT·WIS(world_humans.stats·cyborg_units.stats와 같다) */
export interface UnitGrowthEntry {
  kind: "human" | "cyborg";
  level: number;
  exp: number;
  rebirths: number;
  stats: readonly number[];
  kPm: readonly number[] | null;
  elements: readonly number[] | null;
}

/** 화면 값: 레벨, 그 구간 안 경험치, 구간 길이(만렙이면 0) */
export interface UnitGrowthView {
  readonly level: number;
  readonly exp: number;
  readonly span: number;
}

export interface UnitGrowthStore {
  /** 그 유닛의 몸 바탕(저장된 스탯 + 레벨 성장). 거울에 없으면 undefined(기본 몸) */
  baseOf(unitId: number): BodyBase | undefined;
  /** 레벨·경험치(화면). 거울에 없으면 undefined */
  viewOf(unitId: number): UnitGrowthView | undefined;
  /** 경험치를 더한다(구간을 넘으면 레벨이 오른다). 거울에 없으면 undefined */
  gain(
    unitId: number,
    amount: number,
  ): { readonly level: number; readonly exp: number; readonly gainedLevels: number } | undefined;
  /** 표를 다 읽었을 때 끝난다 */
  readonly loaded: Promise<void>;
  readonly size: number;
}

const stores = new WeakMap<object, UnitGrowthStore>();

/** 세계 저장 층에 붙은 저장소(없으면 undefined) */
export function unitGrowthOf(persistence: object | undefined): UnitGrowthStore | undefined {
  return persistence ? stores.get(persistence) : undefined;
}

const numbers = (value: unknown): number[] | null =>
  Array.isArray(value) && value.every((entry) => Number.isFinite(Number(entry))) ? value.map(Number) : null;

const sixOrNull = (value: unknown): number[] | null => {
  const list = numbers(value);
  return list && list.length === 6 ? list : null;
};

/** 저장소를 세계 저장 층에 붙인다(로스터·게이트웨이가 unitGrowthOf로 찾는다) */
export function registerUnitGrowth(persistence: object, store: UnitGrowthStore): void {
  stores.set(persistence, store);
}

/** 저장소를 만든다(쓰기 대기열이 생긴 뒤 — 몸을 읽는 곳들이 세계 저장 층보다 먼저 만들어진다). 붙이기는 registerUnitGrowth */
export function createUnitGrowth(input: {
  readonly pool: QueryPool;
  readonly writer: Pick<WorldWriter, "upsert" | "observe">;
  readonly now: () => number;
  readonly rules: () => Pick<SocietyCoefficients, "cyborg">;
  /** 경험치 표(실효 팩). 없으면 기본 표 */
  readonly expTable?: (() => readonly ExpTableEntryJson[] | undefined) | undefined;
  readonly log?: { error(obj: object, message: string): void } | undefined;
}): UnitGrowthStore {
  const table = new Map<number, UnitGrowthEntry>();
  /** 유닛 → 경험치(거울에 든 유닛만 쓴다. 읽는 동안 얻은 경험치는 읽은 값으로 덮지 않는다) */
  const touchedExp = new Set<number>();
  const expTable = (): readonly ExpTableEntryJson[] => input.expTable?.() ?? DEFAULT_EXP_TABLE;

  const setHuman = (row: Readonly<Record<string, unknown>>): void => {
    const unitId = Number(row["unit_id"]);
    const stats = sixOrNull(row["stats"]);
    if (!Number.isFinite(unitId)) return;
    if (!stats) {
      // 저장된 스탯이 없는 휴먼(처음부터 있던 NPC 휴먼): 거울에 두지 않는다
      table.delete(unitId);
      return;
    }
    const old = table.get(unitId);
    table.set(unitId, {
      kind: "human",
      level: Math.max(1, Math.trunc(Number(row["level"] ?? old?.level ?? 1))),
      // humans 행 쓰기는 성장 K·경험치를 모른다 → 든 값을 지킨다(레벨이 내려가는 쓰기 = 환생이면 경험치는 0부터)
      exp: old && Number(row["level"] ?? old.level) >= old.level ? old.exp : 0,
      rebirths: Math.max(0, Math.trunc(Number(row["rebirths"] ?? old?.rebirths ?? 0))),
      stats,
      kPm: "k_pm" in row ? sixOrNull(row["k_pm"]) : (old?.kPm ?? null),
      elements: numbers(row["elements"]),
    });
  };
  const setCyborgUnit = (row: Readonly<Record<string, unknown>>): void => {
    const unitId = Number(row["unit_id"]);
    const stats = sixOrNull(row["stats"]);
    if (!Number.isFinite(unitId) || !stats) return;
    const old = table.get(unitId);
    table.set(unitId, {
      kind: "cyborg",
      level: Math.max(1, Math.trunc(Number(row["level"] ?? 1))),
      // 융합으로 새로 생긴 사이보그 유닛(앞 줄이 휴먼)은 경험치 0부터
      exp: old?.kind === "cyborg" ? old.exp : 0,
      rebirths: 0,
      stats,
      kPm: null,
      elements: numbers(row["elements"]),
    });
  };

  const loaded = Promise.all([
    input.pool.query(
      "select unit_id, level, rebirths, stats, elements, k_pm from world_humans where stats is not null",
    ),
    input.pool.query("select unit_id, level, stats, elements from cyborg_units"),
    input.pool.query("select unit_id, exp from unit_exp"),
  ])
    .then(([humans, cyborgUnits, exps]) => {
      for (const row of humans.rows) if (!table.has(Number(row.unit_id))) setHuman(row);
      for (const row of cyborgUnits.rows) if (!table.has(Number(row.unit_id))) setCyborgUnit(row);
      for (const row of exps.rows) {
        const entry = table.get(Number(row.unit_id));
        if (entry && !touchedExp.has(Number(row.unit_id))) entry.exp = Math.max(0, Number(row.exp));
      }
    })
    .catch((error: unknown) => input.log?.error({ err: error }, "unit growth: load failed"));

  // 쓰기 대기열을 따라간다(구인·융합·환생·인큐베이터·죽음)
  input.writer.observe?.((name, row, removed) => {
    const unitId = Number(row["unit_id"] ?? row["id"]);
    if (name === "units") {
      if (removed) table.delete(unitId);
      return;
    }
    if (name === "humans") {
      if (removed) {
        // 융합은 휴먼 줄을 지우고 사이보그 유닛 줄을 쓴다(그 줄이 뒤에 온다) — 휴먼일 때만 지운다
        if (table.get(unitId)?.kind === "human") table.delete(unitId);
      } else setHuman(row);
      return;
    }
    if (name === "humanGrowth") {
      const entry = table.get(unitId);
      if (entry?.kind === "human") entry.kPm = sixOrNull(row["k_pm"]);
      return;
    }
    if (name === "cyborgUnits") {
      if (removed) {
        if (table.get(unitId)?.kind === "cyborg") table.delete(unitId);
      } else setCyborgUnit(row);
    }
  });

  const store: UnitGrowthStore = {
    baseOf(unitId) {
      const entry = table.get(unitId);
      if (!entry) return undefined;
      const at = (index: number): number => entry.stats[index] ?? 0;
      const k = (index: number): number => entry.kPm?.[index] ?? DEFAULT_GROWTH_K_PM;
      return {
        kind: "stats",
        unitKind: entry.kind,
        primaries: { str: at(0), dex: at(1), agi: at(2), vit: at(3), int: at(4), wis: at(5) },
        kPm: { str: k(0), dex: k(1), agi: k(2), vit: k(3), int: k(4), wis: k(5) },
        level: entry.level,
        rebirths: entry.rebirths,
        elements: entry.elements,
      };
    },
    viewOf(unitId) {
      const entry = table.get(unitId);
      if (!entry) return undefined;
      const maxLevel = input.rules().cyborg.maxLevel;
      return {
        level: entry.level,
        exp: entry.exp,
        span: entry.level >= maxLevel ? 0 : expSpanAt(expTable(), entry.level),
      };
    },
    gain(unitId, amount) {
      const entry = table.get(unitId);
      if (!entry) return undefined;
      const gain = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
      const next = applyExpGain(expTable(), entry.level, entry.exp, gain, input.rules().cyborg.maxLevel);
      const gainedLevels = next.level - entry.level;
      if (gainedLevels === 0 && next.expInto === entry.exp)
        return { level: entry.level, exp: entry.exp, gainedLevels: 0 };
      entry.exp = next.expInto;
      touchedExp.add(unitId);
      if (gainedLevels !== 0) {
        entry.level = next.level;
        input.writer.upsert(entry.kind === "human" ? "humanLevel" : "cyborgUnitLevel", {
          unit_id: unitId,
          level: entry.level,
        });
      }
      input.writer.upsert("unitExp", { unit_id: unitId, exp: entry.exp, updated_at_ms: input.now() });
      return { level: entry.level, exp: entry.exp, gainedLevels };
    },
    loaded: loaded.then(() => undefined),
    get size() {
      return table.size;
    },
  };
  return store;
}
