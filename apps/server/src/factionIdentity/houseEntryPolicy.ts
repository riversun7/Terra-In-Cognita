// 가문 이동 정책 정하기·읽기 — 기획 D-570(사용자 원문 "해당 국가나 도시의 정책에 따름. 지원금이 있을지 가입비가 있을지 등")·D-526(받는 쪽이 정함),
// 질문 2018 답(2026-11-16 기획 세션: 나라 칸만 있으면 도시 칸도, NPC는 D-323 성향 프리셋, 정하는 곳은 정부 판에 최소한으로).
// docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-16, 2012·2014·2018 답)".
// - 도시 정책(city_policies): 그 도시를 가진 가문(world_cities.faction_id = 가문 행)의 가문장만 정한다(도시 주인). 봉신 가문 도시도 된다.
// - 나라 정책(factions.house_entry_fee): 그 나라의 지도자 = 지배 가문의 장(D-217·질문 2012 답). 플레이어 나라는 도시를 가진 독립 가문(위 세력 없음)
//   이라 그 가문장이 정한다. NPC 나라는 정하는 사람이 없고 성향 규칙식(@terra/sim npcHouseEntryFee — 정하지 않은 값 null일 때 읽을 때 셈).
// - 값: 가문원마다 + 가입비 / − 지원금(최소 단위), null = 정하지 않음(도시는 나라 정책을, 플레이어 나라는 0을 따른다). 매기는 곳은 houseEntry.ts.
// - 감사 기록 faction.house_entry_policy(자리·도시·앞뒤 값). 가문원 소식은 없다(옮길 때 공고 칸이 값을 보인다).
import type { GovernmentHouseEntry } from "@terra/shared/government";
import type { HouseEntryScope } from "@terra/protocol";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { nationEntryTerms } from "./houseEntry.ts";
import { cityHome } from "./houseHome.ts";
import { type HouseMemberResult, type HouseTxPool, inTransaction, membershipOf } from "./members.ts";
import type { HouseRules } from "./rules.ts";
import type { IdentityQueryable } from "./store.ts";

export interface HouseEntryPolicyRequest {
  readonly scope: HouseEntryScope;
  readonly cityId?: number | undefined;
  /** 부호 있는 10진 최소 단위(프로토콜이 15자리까지 검사), null = 정하지 않음 */
  readonly fee: string | null;
}

export interface HouseEntryPolicyService {
  set(userId: string, request: HouseEntryPolicyRequest): Promise<HouseMemberResult>;
}

/** 그 가문이 다스리는 것: 가진 도시 ID들과 독립 나라인가(도시를 가졌고 위 세력이 없음) */
async function ruledBy(
  q: IdentityQueryable,
  houseId: number,
): Promise<{ readonly cities: ReadonlySet<number>; readonly nation: boolean }> {
  const { rows } = await q.query<{ id: string; parent_id: string | null }>(
    `select c.id, f.parent_id from world_cities c join factions f on f.id = c.faction_id
      where c.faction_id = $1 and f.kind = 'player' and f.dissolved_at_ms is null`,
    [houseId],
  );
  return {
    cities: new Set(rows.map((row) => Number(row.id))),
    nation: rows.length > 0 && rows.every((row) => row.parent_id === null),
  };
}

const fail = (code: Extract<HouseMemberResult, { ok: false }>["code"]): HouseMemberResult => ({
  ok: false,
  code,
});

export function createHouseEntryPolicy(o: {
  readonly pool: HouseTxPool;
  readonly db?: Database | undefined;
  readonly now: () => number;
}): HouseEntryPolicyService {
  return {
    async set(userId, request) {
      const fee = request.fee === null ? null : BigInt(request.fee);
      let audit: Record<string, unknown> | null = null;
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, userId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        // 가문 행을 잠근다(도시 얻기·해산과 겹치지 않게)
        const locked = await q.query("select id from factions where id = $1 for update", [mine.factionId]);
        if (locked.rows.length === 0) return fail("not_found");
        const ruled = await ruledBy(q, mine.factionId);
        const now = o.now();
        if (request.scope === "city") {
          const cityId = request.cityId;
          if (cityId === undefined) return fail("unknown_city");
          const exists = await q.query("select 1 from world_cities where id = $1", [cityId]);
          if (exists.rows.length === 0) return fail("unknown_city");
          if (!ruled.cities.has(cityId)) return fail("not_ruler");
          const before = await q.query<{ house_entry_fee: string | null }>(
            "select house_entry_fee::text as house_entry_fee from city_policies where city_id = $1",
            [cityId],
          );
          await q.query(
            `insert into city_policies (city_id, house_entry_fee, set_at_ms, set_by) values ($1, $2, $3, $4)
             on conflict (city_id) do update set house_entry_fee = excluded.house_entry_fee,
               set_at_ms = excluded.set_at_ms, set_by = excluded.set_by`,
            [cityId, fee === null ? null : fee.toString(), now, userId],
          );
          audit = {
            factionId: mine.factionId,
            scope: "city",
            cityId,
            before: before.rows[0]?.house_entry_fee ?? null,
            after: request.fee,
          };
        } else {
          if (!ruled.nation) return fail("not_ruler");
          const before = await q.query<{ house_entry_fee: string | null }>(
            "select house_entry_fee::text as house_entry_fee from factions where id = $1",
            [mine.factionId],
          );
          await q.query("update factions set house_entry_fee = $2 where id = $1", [
            mine.factionId,
            fee === null ? null : fee.toString(),
          ]);
          audit = {
            factionId: mine.factionId,
            scope: "nation",
            before: before.rows[0]?.house_entry_fee ?? null,
            after: request.fee,
          };
        }
        return { ok: true, action: "entry_policy_set", factionId: mine.factionId };
      });
      if (audit && o.db)
        await writeAudit(o.db, {
          actor: { kind: "user", id: userId, ip: null },
          action: "faction.house_entry_policy",
          targetId: userId,
          before: null,
          after: audit,
        });
      return result;
    },
  };
}

/** 정부 판의 가문 이동 정책 칸(보는 사람이 정할 수 있는지 포함). 도시가 없으면 null */
export async function readHouseEntryPolicy(
  q: IdentityQueryable,
  input: { readonly cityId: number; readonly viewerId: string; readonly rules: HouseRules },
): Promise<GovernmentHouseEntry | null> {
  const city = await cityHome(q, input.cityId);
  if (!city) return null;
  const [own, nation, mine] = await Promise.all([
    q.query<{ house_entry_fee: string | null }>(
      "select house_entry_fee::text as house_entry_fee from city_policies where city_id = $1",
      [input.cityId],
    ),
    nationEntryTerms(q, city.nationId, input.rules.npcEntry),
    membershipOf(q, input.viewerId),
  ]);
  const ruled = mine?.role === "leader" ? await ruledBy(q, mine.factionId) : null;
  return {
    city: own.rows[0]?.house_entry_fee ?? null,
    nation: nation.terms.toString(),
    nationSource: nation.source === "nation" ? "leader" : nation.source === "npc" ? "npc" : "none",
    canSetCity: ruled?.cities.has(input.cityId) === true,
    canSetNation: ruled?.nation === true && mine?.factionId === city.nationId,
  };
}
