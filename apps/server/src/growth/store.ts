// 유닛 성장 저장소(휴먼·사이보그 유닛) — 사용자 결정 2026-11-26("휴먼·사이보그 유닛도 경험치를 받고 레벨이 스탯에 들게"),
// docs/adr/2026-11-26-unit-growth.md. 사이보그 본체는 cyborg/service.ts(addExp)가 따로 든다.
// - 거울: 저장된 스탯이 있는 휴먼(world_humans.stats — 구인 카드)과 사이보그 유닛(cyborg_units)의 레벨·환생·1차 스탯·성장 K·속성, 그리고 유닛
//   경험치(unit_exp)를 부팅 때 읽어 메모리에 든다. 그 뒤로는 월드 쓰기 대기열을 지켜보며(writer.observe) 따라간다 — 휴먼·사이보그 유닛 행을
//   쓰는 곳(구인·융합·환생·인큐베이터·NPC 저장)을 하나하나 잇지 않는다.
// - 몸 바탕(baseOf): 저장된 1차 스탯 + 레벨 성장(@terra/shared primaryAtLevel — 초기 × (1 + 성장률 × K × (Lv − 1)), 사이보그와 같은 식).
//   성장 K가 없는 유닛(구인 휴먼·사이보그 유닛)은 기준 K(DEFAULT_GROWTH_K_PM = 1000‰, 사이보그 K 범위의 가운데)로 자란다 [임시].
//   저장된 스탯이 없는 휴먼(처음부터 있던 NPC 휴먼)은 거울에 없다 → 기본 몸 그대로.
// - 그 밖 유닛(docs/adr/2026-11-27-all-units-have-stats.md — 사용자 결정 2026-11-27 "모든 것은 유닛이고 레벨 스탯이 있어야한다"): 휴먼·사이보그
//   유닛·본체가 아닌 사람 유닛(NPC 지도자·봇, world/unitKinds.ts rollsUnitStats)은 처음 읽힐 때 구인 카드 규칙(@terra/sim foundingProfileOf —
//   처음부터 있던 휴먼과 같은 굴림, 행정 레벨 1)으로 스탯·속성을 굴려 unit_stats에 저장한다(kind "unit"). 그 뒤로는 휴먼과 똑같이 자란다. 뒤에 그
//   유닛의 휴먼·사이보그 유닛 줄이 생기면 그 줄이 이긴다(unit_stats 줄은 지운다).
// - 경험치(gain): 구간을 넘으면 레벨이 오른다(경험치 표 = 팩 exp_table, 만렙 = 설정 칸 cyborg.maxLevel — 본체와 같다). 레벨은 그 유닛 표의
//   level 칸만 고치는 쓰기(humanLevel·cyborgUnitLevel)로, 경험치는 unit_exp로 남긴다.
import { DEFAULT_EXP_TABLE, type ExpTableEntryJson, applyExpGain, expSpanAt } from "@terra/shared/expTable";
import { primaryAtLevel } from "@terra/shared/statGrowth";
import { type SocietyCoefficients, foundingProfileOf, recruitElementSlots } from "@terra/sim";
import type { BodyBase } from "../roster/unitBody.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 성장 K가 없는 유닛의 기준 K(‰, 1차 스탯마다) [임시 — 사이보그 K 범위 800~1200의 가운데] */
export const DEFAULT_GROWTH_K_PM = 1000;

/** 그 밖 유닛의 스탯 굴림 시드(유닛 ID마다 한 번 굴려 저장한다 — 세계 시드와 따로, 값은 정해진 상수) */
const UNIT_STAT_SEED = 0x756e_6974;
/** 그 밖 유닛의 스탯 굴림에 쓰는 행정 레벨(구인 카드 규칙의 가장 낮은 단계) */
const UNIT_STAT_ADMIN_LEVEL = 1;

/**
 * 거울 한 줄(유닛 하나). 스탯 배열 차례 = STR·DEX·AGI·VIT·INT·WIS(world_humans.stats·cyborg_units.stats·unit_stats.stats와 같다).
 * kind: human = 휴먼, cyborg = 사이보그 유닛, unit = 그 밖 유닛(unit_stats)
 */
export interface UnitGrowthEntry {
  kind: "human" | "cyborg" | "unit";
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

/** 운영 조회용 한 줄: 처음 스탯·성장 K(없으면 null = 기준 K)·지금 스탯(레벨 성장) — 배열 차례 STR·DEX·AGI·VIT·INT·WIS */
export interface UnitGrowthSheet extends UnitGrowthView {
  readonly kind: "human" | "cyborg" | "unit";
  readonly rebirths: number;
  readonly initial: readonly number[];
  readonly kPm: readonly number[] | null;
  readonly stats: readonly number[];
}

export interface UnitGrowthStore {
  /** 운영 조회(레벨·경험치·처음 스탯·K·지금 스탯). 거울에 없으면 undefined */
  sheetOf(unitId: number): UnitGrowthSheet | undefined;
  /** 그 레벨의 구간 경험치(만렙이면 0) — 사이보그 본체 조회도 쓴다 */
  spanAt(level: number): number;
  /** 레벨 성장을 센 스탯(처음 스탯 × (1 + 성장률 × K × (레벨 − 1)), K가 없으면 기준 K) */
  grownOf(initial: readonly number[], kPm: readonly number[] | null, level: number): number[];
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
  readonly writer: Pick<WorldWriter, "upsert" | "observe" | "remove">;
  readonly now: () => number;
  readonly rules: () => Pick<SocietyCoefficients, "cyborg" | "recruit">;
  /**
   * 저장된 스탯이 없을 때 굴려 줄 유닛인가(세계가 답한다 — world/unitKinds.ts rollsUnitStats): true = 굴려 저장한다(봇·NPC 지도자), false =
   * 굴리지 않는다(기본 몸 — 탈것·배·줄 없이 세운 시험 유닛), undefined = 지금 세계에 없는 유닛(다음에 다시 묻는다). 없으면 굴리지 않는다
   */
  readonly rollable?: ((unitId: number) => boolean | undefined) | undefined;
  /** 경험치 표(실효 팩). 없으면 기본 표 */
  readonly expTable?: (() => readonly ExpTableEntryJson[] | undefined) | undefined;
  readonly log?: { error(obj: object, message: string): void } | undefined;
}): UnitGrowthStore {
  const table = new Map<number, UnitGrowthEntry>();
  /** 유닛 → 경험치(거울에 든 유닛만 쓴다. 읽는 동안 얻은 경험치는 읽은 값으로 덮지 않는다) */
  const touchedExp = new Set<number>();
  const expTable = (): readonly ExpTableEntryJson[] => input.expTable?.() ?? DEFAULT_EXP_TABLE;

  /** 굴리지 않는 유닛(다시 묻지 않는다) */
  const plain = new Set<number>();
  /** 표를 다 읽었나(읽기 전에는 굴리지 않는다 — 읽을 줄을 굴린 값으로 덮지 않게) */
  let ready = false;
  const saveUnit = (unitId: number, entry: UnitGrowthEntry): void => {
    input.writer.upsert("unitStats", {
      unit_id: unitId,
      level: entry.level,
      stats: [...entry.stats],
      elements: entry.elements ? [...entry.elements] : null,
      updated_at_ms: input.now(),
    });
  };
  /** 그 유닛의 휴먼·사이보그 유닛 줄이 생겼다: 굴려 둔 그 밖 유닛 줄은 지운다(그 줄이 이긴다) */
  const dropUnitRow = (unitId: number): void => {
    if (table.get(unitId)?.kind === "unit") input.writer.remove("unitStats", { unit_id: unitId });
  };
  /** 거울의 한 줄. 없고 굴려 줄 유닛이면 구인 카드 규칙으로 굴려 저장한다 */
  const ensure = (unitId: number): UnitGrowthEntry | undefined => {
    const entry = table.get(unitId);
    if (entry || !ready || !input.rollable || plain.has(unitId)) return entry;
    const can = input.rollable(unitId);
    if (can !== true) {
      if (can === false) plain.add(unitId);
      return undefined;
    }
    const profile = foundingProfileOf(UNIT_STAT_SEED, unitId, UNIT_STAT_ADMIN_LEVEL, input.rules().recruit);
    const stats = sixOrNull([...profile.stats]);
    if (!stats) return undefined;
    const made: UnitGrowthEntry = {
      kind: "unit",
      level: Math.max(1, Math.trunc(profile.level)),
      exp: 0,
      rebirths: 0,
      stats,
      kPm: null,
      elements: recruitElementSlots(profile.elements),
    };
    table.set(unitId, made);
    saveUnit(unitId, made);
    return made;
  };
  const setUnit = (row: Readonly<Record<string, unknown>>): void => {
    const unitId = Number(row["unit_id"]);
    const stats = sixOrNull(row["stats"]);
    if (!Number.isFinite(unitId) || !stats) return;
    table.set(unitId, {
      kind: "unit",
      level: Math.max(1, Math.trunc(Number(row["level"] ?? 1))),
      exp: 0,
      rebirths: 0,
      stats,
      kPm: null,
      elements: numbers(row["elements"]),
    });
  };

  const setHuman = (row: Readonly<Record<string, unknown>>): void => {
    const unitId = Number(row["unit_id"]);
    const stats = sixOrNull(row["stats"]);
    if (!Number.isFinite(unitId)) return;
    if (!stats) {
      // 저장된 스탯이 없는 휴먼 줄(NPC 런타임이 켤 때 채운다): 휴먼 줄에서 온 값만 뺀다(굴려 둔 그 밖 유닛 줄은 그대로 쓴다)
      if (table.get(unitId)?.kind === "human") table.delete(unitId);
      return;
    }
    dropUnitRow(unitId);
    const old = table.get(unitId)?.kind === "unit" ? undefined : table.get(unitId);
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
    dropUnitRow(unitId);
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
    input.pool.query("select unit_id, level, stats, elements from unit_stats"),
  ])
    .then(([humans, cyborgUnits, exps, units]) => {
      for (const row of humans.rows) if (!table.has(Number(row.unit_id))) setHuman(row);
      for (const row of cyborgUnits.rows) if (!table.has(Number(row.unit_id))) setCyborgUnit(row);
      // 그 밖 유닛: 휴먼·사이보그 유닛 줄이 있으면 그 줄이 이긴다
      for (const row of units.rows) if (!table.has(Number(row.unit_id))) setUnit(row);
      ready = true;
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
      if (removed) {
        dropUnitRow(unitId);
        table.delete(unitId);
        plain.delete(unitId);
      }
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

  const spanAt = (level: number): number =>
    level >= input.rules().cyborg.maxLevel ? 0 : expSpanAt(expTable(), level);
  const grownOf = (initial: readonly number[], kPm: readonly number[] | null, level: number): number[] =>
    initial.map((value, index) =>
      primaryAtLevel(value, input.rules().cyborg.growthPm, kPm?.[index] ?? DEFAULT_GROWTH_K_PM, level),
    );

  const store: UnitGrowthStore = {
    spanAt,
    grownOf,
    sheetOf(unitId) {
      const entry = ensure(unitId);
      if (!entry) return undefined;
      return {
        kind: entry.kind,
        level: entry.level,
        exp: entry.exp,
        span: spanAt(entry.level),
        rebirths: entry.rebirths,
        initial: entry.stats,
        kPm: entry.kPm,
        stats: grownOf(entry.stats, entry.kPm, entry.level),
      };
    },
    baseOf(unitId) {
      const entry = ensure(unitId);
      if (!entry) return undefined;
      const at = (index: number): number => entry.stats[index] ?? 0;
      const k = (index: number): number => entry.kPm?.[index] ?? DEFAULT_GROWTH_K_PM;
      return {
        kind: "stats",
        // 그 밖 유닛은 휴먼 칸 배치(기본 몸과 같다)
        unitKind: entry.kind === "cyborg" ? "cyborg" : "human",
        primaries: { str: at(0), dex: at(1), agi: at(2), vit: at(3), int: at(4), wis: at(5) },
        kPm: { str: k(0), dex: k(1), agi: k(2), vit: k(3), int: k(4), wis: k(5) },
        level: entry.level,
        rebirths: entry.rebirths,
        elements: entry.elements,
      };
    },
    viewOf(unitId) {
      const entry = ensure(unitId);
      if (!entry) return undefined;
      return { level: entry.level, exp: entry.exp, span: spanAt(entry.level) };
    },
    gain(unitId, amount) {
      const entry = ensure(unitId);
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
        if (entry.kind === "unit") saveUnit(unitId, entry);
        else
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
