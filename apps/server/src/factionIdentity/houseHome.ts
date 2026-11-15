// 가문 소속 도시(기획 D-565) — docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-15, D-565)".
// - 가문은 소속 도시를 고르고, 그 도시가 속한 나라(도시 주인 세력에서 봉신 관계를 따라 올라간 최상위 세력)의 가문이 자동으로 된다. 소속 도시는
//   세금 납부·랭킹 집계에 쓴다. 가문 나라는 factions.born_of에 함께 적는다 — 같은 나라 시야 공유(D-250, world/houseTies.ts memberNationOf)·
//   봉신 고르기(houseCity.ts)가 읽는다. 나라는 하나(D-569): 가문원의 시민권·내 도시는 이 도시와 그 나라로 맞춘다(houseTies.ts — 소속 도시를
//   바꾸면 가문원 모두의 나라가 바뀐다).
// - 창설할 때 고른다(found.ts — 안 고르면 창설자 사이보그의 내 도시). 가문장은 나중에 바꾼다(WebSocket house_home, 프로토콜 39):
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

/** 가문 소속 도시 줄(없으면 null — 이 표 전에 창설했고 가문장 사이보그가 없던 가문) */
export async function houseHomeRow(
  q: IdentityQueryable,
  factionId: number,
): Promise<{ cityId: number; setAtMs: number } | null> {
  const { rows } = await q.query<{ city_id: string; set_at_ms: string }>(
    "select city_id, set_at_ms from house_homes where faction_id = $1",
    [factionId],
  );
  const row = rows[0];
  return row ? { cityId: Number(row.city_id), setAtMs: Number(row.set_at_ms) } : null;
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
}

export interface HouseHomeService {
  /** 가문장이 소속 도시를 바꾼다(가문 나라도 그 도시의 나라로) */
  set(leaderId: string, cityId: number): Promise<HouseMemberResult>;
}

const fail = (code: HouseMemberResultCode): HouseMemberResult => ({ ok: false, code });

export function createHouseHome(o: HouseHomeOptions): HouseHomeService {
  return {
    async set(leaderId, cityId) {
      const presets = o.presets?.() ?? [];
      let audit: Record<string, unknown> | null = null;
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
        if (before?.cityId === city.id) return fail("same_city");
        const now = o.now();
        if (before && before.setAtMs + o.rules().homeWaitMs > now) return fail("home_wait");
        await q.query(
          `insert into house_homes (faction_id, city_id, set_at_ms) values ($1, $2, $3)
           on conflict (faction_id) do update set city_id = excluded.city_id, set_at_ms = excluded.set_at_ms`,
          [house.id, city.id, now],
        );
        await q.query("update factions set born_of = $2 where id = $1", [house.id, city.nationId]);
        const leaderName = await cyborgNameOf(q, leaderId);
        const { rows } = await q.query<{ user_id: string }>(
          "select user_id from house_members where faction_id = $1 and user_id <> $2",
          [house.id, leaderId],
        );
        for (const row of rows)
          await notify(q, {
            userId: row.user_id,
            factionId: house.id,
            kind: "home_changed",
            houseName: house.name,
            other: leaderName,
            reason: city.name,
            nowMs: now,
          });
        audit = {
          factionId: house.id,
          beforeCity: before?.cityId ?? null,
          beforeNation: house.nation,
          city: city.id,
          nation: city.nationId,
        };
        return { ok: true, action: "home_set", factionId: house.id };
      });
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
