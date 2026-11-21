// 나라 세금 — 기획 D-128(세금 7종, "세율은 정부(도시·세력의 통치자)가 정한다", 시스템 상한 없음 — 50 E32, NPC 세력의 세율은 세력 AI → D-323 규칙식)·
// D-579(주민세 주기·세율은 나라가 정함, 도시세 → 국세 2중 구조), 질문 2322 나(임금 소득세율을 거래세와 나눠 나라가 정한다)·2373 가(나라 주민세 칸 저장).
// docs/adr/2026-11-15-business-ledger.md "바뀜 (tax-2 …)".
// - 저장: 표 nation_taxes(나라 세력 행마다 한 줄, 칸마다 null = 정하지 않음). 정하기는 nationTaxPolicy.ts(지도자, WebSocket nation_tax).
// - 메모리 표: 세계 원장마다 하나(WeakMap — factionIdentity/houseTax.ts와 같은 꼴). 사업장 소득세(facilities/world.ts)와 하루 끝 주민세(SimHooks.residentTaxOf —
//   npc/rulingVault.ts가 얹는다)가 원장으로 찾는다. 붙기 전(서버를 켠 직후)에는 정하지 않은 것과 같다(기본값).
// - 실효 값(effectiveNationTaxes):
//   · 소득세(만분율) = 나라 값 → 없으면 그 나라 거래세율(옛 판 그대로 — NPC 나라는 거래세 규칙식 nextTaxBp가 움직인다). 사업장 수입 소득세와 임금 원천징수가
//     같은 율로 쓴다(D-578 "사업장 수입 소득세와 같은 율" 그대로).
//   · 주민세율(‰) = 나라 값 → 없고 NPC 나라면 성향 규칙식(@terra/sim npcResidentTaxPm — 설정 칸 npc_resident_tax_min·max, 기본 0) → 아니면 설정 칸
//     nation_resident_tax_pm(기본 0).
//   · 주기(날)·국세 몫(‰) = 나라 값 → 없으면 설정 칸(nation_resident_tax_every_ms 날로 내림·nation_resident_tax_nation_pm). NPC 나라도 설정 칸(규칙식 없음 —
//     기술 기본값).
// 정수만 쓴다.
import type { GovernmentTaxField, GovernmentTaxes, GovernmentTaxSource } from "@terra/shared/government";
import { type SimFaction, type SimHooks, type SocietyCoefficients, npcResidentTaxPm } from "@terra/sim";
import type { OwnerRow, QueryPool } from "../world/persist/load.ts";

const DAY_MS = 86_400_000;

/** 나라가 정한 세금 한 줄(칸마다 null = 정하지 않음) */
export interface NationTaxRow {
  readonly incomeTaxBp: number | null;
  readonly residentTaxPm: number | null;
  readonly residentEveryDays: number | null;
  readonly residentNationPm: number | null;
  /**
   * 거래세(만분율 — 줄기 governance-5, 질문 2460 "정부가 세율 지정" D-128). null = 정하지 않음(그 나라 지금 거래세 그대로). 없으면(옛 기기 명령·옛 안건) 앞 값을 남긴다
   * — 정할 때 부르는 쪽이 채운다. 지도자가 이끄는 나라만 의결 틱이 거래소에 건다(NPC 나라는 거래세 규칙식 그대로)
   */
  readonly tradeTaxBp?: number | null | undefined;
}

export const UNSET_NATION_TAX: NationTaxRow = {
  incomeTaxBp: null,
  residentTaxPm: null,
  residentEveryDays: null,
  residentNationPm: null,
  tradeTaxBp: null,
};

export interface NationTaxTable {
  /** 그 나라 세력 행이 정한 값(줄이 없으면 undefined) */
  rowOf(factionRow: number): NationTaxRow | undefined;
  /** 그 나라 소유 주체(국고 주인)가 정한 값 — 소유 주체 → 세력 행 */
  forOwner(ownerId: number): NationTaxRow | undefined;
  /** 정한 뒤 메모리 표를 바꾼다(명령이 DB에 쓴 뒤) */
  set(factionRow: number, row: NationTaxRow): void;
  /** DB에서 다시 읽는다 */
  reload(): Promise<void>;
}

/** DB 값 → 정수 칸(없으면 null) */
const intOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/** DB 줄 → 나라 세금 한 줄 */
export function nationTaxRowOf(row: Record<string, unknown> | undefined): NationTaxRow | undefined {
  if (!row) return undefined;
  return {
    incomeTaxBp: intOrNull(row.income_tax_bp),
    residentTaxPm: intOrNull(row.resident_tax_pm),
    residentEveryDays: intOrNull(row.resident_every_days),
    residentNationPm: intOrNull(row.resident_nation_pm),
    tradeTaxBp: intOrNull(row.trade_tax_bp),
  };
}

export const NATION_TAX_SELECT =
  "select faction_id, income_tax_bp, resident_tax_pm, resident_every_days, resident_nation_pm, trade_tax_bp from nation_taxes";

const tables = new WeakMap<object, NationTaxTable>();

/** 그 원장의 나라 세금 표(붙기 전이면 undefined — 기본값을 쓴다) */
export function nationTaxesOf(ledger: object): NationTaxTable | undefined {
  return tables.get(ledger);
}

/** 나라 세금 표를 만들어 원장에 붙인다(이미 있으면 그것). 처음 읽기는 부르는 쪽이 reload로 */
export function attachNationTaxes(o: {
  readonly pool: QueryPool;
  readonly ledger: object;
  readonly owners: ReadonlyMap<number, Pick<OwnerRow, "factionId">>;
}): NationTaxTable {
  const existing = tables.get(o.ledger);
  if (existing) return existing;
  let rows = new Map<number, NationTaxRow>();
  const table: NationTaxTable = {
    rowOf: (factionRow) => rows.get(factionRow),
    forOwner(ownerId) {
      const factionRow = o.owners.get(ownerId)?.factionId;
      return factionRow === null || factionRow === undefined ? undefined : rows.get(factionRow);
    },
    set(factionRow, row) {
      rows.set(factionRow, row);
    },
    async reload() {
      const { rows: found } = await o.pool.query(NATION_TAX_SELECT);
      const next = new Map<number, NationTaxRow>();
      for (const row of found) {
        const parsed = nationTaxRowOf(row);
        if (parsed) next.set(Number(row.faction_id), parsed);
      }
      rows = next;
    },
  };
  tables.set(o.ledger, table);
  return table;
}

/** 실효 값을 셈하는 데 필요한 나라 몫 */
export interface NationTaxSubject {
  /** 나라가 정한 값(없으면 모두 기본값) */
  readonly row: NationTaxRow | undefined;
  /** NPC 나라(성향 규칙식을 쓴다) */
  readonly npc: boolean;
  /** 상업 성향(D-327, NPC 규칙식). 모르면 undefined(가장 낮은 성향으로 본다 — npcRulingVaultReturnPm과 같다) */
  readonly commerce: number | undefined;
  /** 그 나라 거래세율(만분율 — 소득세 기본값) */
  readonly tradeTaxBp: number;
}

/** 칸 하나: 나라 값이 있으면 그것(지도자), 없으면 기본값과 그 출처 */
const field = (own: number | null, fallback: number, source: GovernmentTaxSource): GovernmentTaxField =>
  own === null ? { value: fallback, source, own: null } : { value: own, source: "leader", own };

/** 나라의 실효 세금(위 머리 주석). canSet은 부르는 쪽이 정한다 */
export function effectiveNationTaxes(
  subject: NationTaxSubject,
  rules: SocietyCoefficients,
): Omit<GovernmentTaxes, "canSet"> {
  const b = rules.business;
  const row = subject.row ?? UNSET_NATION_TAX;
  const residentDefault = subject.npc
    ? npcResidentTaxPm(subject.commerce ?? Number.NaN, rules.npc, {
        minPm: b.npcResidentTaxMinPm ?? 0,
        maxPm: b.npcResidentTaxMaxPm ?? 0,
      })
    : Math.min(1000, Math.max(0, Math.trunc(b.residentTaxPm ?? 0)));
  const everyDays = Math.max(1, Math.floor((b.residentTaxEveryMs ?? 7 * DAY_MS) / DAY_MS));
  return {
    incomeTaxBp: field(
      row.incomeTaxBp,
      Math.max(0, Math.trunc(subject.tradeTaxBp)),
      subject.npc ? "npc" : "default",
    ),
    residentTaxPm: field(row.residentTaxPm, residentDefault, subject.npc ? "npc" : "default"),
    residentEveryDays: field(row.residentEveryDays, everyDays, "default"),
    residentNationPm: field(
      row.residentNationPm,
      Math.min(1000, Math.max(0, Math.trunc(b.residentTaxNationPm ?? 0))),
      "default",
    ),
  };
}

/**
 * 하루 끝 주민세 고리에 나라 값을 얹는다(SimHooks.residentTaxOf — @terra/sim simulator/societyPayouts.ts collectResidentTax): 나라마다 실효 세율·주기·국세 몫.
 * 소득세는 여기 없다(사업장 장부 tax 고리 — facilities/world.ts가 nationIncomeTaxBp로 읽는다)
 */
export function withNationTaxes(
  base: SimHooks,
  o: { readonly ledger: object; readonly rules: () => SocietyCoefficients },
): SimHooks {
  return {
    ...base,
    residentTaxOf(faction: SimFaction) {
      const taxes = effectiveNationTaxes(
        {
          row: nationTaxesOf(o.ledger)?.forOwner(faction.id),
          npc: faction.player !== true,
          commerce: faction.traits.commerce,
          tradeTaxBp: 0,
        },
        o.rules(),
      );
      return {
        ratePm: taxes.residentTaxPm.value,
        everyMs: taxes.residentEveryDays.value * DAY_MS,
        nationSharePm: taxes.residentNationPm.value,
      };
    },
  };
}

/** 그 나라(국고 주인)의 소득세 만분율: 나라가 정했으면 그 값, 아니면 tradeTaxBp(옛 판 — 거래세율) */
export function nationIncomeTaxBp(ledger: object, ownerId: number, tradeTaxBp: number): number {
  const own = nationTaxesOf(ledger)?.forOwner(ownerId)?.incomeTaxBp;
  return own === null || own === undefined ? tradeTaxBp : own;
}
