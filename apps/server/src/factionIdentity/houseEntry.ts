// 가문 이동의 공통 몫 — 기획 D-570(houseMoves.ts 머리 주석). 소속 도시 바꾸기(houseHome.ts — 공고 기간 0이면 바로)와 공고 옮기기(houseMoves.ts)가
// 같이 쓴다: 소속 도시·가문 나라 바꾸기와 가문원 소식, 들어가는 도시·나라의 정책(+ 가입비 / − 지원금 — houseEntryTermsOf)을 가문이 한꺼번에
// 내고 받기(D-573 — 가문 금고 → 모자라면 가문장 지갑, 못 내면 옮기지 않는다: entryShortfall).
// 바뀜(fixes-1116l, 질문 2150 → D-338·D-213): 가문 금고 = 가문마다 따로 둔 금고(houseVault.ts — 국고와 따로, 도시 없는 가문에도). 옛 "가문 소유 주체
// (도시를 가진 가문의 국고) → 없으면 가문장 지갑"을 대신한다. 국고에 섞인 옛 가문 돈은 없다(도시를 가진 가문은 옮기지 못해 옛 길이 쓰인 적이 없고,
// 옛 지원금은 가문장 지갑으로 갔다 — 그 지갑 돈은 가문장 것으로 둔다).
import { npcHouseEntryFee } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { OwnerRow } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { ASSET_CREDIT, type Settlement } from "../world/settlement.ts";
import { vaultAccount, vaultTake } from "./houseVault.ts";
import { notify } from "./members.ts";
import type { HouseRules } from "./rules.ts";
import type { IdentityQueryable } from "./store.ts";

/** 원장 몫(가입비·지원금) — 세계 저장 층(WorldPersistence)이 그대로 맞는다 */
export interface HouseMovePersistence {
  readonly owners: ReadonlyMap<number, Pick<OwnerRow, "id" | "factionId">>;
  readonly settlement: Pick<Settlement, "findOwnerOfUser"> & {
    settleOwner(ownerId: number, toMs: number): unknown;
  };
  readonly ledger: Pick<
    Ledger,
    "balanceOf" | "ownerAccount" | "post" | "systemAccount" | "balance" | "accounts"
  >;
  readonly writer: Pick<WorldWriter, "durable">;
}

/** 가문 이동 정책을 정한 곳: 도시(city_policies) · 나라(factions.house_entry_fee) · NPC 나라 성향 규칙식 · 없음 */
export type HouseEntrySource = "city" | "nation" | "npc" | "none";

/** 정책 한 몫: 가문원마다 값(+ 가입비 / − 지원금)과 받는·주는 쪽(세력 행 — 그 세력 소유 주체의 국고) */
export interface HouseEntryPart {
  readonly terms: bigint;
  /** 국고 세력 행(도시 정책이면 도시 주인, 나라 정책이면 그 나라) */
  readonly payee: number;
  readonly source: HouseEntrySource;
}

/** 옮길 때 매길 정책들(도시 몫·나라 몫 — 별개로 둘 다, D-574 2142)과 가문원마다 합 */
export interface HouseEntryTerms {
  /** 가문원마다 합(도시 몫 + 나라 몫 — 보이기용. 매기기는 몫마다 따로) */
  readonly terms: bigint;
  /** 값이 0이 아닌 몫(도시 → 나라 차례) */
  readonly parts: readonly HouseEntryPart[];
}

const NO_TERMS: HouseEntryTerms = { terms: 0n, parts: [] };

/** 정책 읽기가 쓰는 질의(pg Pool·트랜잭션 연결이 그대로 맞는다 — 줄 모양은 읽을 때 본다) */
export interface EntryQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** DB 값 → 부호 있는 금액(정하지 않음 null) */
const feeOf = (value: unknown): bigint | null =>
  typeof value === "string" || typeof value === "number" || typeof value === "bigint" ? BigInt(value) : null;

/** 상업 성향 축 자리(@terra/sim TRAIT_AXES — 공격·상업·신앙·정거장) */
const COMMERCE_AXIS = 1;

/** NPC 나라의 정책(성향 규칙식 D-323, 질문 2018): 저장한 성향이 없으면 가운데(0) */
export function npcEntryTerms(traits: unknown, rule: HouseRules["npcEntry"]): bigint {
  const commerce = Array.isArray(traits) ? Number(traits[COMMERCE_AXIS]) : Number.NaN;
  if (!Number.isFinite(commerce)) return 0n;
  return BigInt(npcHouseEntryFee(commerce, rule, { feeMax: rule.feeMax, grantMax: rule.grantMax }));
}

/**
 * 가문이 그 도시로 옮길 때의 정책(기획 D-570 "해당 국가나 도시의 정책", D-526 받는 쪽이 정함, 질문 2018 답). 바뀜(D-574 2142 — 사용자 답
 * "나. 별개"): 도시 정책과 나라 정책은 별개로 둘 다 매긴다(지원금·가입비 모두 각각, 옛 "도시 값이 나라 값을 대신"을 대신함).
 * - 도시 몫: 그 도시가 정한 값(city_policies, 도시를 가진 가문의 가문장이 정함) — 나라가 같아도 매기고, 받는 쪽은 도시 주인 국고.
 * - 나라 몫: 나라가 바뀌는 옮기기면 들어가는 나라가 정한 값(factions.house_entry_fee — 지도자가 정함), 없고 NPC 나라면 성향 규칙식(npc 입력이
 *   있을 때). 같은 나라 안 옮기기는 나라 몫이 없다.
 */
export async function houseEntryTermsOf(
  q: EntryQueryable,
  input: {
    readonly cityId: number;
    readonly nationId: number;
    readonly nationChanged: boolean;
    readonly npc?: HouseRules["npcEntry"] | undefined;
  },
): Promise<HouseEntryTerms> {
  const parts: HouseEntryPart[] = [];
  const city = await q.query(
    `select p.house_entry_fee::text as house_entry_fee, c.faction_id from city_policies p
       join world_cities c on c.id = p.city_id where p.city_id = $1 and p.house_entry_fee is not null`,
    [input.cityId],
  );
  const own = city.rows[0];
  const ownFee = own ? feeOf(own.house_entry_fee) : null;
  if (own && ownFee !== null && ownFee !== 0n)
    parts.push({ terms: ownFee, payee: Number(own.faction_id), source: "city" });
  if (input.nationChanged) {
    const nation = await nationEntryTerms(q, input.nationId, input.npc);
    if (nation.terms !== 0n)
      parts.push({ terms: nation.terms, payee: input.nationId, source: nation.source });
  }
  if (parts.length === 0) return NO_TERMS;
  return { terms: parts.reduce((sum, part) => sum + part.terms, 0n), parts };
}

/** 그 나라의 가문 이동 정책: 지도자가 정한 값(factions.house_entry_fee) → 없고 NPC 나라면 성향 규칙식(npc 입력이 있을 때) → 0 */
export async function nationEntryTerms(
  q: EntryQueryable,
  nationId: number,
  npc: HouseRules["npcEntry"] | undefined,
): Promise<{ readonly terms: bigint; readonly source: HouseEntrySource }> {
  const { rows } = await q.query(
    "select house_entry_fee::text as house_entry_fee, kind, traits from factions where id = $1",
    [nationId],
  );
  const nation = rows[0];
  if (!nation) return { terms: 0n, source: "none" };
  const fee = feeOf(nation.house_entry_fee);
  if (fee !== null) return { terms: fee, source: "nation" };
  if (nation.kind !== "npc" || !npc) return { terms: 0n, source: "none" };
  return { terms: npcEntryTerms(nation.traits, npc), source: "npc" };
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

/**
 * 가문이 한꺼번에 내고 받는 몫(기획 D-573 — 질문 2017 다 "가문장 또는 가문 금고가 한꺼번에 낸다. 못 내면 이동 못 함", 지원금도 가문이 받는다):
 * 몫마다 값 = 정책(가문원마다) × 옮기는 가문원 수(가문장 포함) [질문 2145 가]. 도시 몫·나라 몫은 별개로 둘 다(D-574 2142). 가입비는 가문 금고
 * (houseVault.ts)에서 먼저, 모자란 만큼 가문장 지갑에서 [기획 대조 2222 확정], 지원금은 가문 금고로. 못 내는지는 가입비 합으로 본다(받을 지원금으로
 * 가입비를 메우지 않는다 — 기술 기본값, 질문 2253).
 */
export interface HouseEntryCharge {
  readonly houseId: number;
  /** 가문장(금고가 모자랄 때 그 지갑). 없으면 null */
  readonly leaderId: string | null;
  /** 몫들(HouseEntryTerms.parts — 받는·주는 국고와 가문원마다 값) */
  readonly parts: readonly Pick<HouseEntryPart, "payee" | "terms">[];
  /** 옮기는 가문원 수(가문장 포함) */
  readonly members: number;
  readonly nowMs: number;
}

/** 가문이 낼 합(가입비면 양수, 지원금이면 음수 — 몫을 모두 더한 값, 보이기용) */
export const entryTotal = (charge: { readonly terms: bigint; readonly members: number }): bigint =>
  charge.terms * BigInt(Math.max(0, charge.members));

/** 받는·주는 국고 소유 주체(세력 행 payee의 주체). 없으면 undefined */
function treasuryOf(p: HouseMovePersistence, payee: number | null): number | undefined {
  if (payee === null) return undefined;
  for (const owner of p.owners.values()) if (owner.factionId === payee) return owner.id;
  return undefined;
}

/** 몫마다 합(가문원 수를 곱함)과 국고 주체 — 국고 없는 몫은 뺀다 */
function chargeLines(
  p: HouseMovePersistence,
  charge: HouseEntryCharge,
): { readonly treasury: number; readonly total: bigint }[] {
  const out: { treasury: number; total: bigint }[] = [];
  for (const part of charge.parts) {
    const total = entryTotal({ terms: part.terms, members: charge.members });
    const treasury = treasuryOf(p, part.payee);
    if (total !== 0n && treasury !== undefined) out.push({ treasury, total });
  }
  return out;
}

/** 가입비를 낼 몫: 금고에서 꺼낼 양·가문장 지갑에서 낼 양(지갑 주체)·못 내는 양. 가문장 지갑은 지금까지 정산한 뒤 본다 */
function feeSplit(
  p: HouseMovePersistence,
  charge: HouseEntryCharge,
  total: bigint,
): {
  readonly vault: bigint;
  readonly leader: number | undefined;
  readonly fromLeader: bigint;
  readonly short: bigint;
} {
  const vault = vaultTake(p.ledger, charge.houseId, ASSET_CREDIT, total);
  const rest = total - vault;
  const leader = charge.leaderId === null ? undefined : p.settlement.findOwnerOfUser(charge.leaderId);
  if (rest <= 0n || leader === undefined) return { vault, leader, fromLeader: 0n, short: rest };
  p.settlement.settleOwner(leader, charge.nowMs);
  const available = p.ledger.balanceOf(leader, ASSET_CREDIT);
  const fromLeader = rest < available ? rest : available;
  return { vault, leader, fromLeader, short: rest - fromLeader };
}

/** 가입비 몫의 합 */
const feeTotalOf = (lines: readonly { readonly total: bigint }[]): bigint =>
  lines.reduce((sum, line) => (line.total > 0n ? sum + line.total : sum), 0n);

/**
 * 가입비를 못 내는 만큼(0이면 낼 수 있다 — 지원금·값 없음·세계 없음·국고 없는 나라도 0). 옮기기 전에 본다: 모자라면 옮기지 않는다(D-573)
 */
export function entryShortfall(p: HouseMovePersistence | undefined, charge: HouseEntryCharge): bigint {
  if (!p) return 0n;
  const fees = feeTotalOf(chargeLines(p, charge));
  return fees <= 0n ? 0n : feeSplit(p, charge, fees).short;
}

/**
 * 가입비·지원금을 한꺼번에 매긴다(원장 거래 house_entry 하나 — 옮긴 커밋 뒤에 부른다). 가입비는 앞서 entryShortfall로 본 뒤라 모자라면(그 사이
 * 줄었으면) 있는 만큼을 몫 차례로, 지원금은 몫마다 그 국고에 있는 만큼 가문 금고로(새 화폐를 만들지 않는다 — 귀화 질문 845와 같다). 낸 합·받은 합
 */
export async function chargeHouseEntry(
  p: HouseMovePersistence | undefined,
  charge: HouseEntryCharge,
): Promise<{ readonly paid: bigint; readonly granted: bigint }> {
  const none = { paid: 0n, granted: 0n };
  if (!p) return none;
  const lines = chargeLines(p, charge);
  if (lines.length === 0) return none;
  const entries: { account: number; amount: bigint }[] = [];
  let paid = 0n;
  let granted = 0n;
  const fees = feeTotalOf(lines);
  if (fees > 0n) {
    const split = feeSplit(p, charge, fees);
    if (split.vault > 0n)
      entries.push({ account: vaultAccount(p.ledger, charge.houseId, ASSET_CREDIT), amount: -split.vault });
    if (split.leader !== undefined && split.fromLeader > 0n)
      entries.push({ account: p.ledger.ownerAccount(split.leader, ASSET_CREDIT), amount: -split.fromLeader });
    // 낸 만큼을 몫 차례로 나눠 받는 국고에
    let left = split.vault + split.fromLeader;
    for (const line of lines) {
      if (line.total <= 0n || left <= 0n) continue;
      const part = line.total < left ? line.total : left;
      entries.push({ account: p.ledger.ownerAccount(line.treasury, ASSET_CREDIT), amount: part });
      left -= part;
      paid += part;
    }
  }
  for (const line of lines) {
    if (line.total >= 0n) continue;
    const available = p.ledger.balanceOf(line.treasury, ASSET_CREDIT);
    const part = -line.total < available ? -line.total : available;
    if (part <= 0n) continue;
    entries.push(
      { account: p.ledger.ownerAccount(line.treasury, ASSET_CREDIT), amount: -part },
      { account: vaultAccount(p.ledger, charge.houseId, ASSET_CREDIT), amount: part },
    );
    granted += part;
  }
  if (entries.length === 0) return none;
  p.ledger.post({
    kind: "house_entry",
    atMs: charge.nowMs,
    key: `house_entry:${charge.houseId}:${charge.nowMs}`,
    entries,
  });
  await p.writer.durable();
  return { paid, granted };
}
