// 나라 세금 정하기·읽기 — 기획 D-128("세율은 정부가 정한다")·D-579, 질문 2322 나·2373 가. docs/adr/2026-11-15-business-ledger.md "바뀜 (tax-2 …)".
// 실효 값 규칙은 nationTax.ts, 메시지는 @terra/protocol nationTax.ts(WebSocket nation_tax → nation_tax_result — 가문 게이트웨이가 받아 넘긴다).
// - 정하는 사람: 그 나라의 지도자 = 지배 가문의 장(D-217·질문 2012 답). 플레이어 나라 = 도시를 가진 독립 가문(위 세력 없음 — houseEntryPolicy.ts ruledBy)의
//   가문장. NPC 나라는 정하는 사람이 없다(성향 규칙식).
// - TODO(governance 줄기 — 안건 "세율 바꾸기" 자리): 민주주의·자본주의 나라는 세율을 안건 투표(D-221·D-5057)로 바꿀 수 있다. 그 줄기가 안건을 만들면
//   taxChangeRule이 "vote"를 돌려주고, 이 명령은 안건을 여는 길로 바뀐다. 지금은 어느 체제든 지도자가 바로 정한다(기술 기본값 — 질문 2421).
// - 감사 기록 faction.nation_tax(나라·앞뒤 값). 정한 뒤 메모리 표(nationTax.ts)를 바꾼다 — 다음 사업장 소득세·하루 끝 주민세부터 쓴다.
import type { GovernmentRegime, GovernmentTaxes } from "@terra/shared/government";
import type { NationTaxResultCode } from "@terra/protocol";
import type { SocietyCoefficients } from "@terra/sim";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { ruledBy } from "../factionIdentity/houseEntryPolicy.ts";
import { type HouseTxPool, inTransaction, membershipOf } from "../factionIdentity/members.ts";
import type { IdentityQueryable } from "../factionIdentity/store.ts";
import {
  NATION_TAX_SELECT,
  type NationTaxRow,
  type NationTaxTable,
  effectiveNationTaxes,
  nationTaxRowOf,
} from "./nationTax.ts";

export type NationTaxResult =
  | { readonly ok: true; readonly factionId: number }
  | { readonly ok: false; readonly code: NationTaxResultCode };

export interface NationTaxPolicyService {
  set(userId: string, row: NationTaxRow): Promise<NationTaxResult>;
}

/**
 * 체제 → 세율을 바꾸는 길(D-217). 지금은 늘 "leader"(지도자가 바로). TODO(governance 줄기): 민주주의·자본주의에서 안건 투표가 생기면 "vote"를 돌려주고 명령이
 * 안건을 연다(위 머리 주석)
 */
export function taxChangeRule(_regime: GovernmentRegime): "leader" | "vote" {
  return "leader";
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
        const regime = locked.rows[0]?.regime;
        if (regime === undefined) return fail("not_ruler");
        // 체제가 안건 투표를 요구하면 여기서 안건을 연다(governance 줄기 — 지금은 늘 지도자가 바로 정한다)
        if (taxChangeRule(regimeOf(regime)) === "vote") return fail("not_leader");
        const ruled = await ruledBy(q, mine.factionId);
        if (!ruled.nation) return fail("not_ruler");
        const before = await q.query(`${NATION_TAX_SELECT} where faction_id = $1`, [mine.factionId]);
        await q.query(
          `insert into nation_taxes
             (faction_id, income_tax_bp, resident_tax_pm, resident_every_days, resident_nation_pm, set_at_ms, set_by)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (faction_id) do update set income_tax_bp = excluded.income_tax_bp,
             resident_tax_pm = excluded.resident_tax_pm, resident_every_days = excluded.resident_every_days,
             resident_nation_pm = excluded.resident_nation_pm, set_at_ms = excluded.set_at_ms, set_by = excluded.set_by`,
          [
            mine.factionId,
            row.incomeTaxBp,
            row.residentTaxPm,
            row.residentEveryDays,
            row.residentNationPm,
            o.now(),
            userId,
          ],
        );
        audit = { factionId: mine.factionId, before: nationTaxRowOf(before.rows[0]) ?? null, after: row };
        return { ok: true, factionId: mine.factionId };
      });
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
    input.npc ? Promise.resolve(null) : membershipOf(q, input.viewerId),
  ]);
  // 정하는 사람 = 이 나라인 독립 가문의 가문장(NPC 나라는 없다)
  const leads = mine?.role === "leader" && nationRow !== undefined && mine.factionId === nationRow;
  const canSet = leads ? (await ruledBy(q, nationRow)).nation : false;
  return {
    ...effectiveNationTaxes(
      { row: own, npc: input.npc, commerce: input.commerce, tradeTaxBp: input.tradeTaxBp },
      input.rules,
    ),
    canSet,
  };
}
