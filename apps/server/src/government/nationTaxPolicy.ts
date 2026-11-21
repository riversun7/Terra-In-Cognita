// 나라 세금 정하기·읽기 — 기획 D-128("세율은 정부가 정한다")·D-579, 질문 2322 나·2373 가. docs/adr/2026-11-15-business-ledger.md "바뀜 (tax-2 …)".
// 실효 값 규칙은 nationTax.ts, 메시지는 @terra/protocol nationTax.ts(WebSocket nation_tax → nation_tax_result — 가문 게이트웨이가 받아 넘긴다).
// - 정하는 사람: 그 나라의 지도자 = 지배 가문의 장(D-217·질문 2012 답). 플레이어 나라 = 도시를 가진 독립 가문(위 세력 없음 — houseEntryPolicy.ts ruledBy)의
//   가문장. NPC 나라는 정하는 사람이 없다(성향 규칙식).
// - 바뀜(governance-2, 질문 2407 가): 민주주의·자본주의 나라에서 칸 하나라도 한 번에 설정 칸 gov_tax_agenda_width_pm(‰, 소득세는 bp ÷ 10) 이상 바꾸면
//   taxChangeRule이 "vote"를 돌려주고 이 명령은 바로 정하지 않고 나라 의결 세율 안건(tax_change)을 연다(결과 ok + agendaId). 가결되면 의결 서비스가
//   applyNationTaxes로 쓴다. 폭 아래·독재는 지도자가 바로 정한다. 칸의 null(정하지 않음)은 0으로 견준다 [임시 질문 2436].
// - 바뀜(governance-3, 질문 2440 나 답 — D-252·D-128·D-5057): 선출로 NPC 나라를 이끄는 플레이어 지배 가문의 장(governance_state — houseEntryPolicy.ts
//   electedNationOf)도 그 나라 세금을 정한다(NPC 판단은 그 나라 세율을 정하지 않는다 — npc/governanceHooks.ts nationLocked). 체제·안건 규칙은 같다.
// - 바뀜(residence, 사용자 답 D-585 2): 주민세 주기는 정부가 고르기 목록(@terra/shared/government RESIDENT_TAX_PERIOD_DAYS)에서 고른다 — 목록 밖 값으로 바꾸면
//   invalid_period(이미 정해 둔 옛 값을 그대로 두는 것은 받는다). 주기만 바꾸는 것은 폭 셈에 들지 않아 지도자가 바로 정한다(taxChangeWidthPm — 세율 칸만 본다).
// - 감사 기록 faction.nation_tax(나라·앞뒤 값). 정한 뒤 메모리 표(nationTax.ts)를 바꾼다 — 다음 사업장 소득세·하루 끝 주민세부터 쓴다.
import { type GovernmentRegime, type GovernmentTaxes, isResidentTaxPeriod } from "@terra/shared/government";
import type { NationTaxResultCode } from "@terra/protocol";
import type { SocietyCoefficients } from "@terra/sim";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { electedNationOf, ruledBy } from "../factionIdentity/houseEntryPolicy.ts";
import { type HouseTxPool, inTransaction, membershipOf } from "../factionIdentity/members.ts";
import type { IdentityQueryable } from "../factionIdentity/store.ts";
import { taxChangeNeedsAgenda } from "../governance/rules.ts";
import {
  NATION_TAX_SELECT,
  type NationTaxRow,
  type NationTaxTable,
  UNSET_NATION_TAX,
  effectiveNationTaxes,
  nationTaxRowOf,
} from "./nationTax.ts";

export type NationTaxResult =
  | { readonly ok: true; readonly factionId: number; readonly agendaId?: number | undefined }
  | { readonly ok: false; readonly code: NationTaxResultCode };

export interface NationTaxPolicyService {
  set(userId: string, row: NationTaxRow): Promise<NationTaxResult>;
}

/** 칸 하나의 바꾸는 폭(null = 0) */
const diff = (a: number | null, b: number | null, scale = 1): number =>
  Math.trunc(Math.abs((b ?? 0) - (a ?? 0)) / scale);

/** 나라 세금 바꾸기 폭(‰ — 칸마다 |뒤 − 앞|의 가장 큰 값, 소득세는 bp ÷ 10, null = 0) */
export function taxChangeWidthPm(before: NationTaxRow | undefined, after: NationTaxRow): number {
  const was = before ?? UNSET_NATION_TAX;
  return Math.max(
    diff(was.incomeTaxBp, after.incomeTaxBp, 10),
    diff(was.residentTaxPm, after.residentTaxPm),
    diff(was.residentNationPm, after.residentNationPm),
  );
}

/** 체제·폭 → 세율을 바꾸는 길(D-217, 질문 2407 가 — 위 머리 주석 바뀜) */
export function taxChangeRule(
  regime: GovernmentRegime,
  before?: NationTaxRow,
  after?: NationTaxRow,
  widthPm?: number,
): "leader" | "vote" {
  if (regime === "dictatorship" || !after || widthPm === undefined) return "leader";
  return taxChangeNeedsAgenda(0, taxChangeWidthPm(before, after), widthPm) ? "vote" : "leader";
}

/** 나라 세금 한 줄을 DB와 메모리 표에 쓴다(지도자가 바로 정함·가결된 세율 안건 — governance/service.ts). set_by = null이면 의결 */
export async function applyNationTaxes(
  q: IdentityQueryable,
  table: NationTaxTable | undefined,
  nationRow: number,
  row: NationTaxRow,
  nowMs: number,
  setBy: string | null,
): Promise<void> {
  await q.query(
    `insert into nation_taxes
       (faction_id, income_tax_bp, resident_tax_pm, resident_every_days, resident_nation_pm, set_at_ms, set_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (faction_id) do update set income_tax_bp = excluded.income_tax_bp,
       resident_tax_pm = excluded.resident_tax_pm, resident_every_days = excluded.resident_every_days,
       resident_nation_pm = excluded.resident_nation_pm, set_at_ms = excluded.set_at_ms, set_by = excluded.set_by`,
    [
      nationRow,
      row.incomeTaxBp,
      row.residentTaxPm,
      row.residentEveryDays,
      row.residentNationPm,
      nowMs,
      setBy,
    ],
  );
  table?.set(nationRow, row);
}

const fail = (code: NationTaxResultCode): NationTaxResult => ({ ok: false, code });

/** DB 체제 글자 → 체제(모르면 민주주의 — factions.regime 기본값) */
const regimeOf = (text: string): GovernmentRegime =>
  text === "dictatorship" || text === "capitalism" ? text : "democracy";

export function createNationTaxPolicy(o: {
  readonly pool: HouseTxPool;
  readonly db?: Database | undefined;
  readonly now: () => number;
  /** 메모리 표(세계가 준비된 뒤 붙는다 — 없으면 DB만 쓰고 다음 reload가 읽는다) */
  readonly table: () => NationTaxTable | undefined;
  /** 세율 안건 폭(‰ — 설정 칸 gov_tax_agenda_width_pm). 없으면 늘 지도자가 바로 정한다 */
  readonly agendaWidthPm?: (() => number) | undefined;
  /** 세율 안건을 연다(governance/service.ts propose tax_change). 안건 ID 또는 실패 코드 */
  readonly openAgenda?:
    | ((
        userId: string,
        row: NationTaxRow,
      ) => Promise<{ ok: true; agendaId: number } | { ok: false; code: NationTaxResultCode }>)
    | undefined;
}): NationTaxPolicyService {
  return {
    async set(userId, row) {
      let audit: Record<string, unknown> | null = null;
      const result = await inTransaction(o.pool, async (q): Promise<NationTaxResult> => {
        const mine = await membershipOf(q, userId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        // 가문 행을 잠근다(도시 얻기·해산·독립과 겹치지 않게)
        const locked = await q.query<{ regime: string }>(
          "select regime from factions where id = $1 for update",
          [mine.factionId],
        );
        let regime = locked.rows[0]?.regime;
        if (regime === undefined) return fail("not_ruler");
        const ruled = await ruledBy(q, mine.factionId);
        // 선출된 지배 가문이 이끄는 NPC 나라(위 바뀜 governance-3)
        let nationId = mine.factionId;
        if (!ruled.nation) {
          const elected = await electedNationOf(q, mine.factionId);
          if (elected === undefined) return fail("not_ruler");
          const nation = await q.query<{ regime: string }>(
            "select regime from factions where id = $1 for update",
            [elected],
          );
          regime = nation.rows[0]?.regime;
          if (regime === undefined) return fail("not_ruler");
          nationId = elected;
        }
        const before = await q.query(`${NATION_TAX_SELECT} where faction_id = $1`, [nationId]);
        const was = nationTaxRowOf(before.rows[0]);
        // 주기는 고르기 목록 안에서만 바꾼다(D-585 2 — 옛 값을 그대로 두는 것은 받는다)
        const period = row.residentEveryDays;
        if (period !== null && period !== was?.residentEveryDays && !isResidentTaxPeriod(period))
          return fail("invalid_period");
        // 민주주의·자본주의에서 폭이 문턱 이상이면 안건으로(질문 2407 가 — 트랜잭션 밖에서 연다)
        if (o.openAgenda && taxChangeRule(regimeOf(regime), was, row, o.agendaWidthPm?.()) === "vote")
          return { ok: true, factionId: nationId, agendaId: 0 };
        await applyNationTaxes(q, undefined, nationId, row, o.now(), userId);
        audit = { factionId: nationId, before: was ?? null, after: row };
        return { ok: true, factionId: nationId };
      });
      if (result.ok && result.agendaId !== undefined && o.openAgenda) {
        const opened = await o.openAgenda(userId, row);
        return opened.ok ? { ok: true, factionId: result.factionId, agendaId: opened.agendaId } : opened;
      }
      if (result.ok) o.table()?.set(result.factionId, row);
      if (audit && o.db)
        await writeAudit(o.db, {
          actor: { kind: "user", id: userId, ip: null },
          action: "faction.nation_tax",
          targetId: userId,
          before: null,
          after: audit,
        });
      return result;
    },
  };
}

/** 정부 판의 나라 세금 칸(보는 사람이 정할 수 있는지 포함). 나라 세력 행을 모르면(옛 세계) 정한 값 없이 기본값 */
export async function readNationTaxes(
  q: IdentityQueryable,
  input: {
    readonly factionRow: number | undefined;
    readonly viewerId: string;
    readonly npc: boolean;
    readonly commerce: number | undefined;
    readonly tradeTaxBp: number;
    readonly rules: SocietyCoefficients;
  },
): Promise<GovernmentTaxes> {
  const nationRow = input.factionRow;
  const [own, mine] = await Promise.all([
    nationRow === undefined
      ? Promise.resolve(undefined)
      : q
          .query(`${NATION_TAX_SELECT} where faction_id = $1`, [nationRow])
          .then((r) => nationTaxRowOf(r.rows[0])),
    // NPC 나라도 본다 — 선출된 플레이어 지배 가문장이 정할 수 있다(바뀜 governance-3)
    membershipOf(q, input.viewerId),
  ]);
  // 정하는 사람 = 이 나라인 독립 가문의 가문장, 또는 선출로 이 나라를 이끄는 플레이어 지배 가문의 장(바뀜 governance-3 — 2440 나)
  const leads = mine?.role === "leader" && nationRow !== undefined && mine.factionId === nationRow;
  const canSet = leads
    ? (await ruledBy(q, nationRow)).nation
    : mine?.role === "leader" && nationRow !== undefined
      ? (await electedNationOf(q, mine.factionId)) === nationRow
      : false;
  return {
    ...effectiveNationTaxes(
      { row: own, npc: input.npc, commerce: input.commerce, tradeTaxBp: input.tradeTaxBp },
      input.rules,
    ),
    canSet,
  };
}
