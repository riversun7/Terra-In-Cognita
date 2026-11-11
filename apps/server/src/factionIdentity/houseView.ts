// 가문 가입 조회(tRPC factionIdentity.house)와 가문 소식 확인 — 질문 985 다, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 981~986 답)".
// SQL만 둔다. 지난 초대·신청은 거른다(지우기는 명령이 한다 — members.ts). 그림 바이트는 읽지 않는다(해시만).
import {
  HOUSE_LIST_LIMIT,
  type HouseBadge,
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

/** 내 가문·받은 초대·보낸 신청·가입할 수 있는 가문·소식 */
export async function readHouseView(
  q: IdentityQueryable,
  input: { userId: string; nationId: number | null; rules: HouseRules; nowMs: number },
): Promise<HouseView> {
  const notices = await noticesOf(q, input.userId);
  const limits = limitsOf(input.rules);
  const mine = await membershipOf(q, input.userId);
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
  const joinable =
    input.nationId === null
      ? []
      : await badges(q, `f.born_of = $1 order by members desc, f.id limit ${HOUSE_LIST_LIMIT}`, [
          input.nationId,
        ]);
  return { nationId: input.nationId, house: null, offers, joinable, notices, limits };
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
