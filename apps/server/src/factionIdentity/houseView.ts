// 가문 가입 조회(tRPC factionIdentity.house)와 가문 소식 확인 — 질문 985 다, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 981~986 답)".
// 기획 D-565: 소속 도시 칸(home — 가문이면 가문 소속 도시·대기·가문장의 후보, 무소속이면 내 도시), 가입할 수 있는 가문은 나라를 가리지 않는다.
// SQL만 둔다. 지난 초대·신청은 거른다(지우기는 명령이 한다 — members.ts). 그림 바이트는 읽지 않는다(해시만).
import {
  HOUSE_LIST_LIMIT,
  type HouseBadge,
  type HouseHomeView,
  type HouseLimits,
  type HouseMemberRow,
  type HouseNoticeRow,
  type HouseOfferRow,
  type HouseRequestRow,
  type HouseView,
} from "@terra/shared/house";
import {
  EMBLEM_CHARGES,
  EMBLEM_DIVISIONS,
  EMBLEM_SHAPES,
  type NationEmblemSpec,
  normalizeEmblem,
} from "@terra/shared/nationEmblem";
import type { NationPreset } from "../npc/nations.ts";
import { houseEntryTermsOf } from "./houseEntry.ts";
import { cityHome, cyborgCityOf, homeChoices, houseHasCity, houseHomeRow } from "./houseHome.ts";
import { membershipOf } from "./members.ts";
import type { HouseRules } from "./rules.ts";
import type { IdentityQueryable } from "./store.ts";

/** 가문 소식은 최근 이만큼만 보인다 */
export const HOUSE_NOTICE_LIMIT = 50;

interface BadgeRaw {
  id: string;
  name: string;
  short_name: string;
  color: string;
  emblem_shape: string | null;
  emblem_division: string | null;
  emblem_charge: string | null;
  emblem_scheme: number | null;
  emblem_sha256: string | null;
  members: number;
  leader_name: string | null;
}

const pick = <T extends string>(list: readonly T[], value: string | null): T | undefined =>
  list.find((entry) => entry === value);

function emblemOf(raw: BadgeRaw): NationEmblemSpec {
  const shape = pick(EMBLEM_SHAPES, raw.emblem_shape);
  const division = pick(EMBLEM_DIVISIONS, raw.emblem_division);
  const charge = pick(EMBLEM_CHARGES, raw.emblem_charge);
  return normalizeEmblem({
    ...(shape === undefined ? {} : { shape }),
    ...(division === undefined ? {} : { division }),
    ...(charge === undefined ? {} : { charge }),
    scheme: raw.emblem_scheme ?? 0,
  });
}

const badgeOf = (raw: BadgeRaw): HouseBadge => ({
  factionId: Number(raw.id),
  name: raw.name,
  shortName: raw.short_name,
  color: raw.color,
  emblem: emblemOf(raw),
  uploaded: raw.emblem_sha256,
  memberCount: raw.members,
  leaderName: raw.leader_name,
});

/** 가문 표지 조회(where = f에 대한 조건, 값은 $1부터) */
const BADGE_SQL = `select f.id, p.name, p.short_name, p.color, i.emblem_shape, i.emblem_division, i.emblem_charge,
    i.emblem_scheme, i.emblem_sha256,
    (select count(*)::int from house_members x where x.faction_id = f.id) as members,
    (select c.name from house_members l join cyborgs c on c.user_id = l.user_id
      where l.faction_id = f.id and l.role = 'leader') as leader_name
  from factions f join faction_profiles p on p.faction_id = f.id
  left join faction_identities i on i.faction_id = f.id
  where f.kind = 'player' and f.dissolved_at_ms is null`;

async function badges(q: IdentityQueryable, where: string, values: unknown[]): Promise<HouseBadge[]> {
  const { rows } = await q.query<BadgeRaw>(`${BADGE_SQL} and ${where}`, values);
  return rows.map(badgeOf);
}

export const limitsOf = (rules: HouseRules): HouseLimits => ({
  memberMax: rules.memberMax,
  pendingMax: rules.pendingMax,
  applyMax: rules.applyMax,
  requestTtlMs: rules.requestTtlMs,
});

async function noticesOf(q: IdentityQueryable, userId: string): Promise<HouseNoticeRow[]> {
  const { rows } = await q.query<{
    id: string;
    kind: string;
    house_name: string;
    other_name: string | null;
    reason: string | null;
    count: number;
    created_at_ms: string;
  }>(
    `select id, kind, house_name, other_name, reason, count, created_at_ms from house_notices
      where user_id = $1 order by created_at_ms desc, id desc limit ${HOUSE_NOTICE_LIMIT}`,
    [userId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    kind: row.kind,
    houseName: row.house_name,
    other: row.other_name,
    reason: row.reason,
    count: row.count,
    at: Number(row.created_at_ms),
  }));
}

/** 소속 도시 칸(D-565): 가문이면 가문 소속 도시, 무소속이면 내 도시 */
async function homeView(
  q: IdentityQueryable,
  input: { userId: string; rules: HouseRules; nowMs: number; presets: readonly NationPreset[] },
  house: { factionId: number; leader: boolean } | null,
): Promise<HouseHomeView> {
  const waitMs = input.rules.homeWaitMs;
  if (!house) {
    const cityId = await cyborgCityOf(q, input.userId);
    return {
      city: cityId === null ? null : await cityHome(q, cityId, input.presets),
      changeAt: null,
      waitMs,
      locked: false,
      choices: [],
      pending: null,
      noticeMs: input.rules.homeNoticeMs,
    };
  }
  const row = await houseHomeRow(q, house.factionId);
  const changeAt = row && house.leader ? row.setAtMs + waitMs : null;
  const city = row ? await cityHome(q, row.cityId, input.presets) : null;
  // 공고한 새 소속 도시(D-570)와 그 나라 정책(나라가 바뀔 때만 — 가문원마다 + 가입비 / − 지원금)
  const target = row?.pending ? await cityHome(q, row.pending.cityId, input.presets) : null;
  const terms =
    target && target.nationId !== city?.nationId ? await houseEntryTermsOf(q, target.nationId) : 0n;
  return {
    city,
    changeAt: changeAt !== null && changeAt > input.nowMs ? changeAt : null,
    waitMs,
    locked: await houseHasCity(q, house.factionId),
    choices: house.leader ? await homeChoices(q, input.presets) : [],
    pending: target && row?.pending ? { city: target, at: row.pending.atMs, terms: terms.toString() } : null,
    noticeMs: input.rules.homeNoticeMs,
  };
}

/** 내 가문·받은 초대·보낸 신청·가입할 수 있는 가문·소식·소속 도시 */
export async function readHouseView(
  q: IdentityQueryable,
  input: {
    userId: string;
    nationId: number | null;
    rules: HouseRules;
    nowMs: number;
    presets?: readonly NationPreset[] | undefined;
  },
): Promise<HouseView> {
  const notices = await noticesOf(q, input.userId);
  const limits = limitsOf(input.rules);
  const mine = await membershipOf(q, input.userId);
  const homeInput = { ...input, presets: input.presets ?? [] };
  if (mine) {
    const [badge] = await badges(q, "f.id = $1", [mine.factionId]);
    const nation = await q.query<{ born_of: string | null }>("select born_of from factions where id = $1", [
      mine.factionId,
    ]);
    const members = await q.query<{
      user_id: string;
      name: string | null;
      role: string;
      joined_at_ms: string;
    }>(
      `select m.user_id, c.name, m.role, m.joined_at_ms from house_members m left join cyborgs c on c.user_id = m.user_id
        where m.faction_id = $1 order by m.role = 'leader' desc, m.joined_at_ms, m.user_id`,
      [mine.factionId],
    );
    const requests =
      mine.role === "leader"
        ? await q.query<{
            id: string;
            kind: string;
            user_id: string;
            name: string | null;
            created_at_ms: string;
            expires_at_ms: string;
          }>(
            `select r.id, r.kind, r.user_id, c.name, r.created_at_ms, r.expires_at_ms from house_requests r
               left join cyborgs c on c.user_id = r.user_id
              where r.faction_id = $1 and r.expires_at_ms > $2 order by r.created_at_ms, r.id`,
            [mine.factionId, input.nowMs],
          )
        : { rows: [] };
    const bornOf = nation.rows[0]?.born_of;
    return {
      nationId: input.nationId,
      house: badge
        ? {
            ...badge,
            role: mine.role,
            nationId: bornOf === null || bornOf === undefined ? null : Number(bornOf),
            members: members.rows.map(
              (row): HouseMemberRow => ({
                userId: row.user_id,
                name: row.name,
                role: row.role === "leader" ? "leader" : "member",
                joinedAt: Number(row.joined_at_ms),
              }),
            ),
            requests: requests.rows.map(
              (row): HouseRequestRow => ({
                id: Number(row.id),
                kind: row.kind === "invite" ? "invite" : "apply",
                userId: row.user_id,
                name: row.name,
                createdAt: Number(row.created_at_ms),
                expiresAt: Number(row.expires_at_ms),
              }),
            ),
          }
        : null,
      offers: [],
      joinable: [],
      notices,
      limits,
      home: await homeView(q, homeInput, { factionId: mine.factionId, leader: mine.role === "leader" }),
    };
  }
  const offered = await q.query<{
    id: string;
    kind: string;
    faction_id: string;
    created_at_ms: string;
    expires_at_ms: string;
  }>(
    `select id, kind, faction_id, created_at_ms, expires_at_ms from house_requests
      where user_id = $1 and expires_at_ms > $2 order by created_at_ms, id`,
    [input.userId, input.nowMs],
  );
  const offerHouses = new Map(
    (await badges(q, "f.id = any($1::bigint[])", [offered.rows.map((row) => Number(row.faction_id))])).map(
      (badge) => [badge.factionId, badge],
    ),
  );
  const offers: HouseOfferRow[] = [];
  for (const row of offered.rows) {
    const house = offerHouses.get(Number(row.faction_id));
    if (!house) continue;
    offers.push({
      id: Number(row.id),
      kind: row.kind === "invite" ? "invite" : "apply",
      house,
      createdAt: Number(row.created_at_ms),
      expiresAt: Number(row.expires_at_ms),
    });
  }
  // 가입할 수 있는 가문: 나라를 가리지 않는다(D-565 — 가문은 시작 국가와 별개). 내 나라 가문을 앞에, 그다음 인원 많은 차례
  const joinable =
    input.nationId === null
      ? []
      : await badges(
          q,
          `true order by (f.born_of = $1) desc nulls last, members desc, f.id limit ${HOUSE_LIST_LIMIT}`,
          [input.nationId],
        );
  return {
    nationId: input.nationId,
    house: null,
    offers,
    joinable,
    notices,
    limits,
    home: await homeView(q, homeInput, null),
  };
}

/** 가문 소식을 확인했다(ids가 없으면 모두). 지운 수 */
export async function dismissHouseNotices(
  q: IdentityQueryable,
  userId: string,
  ids: readonly number[] | null,
): Promise<number> {
  const { rows } = await q.query<{ id: string }>(
    ids === null
      ? "delete from house_notices where user_id = $1 returning id"
      : "delete from house_notices where user_id = $1 and id = any($2::bigint[]) returning id",
    ids === null ? [userId] : [userId, [...ids]],
  );
  return rows.length;
}
