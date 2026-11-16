// 가문 이동의 공통 몫 — 기획 D-570(houseMoves.ts 머리 주석). 소속 도시 바꾸기(houseHome.ts — 공고 기간 0이면 바로)와 공고 옮기기(houseMoves.ts)가
// 같이 쓴다: 소속 도시·가문 나라 바꾸기와 가문원 소식, 들어가는 나라의 정책(factions.house_entry_fee — + 가입비 / − 지원금, null = 0)을 가문원마다 매기기.
import type { Ledger } from "../economy/ledger.ts";
import type { OwnerRow } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { ASSET_CREDIT, type Settlement } from "../world/settlement.ts";
import { notify } from "./members.ts";
import type { IdentityQueryable } from "./store.ts";

/** 원장 몫(가입비·지원금) — 세계 저장 층(WorldPersistence)이 그대로 맞는다 */
export interface HouseMovePersistence {
  readonly owners: ReadonlyMap<number, Pick<OwnerRow, "id" | "factionId">>;
  readonly settlement: Pick<Settlement, "findOwnerOfUser"> & {
    settleOwner(ownerId: number, toMs: number): unknown;
  };
  readonly ledger: Pick<Ledger, "balanceOf" | "ownerAccount" | "post">;
  readonly writer: Pick<WorldWriter, "durable">;
}

/** 그 나라의 가문 이동 정책(가문원마다 값, + 가입비 / − 지원금). 없으면 0 */
export async function houseEntryTermsOf(q: IdentityQueryable, nationId: number): Promise<bigint> {
  const { rows } = await q.query<{ house_entry_fee: string | null }>(
    "select house_entry_fee from factions where id = $1",
    [nationId],
  );
  const value = rows[0]?.house_entry_fee;
  return value === null || value === undefined ? 0n : BigInt(value);
}

/**
 * 가문을 새 소속 도시로 옮긴다(트랜잭션 안, 가문 행을 잠근 뒤): 소속 도시·가문 나라·공고 비우기·가문원 소식(skip은 빼고). 가문원 user id(가문장 포함)
 */
export async function moveHouseHome(
  q: IdentityQueryable,
  input: {
    readonly house: { readonly id: number; readonly name: string };
    readonly city: { readonly id: number; readonly name: string | null; readonly nationId: number };
    readonly leaderName: string | null;
    readonly skip: string | null;
    readonly nowMs: number;
  },
): Promise<string[]> {
  await q.query(
    `insert into house_homes (faction_id, city_id, set_at_ms) values ($1, $2, $3)
     on conflict (faction_id) do update set city_id = excluded.city_id, set_at_ms = excluded.set_at_ms,
       pending_city_id = null, pending_at_ms = null`,
    [input.house.id, input.city.id, input.nowMs],
  );
  await q.query("update factions set born_of = $2 where id = $1", [input.house.id, input.city.nationId]);
  const { rows } = await q.query<{ user_id: string }>(
    "select user_id from house_members where faction_id = $1 order by user_id",
    [input.house.id],
  );
  for (const row of rows) {
    if (row.user_id === input.skip) continue;
    await notify(q, {
      userId: row.user_id,
      factionId: input.house.id,
      kind: "home_changed",
      houseName: input.house.name,
      other: input.leaderName,
      reason: input.city.name,
      nowMs: input.nowMs,
    });
  }
  return rows.map((row) => row.user_id);
}

/** 가입비·지원금을 가문원마다 매긴다(원장 — 커밋 뒤에 부른다). 낸 합·받은 합 */
export async function chargeHouseEntry(
  p: HouseMovePersistence | undefined,
  input: {
    readonly houseId: number;
    readonly nationId: number;
    readonly terms: bigint;
    readonly userIds: readonly string[];
    readonly nowMs: number;
  },
): Promise<{ readonly paid: bigint; readonly granted: bigint }> {
  if (!p || input.terms === 0n) return { paid: 0n, granted: 0n };
  let treasury: number | undefined;
  for (const owner of p.owners.values()) if (owner.factionId === input.nationId) treasury = owner.id;
  if (treasury === undefined) return { paid: 0n, granted: 0n };
  let paid = 0n;
  let granted = 0n;
  for (const userId of input.userIds) {
    const me = p.settlement.findOwnerOfUser(userId);
    if (me === undefined || me === treasury) continue;
    // 잔고는 지금까지 정산한 뒤 본다(유지비가 먼저 빠진다)
    p.settlement.settleOwner(me, input.nowMs);
    const from = input.terms > 0n ? me : treasury;
    const to = input.terms > 0n ? treasury : me;
    const asked = input.terms > 0n ? input.terms : -input.terms;
    const available = p.ledger.balanceOf(from, ASSET_CREDIT);
    const amount = asked < available ? asked : available;
    if (amount <= 0n) continue;
    p.ledger.post({
      kind: "house_entry",
      atMs: input.nowMs,
      key: `house_entry:${input.houseId}:${userId}:${input.nowMs}`,
      entries: [
        { account: p.ledger.ownerAccount(from, ASSET_CREDIT), amount: -amount },
        { account: p.ledger.ownerAccount(to, ASSET_CREDIT), amount },
      ],
    });
    if (input.terms > 0n) paid += amount;
    else granted += amount;
  }
  if (paid + granted > 0n) await p.writer.durable();
  return { paid, granted };
}
