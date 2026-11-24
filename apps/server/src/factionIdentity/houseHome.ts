// 가문 소속 도시(기획 D-565) — docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-15, D-565)".
// - 가문은 소속 도시를 고르고, 그 도시가 속한 나라(도시 주인 세력에서 봉신 관계를 따라 올라간 최상위 세력)의 가문이 자동으로 된다. 소속 도시는
//   세금 납부·랭킹 집계에 쓴다. 가문 나라는 factions.born_of에 함께 적는다 — 같은 나라 시야 공유(D-250, world/houseTies.ts memberNationOf)·
//   봉신 고르기(houseCity.ts)가 읽는다. 나라는 하나(D-569): 가문원의 시민권·내 도시는 이 도시와 그 나라로 맞춘다(houseTies.ts — 소속 도시를
//   바꾸면 가문원 모두의 나라가 바뀐다).
// - 창설할 때 고른다(found.ts — 안 고르면 창설자 사이보그의 내 도시). 가문장은 나중에 바꾼다(WebSocket house_home, 프로토콜 39 — D-570부터
//   공고: 설정 칸 house_home_notice_ms 뒤 가문 모두가 함께 옮기고 그 사이 원치 않는 가문원은 탈퇴한다, houseMoves.ts. 공고 중 지금 도시를 다시
//   고르면 거둔다. 들어가는 도시·나라의 가입비·지원금 정책을 가문이 한꺼번에 내고 받으며 못 내면 공고·옮기기를 막는다(D-573), houseEntry.ts):
//   대기 = 설정 칸 house_home_wait_ms([임시] 출발값 7일, D-569 1741 설정값), 도시를 가진 가문은 바꾸지 못한다(has_city — 소속 도시 = 그 가문
//   도시, D-569 1743. houseTies.ts가 맞춘다). 바꾸면 가문원에게 소식 home_changed, 감사 기록 faction.house_home.
// - 무소속(가문 없는 사람)의 소속 도시는 사이보그의 내 도시(cyborgs.start_city_id — 귀화하면 바뀌고, 가문에 있던 사람은 마지막 가문 소속
//   도시)다. 개인 세금은 이 도시 정부가 정한 세율로 낸다(D-569 1745 → D-128 — 걷는 자리는 아직 없다, 질문 1843).
// SQL만 둔다(도시·나라는 DB world_cities·factions — 쓰기 대기열이 밀리면 막 생긴 도시가 잠깐 안 보일 수 있다).
import type { HouseMemberResultCode } from "@terra/protocol";
import type { LocalizedName } from "@terra/shared/faction";
import { HOUSE_HOME_CHOICE_LIMIT, type HouseHomeCity } from "@terra/shared/house";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { type NationPreset, nationName } from "../npc/nations.ts";
import {
  type HouseMemberResult,
  type HouseTxPool,
  cyborgNameOf,
  inTransaction,
  lockHouse,
  membershipOf,
  notify,
} from "./members.ts";
import {
  type HouseEntryCharge,
  type HouseMovePersistence,
  chargeHouseEntry,
  entryShortfall,
  houseEntryTermsOf,
  moveHouseHome,
} from "./houseEntry.ts";
import type { HouseRules } from "./rules.ts";
import type { IdentityQueryable } from "./store.ts";

/** 봉신 관계를 따라 올라가는 깊이 상한(고리가 생겨도 멈춘다) */
const MAX_DEPTH = 8;

interface CityRaw {
  city_id: string;
  name: string | null;
  nation_id: string;
  nation_code: string | null;
  nation_label: string | null;
}

/**
 * 도시 → 그 도시가 속한 나라(최상위 세력). where = 도시 조건(c 별칭, 값은 $1부터). 해산한 세력은 건너뛰지 않는다(도시를 가진 세력은 사라지지
 * 않는다 — 고정 NPC 국가·도시 가진 가문)
 */
const CITY_NATION_SQL = (where: string): string => `with recursive up as (
    select c.id as city_id, c.name, f.id, f.parent_id, 0 as depth
      from world_cities c join factions f on f.id = c.faction_id where ${where}
    union all
    select up.city_id, up.name, p.id, p.parent_id, up.depth + 1 from up join factions p on p.id = up.parent_id
     where up.depth < ${MAX_DEPTH}
  )
  select up.city_id, up.name, up.id as nation_id, n.code as nation_code, pr.name as nation_label
    from up join factions n on n.id = up.id left join faction_profiles pr on pr.faction_id = up.id
   where up.parent_id is null`;

const homeOf = (raw: CityRaw, presets: readonly NationPreset[]): HouseHomeCity => {
  const code = raw.nation_code;
  const preset = code === null ? undefined : nationName(code, presets);
  const nation: LocalizedName | null =
    preset ?? (raw.nation_label === null ? null : { ko: raw.nation_label, en: raw.nation_label });
  return { id: Number(raw.city_id), name: raw.name, nationId: Number(raw.nation_id), nation };
};

/** 도시 하나와 그 나라. 없으면(폐허가 됐거나 모르는 ID) null */
export async function cityHome(
  q: IdentityQueryable,
  cityId: number,
  presets: readonly NationPreset[] = [],
): Promise<HouseHomeCity | null> {
  const { rows } = await q.query<CityRaw>(`${CITY_NATION_SQL("c.id = $1")} limit 1`, [cityId]);
  const row = rows[0];
  return row ? homeOf(row, presets) : null;
}

/** 고를 수 있는 소속 도시(나라·도시 ID 차례, 상한 HOUSE_HOME_CHOICE_LIMIT) */
export async function homeChoices(
  q: IdentityQueryable,
  presets: readonly NationPreset[] = [],
): Promise<HouseHomeCity[]> {
  const { rows } = await q.query<CityRaw>(
    `${CITY_NATION_SQL("true")} order by up.id, up.city_id limit ${HOUSE_HOME_CHOICE_LIMIT}`,
  );
  return rows.map((row) => homeOf(row, presets));
}

/** 가문 소속 도시 줄(없으면 null — 아직 도시·국가에 가입하지 않은 가문). cityId null = 첫 가입 공고 중. pending = 공고한 새 도시와 옮기는 시각(D-570) */
export async function houseHomeRow(
  q: IdentityQueryable,
  factionId: number,
): Promise<{
  cityId: number | null;
  setAtMs: number;
  pending: { readonly cityId: number; readonly atMs: number } | null;
} | null> {
  const { rows } = await q.query<{
    city_id: string | null;
    set_at_ms: string;
    pending_city_id: string | null;
    pending_at_ms: string | null;
  }>("select city_id, set_at_ms, pending_city_id, pending_at_ms from house_homes where faction_id = $1", [
    factionId,
  ]);
  const row = rows[0];
  if (!row) return null;
  return {
    cityId: row.city_id === null ? null : Number(row.city_id),
    setAtMs: Number(row.set_at_ms),
    pending:
      row.pending_city_id === null || row.pending_at_ms === null
        ? null
        : { cityId: Number(row.pending_city_id), atMs: Number(row.pending_at_ms) },
  };
}

/** 사이보그의 내 도시(무소속의 소속 도시·창설 기본값). 사이보그가 없으면 null */
export async function cyborgCityOf(q: IdentityQueryable, userId: string): Promise<number | null> {
  const { rows } = await q.query<{ start_city_id: string }>(
    "select start_city_id from cyborgs where user_id = $1",
    [userId],
  );
  const row = rows[0];
  return row ? Number(row.start_city_id) : null;
}

/** 가문이 도시를 가졌나(소유 주체가 있다 — 마을 세우기·폐허 고르기로 거울 세계에 든 가문) */
export async function houseHasCity(q: IdentityQueryable, factionId: number): Promise<boolean> {
  const { rows } = await q.query<{ found: boolean }>(
    "select exists(select 1 from world_owners where faction_id = $1) as found",
    [factionId],
  );
  return rows[0]?.found === true;
}

export interface HouseHomeOptions {
  readonly pool: HouseTxPool;
  readonly db?: Database | undefined;
  readonly rules: () => HouseRules;
  readonly now: () => number;
  readonly presets?: (() => readonly NationPreset[]) | undefined;
  /** 세계 저장 층(바로 옮길 때 가입비·지원금 원장, D-570). 없으면 값 없이 옮긴다 */
  readonly persistence?: (() => HouseMovePersistence | undefined) | undefined;
}

export interface HouseHomeService {
  /** 가문장이 소속 도시를 바꾼다: 공고(D-570 — 공고 기간 뒤 가문 모두가 옮긴다)·공고 거두기(지금 도시를 다시 고름)·바로 옮기기(공고 기간 0) */
  set(leaderId: string, cityId: number): Promise<HouseMemberResult>;
}

const fail = (code: HouseMemberResultCode): HouseMemberResult => ({ ok: false, code });

/** 가문장 말고 가문원 모두에게 소식 */
async function notifyOthers(
  q: IdentityQueryable,
  house: { readonly id: number; readonly name: string },
  leaderId: string,
  input: {
    kind: "home_announced" | "home_cancelled";
    other: string | null;
    reason: string | null;
    nowMs: number;
  },
): Promise<void> {
  const { rows } = await q.query<{ user_id: string }>(
    "select user_id from house_members where faction_id = $1 and user_id <> $2",
    [house.id, leaderId],
  );
  for (const row of rows)
    await notify(q, { userId: row.user_id, factionId: house.id, houseName: house.name, ...input });
}

export function createHouseHome(o: HouseHomeOptions): HouseHomeService {
  return {
    async set(leaderId, cityId) {
      const presets = o.presets?.() ?? [];
      // 트랜잭션 콜백 안에서 채운다(as — 바깥에서 null로 좁혀지지 않게)
      let audit = null as Record<string, unknown> | null;
      let charge = null as HouseEntryCharge | null;
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, leaderId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        const house = await lockHouse(q, mine.factionId);
        if (!house) return fail("not_found");
        if (await houseHasCity(q, house.id)) return fail("has_city");
        const city = await cityHome(q, cityId, presets);
        if (!city) return fail("unknown_city");
        const before = await houseHomeRow(q, house.id);
        const now = o.now();
        const leaderName = await cyborgNameOf(q, leaderId);
        const base = { factionId: house.id, beforeCity: before?.cityId ?? null, beforeNation: house.nation };
        if (before?.pending) {
          if (before.pending.cityId === city.id) return fail("same_city");
          // 공고 중에 지금 소속 도시를 다시 고르면 공고를 거둔다(D-570)
          if (before.cityId !== null && before.cityId === city.id) {
            await q.query(
              "update house_homes set pending_city_id = null, pending_at_ms = null where faction_id = $1",
              [house.id],
            );
            await notifyOthers(q, house, leaderId, {
              kind: "home_cancelled",
              other: leaderName,
              reason: null,
              nowMs: now,
            });
            audit = { ...base, cancelled: before.pending.cityId };
            return { ok: true, action: "home_cancelled", factionId: house.id };
          }
        } else if (before?.cityId !== null && before?.cityId === city.id) return fail("same_city");
        if (before && before.cityId !== null && before.setAtMs + o.rules().homeWaitMs > now)
          return fail("home_wait");
        const noticeMs = o.rules().homeNoticeMs;
        // 들어가는 도시·나라의 정책(도시 정책은 나라가 같아도 — houseEntry.ts). 가입비는 가문이 한꺼번에 내고 못 내면 옮기지 못한다(D-573) —
        // 공고할 때도 미리 본다(옮길 때 다시 본다)
        const entry = await houseEntryTermsOf(q, {
          cityId: city.id,
          nationId: city.nationId,
          nationChanged: house.nation !== city.nationId,
          npc: o.rules().npcEntry,
        });
        const counted = await q.query<{ n: number }>(
          "select count(*)::int as n from house_members where faction_id = $1",
          [house.id],
        );
        const memberCount = counted.rows[0]?.n ?? 0;
        const due: HouseEntryCharge = {
          houseId: house.id,
          leaderId,
          parts: entry.parts,
          members: memberCount,
          nowMs: now,
        };
        if (entryShortfall(o.persistence?.(), due) > 0n) return fail("entry_fee_short");
        // 1인 가문은 공고 없이 바로 가입·이동한다(ADR 2026-11-24-house-membership-separation.md). 2명 이상일 때만 공고 기간을 둔다
        if (memberCount > 1 && noticeMs > 0) {
          // 공고(D-570): 공고 기간 뒤 가문 모두가 옮긴다(houseMoves.ts). 첫 가입 공고면 city_id null 줄을 넣는다
          await q.query(
            `insert into house_homes (faction_id, city_id, set_at_ms, pending_city_id, pending_at_ms)
             values ($1, null, 0, $2, $3)
             on conflict (faction_id) do update set pending_city_id = excluded.pending_city_id, pending_at_ms = excluded.pending_at_ms`,
            [house.id, city.id, now + noticeMs],
          );
          await notifyOthers(q, house, leaderId, {
            kind: "home_announced",
            other: leaderName,
            reason: city.name ?? `#${city.id}`,
            nowMs: now,
          });
          audit = { ...base, announced: city.id, nation: city.nationId, at: now + noticeMs };
          return { ok: true, action: "home_announced", factionId: house.id };
        }
        // 바로 옮긴다(1인 가문, 또는 공고 기간 0)
        await moveHouseHome(q, { house, city, leaderName, skip: leaderId, nowMs: now });
        if (entry.parts.length > 0) charge = due;
        audit = { ...base, city: city.id, nation: city.nationId };
        return { ok: true, action: "home_set", factionId: house.id };
      });
      if (charge) {
        const charged = await chargeHouseEntry(o.persistence?.(), charge);
        if (audit) audit = { ...audit, paid: charged.paid.toString(), granted: charged.granted.toString() };
      }
      if (audit && o.db)
        await writeAudit(o.db, {
          actor: { kind: "user", id: leaderId, ip: null },
          action: "faction.house_home",
          targetId: leaderId,
          before: null,
          after: audit,
        });
      return result;
    },
  };
}
