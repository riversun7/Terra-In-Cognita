// 가문 도시 가입(정부 방문 신청·시장/원수 승인·정책), 도시 탈퇴, 도시 추방 — ADR 2026-11-25-house-city-approval-and-blacklist.md.
// - 가문장이 해당 도시 행정 건물(government_hall)에 사이보그 본체가 서 있는 상태에서 가입 신청(house_city_apply).
// - 도시 정책(city_policies.join_approver): 'mayor'(플레이어 도시 기본) | 'leader'(국가 원수) | 'auto'(NPC 도시 기본).
// - 자동 승인일 때 최소 우호도(join_min_standing, 기본 -20) 이상이면 1인 가문은 즉시 가입, 2인 이상은 공고.
// - 승인 필요면 city_house_applications에 대기 → 승인권자가 수락(house_city_decide)하면 1인 즉시 / 2인 이상 공고.
// - 도시 탈퇴(house_city_leave): 소속 도시 해제 + 재가입 대기(set_at_ms = now) + 가문원 전원 옛 나라 우호도 하락.
// - 도시 추방(house_city_expel): 승인권자가 타 가문을 내보냄. 우호도 변화 없음.
import type { CityJoinApprover, HouseMemberResultCode } from "@terra/protocol";
import type {
  CityJoinApproverKind,
  GovernmentCityApplicationRow,
  GovernmentCityHouseRow,
  GovernmentCityMembership,
} from "@terra/shared/government";
import { RELATION_SCORE_MIN } from "@terra/shared/faction";
import { writeAudit } from "../auth/store.ts";
import type { CyborgService } from "../cyborg/service.ts";
import type { Database } from "../db/client.ts";
import type { NationPreset } from "../npc/nations.ts";
import {
  effectiveBountyMax,
  isCityOrNationRuler,
  listNationBlacklist,
  readCityBountyMax,
} from "./blacklist.ts";
import {
  type HouseEntryCharge,
  type HouseMovePersistence,
  chargeHouseEntry,
  entryShortfall,
  houseEntryTermsOf,
  moveHouseHome,
} from "./houseEntry.ts";
import { electedNationOf, ruledBy } from "./houseEntryPolicy.ts";
import { readGovernmentHouseCityTax } from "./houseCityTax.ts";
import { cityHome, houseHasCity, houseHomeRow } from "./houseHome.ts";
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

/** 기본 자동 승인 최소 우호도(−100~100) */
export const DEFAULT_CITY_JOIN_MIN_STANDING = -20;

/** 도시 가입 신청 유효 기간(7일) */
export const CITY_APPLICATION_TTL_MS = 7 * 86_400_000;

/** 도시 탈퇴 기본 우호도 하락(세계 사이보그 서비스가 없을 때 쓰는 값) */
const DEFAULT_LEAVE_STANDING_DROP = 20;

/** 정책 값과 도시 주인 종류 → 실효 승인 권한 */
export function effectiveJoinApprover(raw: string | null, isNpcCity: boolean): CityJoinApproverKind {
  if (raw === "mayor" || raw === "leader" || raw === "auto") return raw;
  return isNpcCity ? "auto" : "mayor";
}

/** 정책 값 → 실효 자동 승인 최소 우호도 */
export function effectiveMinStanding(raw: number | null): number {
  return raw === null ? DEFAULT_CITY_JOIN_MIN_STANDING : raw;
}

/** 가문이 그 도시의 승인 정책을 바꿀 수 있나(도시 주인 가문장 또는 그 나라 지도자) */
export async function canSetCityJoinPolicy(
  q: IdentityQueryable,
  houseId: number,
  cityId: number,
  nationId: number,
): Promise<boolean> {
  const ruled = await ruledBy(q, houseId);
  if (ruled.cities.has(cityId)) return true;
  if (ruled.nation && houseId === nationId) return true;
  const elected = await electedNationOf(q, houseId);
  return elected === nationId;
}

/** 가문이 그 도시의 가입 승인·추방을 처리할 수 있나 */
export async function canManageCityJoin(
  q: IdentityQueryable,
  houseId: number,
  cityId: number,
  nationId: number,
  approver: CityJoinApproverKind,
): Promise<boolean> {
  const ruled = await ruledBy(q, houseId);
  const isCityRuler = ruled.cities.has(cityId);
  const isNationRuler =
    (ruled.nation && houseId === nationId) || (await electedNationOf(q, houseId)) === nationId;
  if (approver === "leader") return isNationRuler;
  if (approver === "mayor") return isCityRuler || isNationRuler;
  return isCityRuler || isNationRuler;
}

/** 가문원 가운데 이 나라 블랙리스트에 오른 사람이 있나 */
async function hasBlacklistedMember(
  q: IdentityQueryable,
  houseId: number,
  nationId: number,
): Promise<boolean> {
  const { rows } = await q.query<{ found: boolean }>(
    `select exists(
       select 1 from house_members m
         join nation_blacklist b on b.user_id = m.user_id and b.nation_id = $2
        where m.faction_id = $1
     ) as found`,
    [houseId, nationId],
  );
  return rows[0]?.found === true;
}

/** 도시 주인 종류와 정책 읽기 */
async function readCityPolicyRow(
  q: IdentityQueryable,
  cityId: number,
): Promise<{
  readonly isNpcCity: boolean;
  readonly ownApprover: CityJoinApproverKind | null;
  readonly ownMinStanding: number | null;
}> {
  const [owner, policy] = await Promise.all([
    q.query<{ kind: string }>(
      "select f.kind from world_cities c join factions f on f.id = c.faction_id where c.id = $1",
      [cityId],
    ),
    q.query<{ join_approver: string | null; join_min_standing: number | null }>(
      "select join_approver, join_min_standing from city_policies where city_id = $1",
      [cityId],
    ),
  ]);
  const raw = policy.rows[0]?.join_approver ?? null;
  const ownApprover: CityJoinApproverKind | null =
    raw === "mayor" || raw === "leader" || raw === "auto" ? raw : null;
  return {
    isNpcCity: owner.rows[0]?.kind === "npc",
    ownApprover,
    ownMinStanding: policy.rows[0]?.join_min_standing ?? null,
  };
}

/** DB 우호도 읽기(세계 사이보그 서비스가 없을 때 뒷길) */
async function standingFromDb(q: IdentityQueryable, userId: string, nationId: number): Promise<number> {
  const { rows } = await q.query<{ score: number }>(
    "select score from user_nation_standings where user_id = $1 and faction_id = $2",
    [userId, nationId],
  );
  return rows[0]?.score ?? 0;
}

/** 행정 건물 방문 검증 결과 */
export type HallVisitCheck =
  | { readonly ok: true; readonly cityId: number }
  | { readonly ok: false; readonly code: "busy" | "not_government" | "no_cyborg" | "wrong_city" };

export interface HouseCityJoinOptions {
  readonly pool: HouseTxPool;
  readonly db?: Database | undefined;
  readonly rules: () => HouseRules;
  readonly now: () => number;
  readonly presets?: (() => readonly NationPreset[]) | undefined;
  /** 세계 저장 층(가입비·지원금 원장·우호도·쓰기 대기열) */
  readonly persistence?:
    | (() =>
        | (HouseMovePersistence & {
            readonly cyborgs?: Pick<CyborgService, "standingOf" | "dropStanding" | "naturalizationRules">;
          })
        | undefined)
    | undefined;
  /** 정부 건물 방문 검증(사이보그 본체가 그 행정 건물 도시에 서 있나) */
  readonly checkHallVisit: (userId: string, buildingId: number, nowMs: number) => HallVisitCheck;
}

export interface HouseCityJoinService {
  applyAtHall(leaderId: string, buildingId: number): Promise<HouseMemberResult>;
  decideApplication(actorId: string, applicationId: number, accept: boolean): Promise<HouseMemberResult>;
  setJoinPolicy(
    actorId: string,
    cityId: number,
    approver: CityJoinApprover | null,
    minStanding: number | null,
    /**
     * 블랙리스트 현상금 한 건의 도시 상한(최소 단위 10진 글자, null = 기본값 = 설정 칸, 없으면 바꾸지 않는다 — 설정 칸보다 큰 값은 설정
     * 칸으로 줄여 적는다, ADR 2026-11-25-blacklist-bounty-vote.md)
     */
    bountyMax?: string | null,
  ): Promise<HouseMemberResult>;
  leaveCity(leaderId: string): Promise<HouseMemberResult>;
  expelHouse(actorId: string, cityId: number, targetHouseId: number): Promise<HouseMemberResult>;
}

const fail = (code: HouseMemberResultCode): HouseMemberResult => ({ ok: false, code });

/** 가문원(skip 제외)에게 소식 */
async function notifyHouse(
  q: IdentityQueryable,
  house: { readonly id: number; readonly name: string },
  skip: string | null,
  input: {
    kind: "home_announced" | "city_apply_accepted" | "city_apply_declined" | "city_left" | "city_expelled";
    other: string | null;
    reason: string | null;
    nowMs: number;
  },
): Promise<string[]> {
  const { rows } = await q.query<{ user_id: string }>(
    "select user_id from house_members where faction_id = $1 order by user_id",
    [house.id],
  );
  for (const row of rows) {
    if (row.user_id === skip) continue;
    await notify(q, { userId: row.user_id, factionId: house.id, houseName: house.name, ...input });
  }
  return rows.map((row) => row.user_id);
}

export function createHouseCityJoin(o: HouseCityJoinOptions): HouseCityJoinService {
  const standingOf = async (q: IdentityQueryable, userId: string, nationId: number): Promise<number> => {
    const cyborgs = o.persistence?.()?.cyborgs;
    if (cyborgs) return cyborgs.standingOf(userId, nationId);
    return standingFromDb(q, userId, nationId);
  };

  return {
    async applyAtHall(leaderId, buildingId) {
      const now = o.now();
      const visit = o.checkHallVisit(leaderId, buildingId, now);
      if (!visit.ok) return fail(visit.code);
      const presets = o.presets?.() ?? [];
      let audit = null as Record<string, unknown> | null;
      let charge = null as HouseEntryCharge | null;
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, leaderId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        const house = await lockHouse(q, mine.factionId);
        if (!house) return fail("not_found");
        if (await houseHasCity(q, house.id)) return fail("has_city");
        const city = await cityHome(q, visit.cityId, presets);
        if (!city) return fail("unknown_city");
        const before = await houseHomeRow(q, house.id);
        if (before?.cityId === city.id || before?.pending?.cityId === city.id) return fail("same_city");
        if (before && before.setAtMs > 0 && before.setAtMs + o.rules().homeWaitMs > now)
          return fail("home_wait");
        if (await hasBlacklistedMember(q, house.id, city.nationId)) return fail("blacklisted");

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

        const policy = await readCityPolicyRow(q, city.id);
        const approver = effectiveJoinApprover(policy.ownApprover, policy.isNpcCity);
        const minStanding = effectiveMinStanding(policy.ownMinStanding);
        const leaderName = await cyborgNameOf(q, leaderId);

        if (approver === "auto") {
          const standing = await standingOf(q, leaderId, city.nationId);
          if (standing < minStanding) return fail("standing_too_low");
          await q.query("delete from city_house_applications where house_id = $1", [house.id]);
          const noticeMs = o.rules().homeNoticeMs;
          if (memberCount > 1 && noticeMs > 0) {
            await q.query(
              `insert into house_homes (faction_id, city_id, set_at_ms, pending_city_id, pending_at_ms)
               values ($1, null, 0, $2, $3)
               on conflict (faction_id) do update
                 set pending_city_id = excluded.pending_city_id, pending_at_ms = excluded.pending_at_ms`,
              [house.id, city.id, now + noticeMs],
            );
            await notifyHouse(q, house, leaderId, {
              kind: "home_announced",
              other: leaderName,
              reason: city.name ?? `#${city.id}`,
              nowMs: now,
            });
            audit = { factionId: house.id, cityId: city.id, mode: "auto_announced", at: now + noticeMs };
            return { ok: true, action: "home_announced", factionId: house.id };
          }
          await moveHouseHome(q, { house, city, leaderName, skip: leaderId, nowMs: now });
          if (entry.parts.length > 0) charge = due;
          audit = { factionId: house.id, cityId: city.id, nationId: city.nationId, mode: "auto_joined" };
          return { ok: true, action: "home_set", factionId: house.id };
        }

        // 승인 필요(mayor | leader): 대기 신청 등록
        await q.query(
          "delete from city_house_applications where city_id = $1 and house_id = $2 and expires_at_ms <= $3",
          [city.id, house.id, now],
        );
        const existing = await q.query<{ id: string }>(
          "select id from city_house_applications where city_id = $1 and house_id = $2",
          [city.id, house.id],
        );
        if (existing.rows.length > 0) return fail("already_applied");
        await q.query(
          `insert into city_house_applications (city_id, house_id, requested_by, created_at_ms, expires_at_ms)
           values ($1, $2, $3, $4, $5)`,
          [city.id, house.id, leaderId, now, now + CITY_APPLICATION_TTL_MS],
        );
        audit = { factionId: house.id, cityId: city.id, nationId: city.nationId, mode: "applied" };
        return { ok: true, action: "city_applied", factionId: house.id };
      });
      if (charge) {
        const charged = await chargeHouseEntry(o.persistence?.(), charge);
        if (audit) audit = { ...audit, paid: charged.paid.toString(), granted: charged.granted.toString() };
      }
      if (audit && o.db) {
        await writeAudit(o.db, {
          actor: { kind: "user", id: leaderId, ip: null },
          action: "faction.house_city_apply",
          targetId: leaderId,
          before: null,
          after: audit,
        });
      }
      return result;
    },

    async decideApplication(actorId, applicationId, accept) {
      const now = o.now();
      const presets = o.presets?.() ?? [];
      let audit = null as Record<string, unknown> | null;
      let charge = null as HouseEntryCharge | null;
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, actorId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        const appRows = await q.query<{
          id: string;
          city_id: string;
          house_id: string;
          requested_by: string;
          expires_at_ms: string;
        }>(
          "select id, city_id, house_id, requested_by, expires_at_ms from city_house_applications where id = $1 for update",
          [applicationId],
        );
        const app = appRows.rows[0];
        if (!app) return fail("not_found");
        if (Number(app.expires_at_ms) <= now) {
          await q.query("delete from city_house_applications where id = $1", [applicationId]);
          return fail("not_found");
        }
        const cityId = Number(app.city_id);
        const targetHouseId = Number(app.house_id);
        const city = await cityHome(q, cityId, presets);
        if (!city) return fail("unknown_city");
        const policy = await readCityPolicyRow(q, city.id);
        const approver = effectiveJoinApprover(policy.ownApprover, policy.isNpcCity);
        if (!(await canManageCityJoin(q, mine.factionId, city.id, city.nationId, approver)))
          return fail("not_ruler");
        const targetHouse = await lockHouse(q, targetHouseId);
        if (!targetHouse) {
          await q.query("delete from city_house_applications where id = $1", [applicationId]);
          return fail("not_found");
        }
        const actorName = await cyborgNameOf(q, actorId);
        if (!accept) {
          await q.query("delete from city_house_applications where id = $1", [applicationId]);
          await notifyHouse(q, targetHouse, null, {
            kind: "city_apply_declined",
            other: actorName,
            reason: city.name ?? `#${city.id}`,
            nowMs: now,
          });
          audit = { applicationId, cityId: city.id, targetHouseId: targetHouse.id, accept: false };
          return { ok: true, action: "city_apply_declined", factionId: targetHouse.id };
        }
        if (await houseHasCity(q, targetHouse.id)) return fail("has_city");
        if (await hasBlacklistedMember(q, targetHouse.id, city.nationId)) return fail("blacklisted");

        const entry = await houseEntryTermsOf(q, {
          cityId: city.id,
          nationId: city.nationId,
          nationChanged: targetHouse.nation !== city.nationId,
          npc: o.rules().npcEntry,
        });
        const counted = await q.query<{ n: number }>(
          "select count(*)::int as n from house_members where faction_id = $1",
          [targetHouse.id],
        );
        const memberCount = counted.rows[0]?.n ?? 0;
        const leaderRow = await q.query<{ user_id: string }>(
          "select user_id from house_members where faction_id = $1 and role = 'leader' limit 1",
          [targetHouse.id],
        );
        const targetLeaderId = leaderRow.rows[0]?.user_id ?? app.requested_by;
        const due: HouseEntryCharge = {
          houseId: targetHouse.id,
          leaderId: targetLeaderId,
          parts: entry.parts,
          members: memberCount,
          nowMs: now,
        };
        if (entryShortfall(o.persistence?.(), due) > 0n) return fail("entry_fee_short");

        await q.query("delete from city_house_applications where house_id = $1", [targetHouse.id]);
        const noticeMs = o.rules().homeNoticeMs;
        if (memberCount > 1 && noticeMs > 0) {
          await q.query(
            `insert into house_homes (faction_id, city_id, set_at_ms, pending_city_id, pending_at_ms)
             values ($1, null, 0, $2, $3)
             on conflict (faction_id) do update
               set pending_city_id = excluded.pending_city_id, pending_at_ms = excluded.pending_at_ms`,
            [targetHouse.id, city.id, now + noticeMs],
          );
          await notifyHouse(q, targetHouse, null, {
            kind: "city_apply_accepted",
            other: actorName,
            reason: city.name ?? `#${city.id}`,
            nowMs: now,
          });
          audit = {
            applicationId,
            cityId: city.id,
            targetHouseId: targetHouse.id,
            accept: true,
            announcedAt: now + noticeMs,
          };
          return { ok: true, action: "city_apply_accepted", factionId: targetHouse.id };
        }
        await moveHouseHome(q, {
          house: targetHouse,
          city,
          leaderName: actorName,
          skip: targetLeaderId,
          nowMs: now,
        });
        await notify(q, {
          userId: targetLeaderId,
          factionId: targetHouse.id,
          kind: "city_apply_accepted",
          houseName: targetHouse.name,
          other: actorName,
          reason: city.name ?? `#${city.id}`,
          nowMs: now,
        });
        if (entry.parts.length > 0) charge = due;
        audit = {
          applicationId,
          cityId: city.id,
          targetHouseId: targetHouse.id,
          nationId: city.nationId,
          accept: true,
        };
        return { ok: true, action: "city_apply_accepted", factionId: targetHouse.id };
      });
      if (charge) {
        const charged = await chargeHouseEntry(o.persistence?.(), charge);
        if (audit) audit = { ...audit, paid: charged.paid.toString(), granted: charged.granted.toString() };
      }
      if (audit && o.db) {
        await writeAudit(o.db, {
          actor: { kind: "user", id: actorId, ip: null },
          action: "faction.house_city_decide",
          targetId: actorId,
          before: null,
          after: audit,
        });
      }
      return result;
    },

    async setJoinPolicy(actorId, cityId, approver, minStanding, bountyMax) {
      let audit = null as Record<string, unknown> | null;
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, actorId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        const city = await cityHome(q, cityId);
        if (!city) return fail("unknown_city");
        if (!(await canSetCityJoinPolicy(q, mine.factionId, city.id, city.nationId)))
          return fail("not_ruler");
        const now = o.now();
        await q.query(
          `insert into city_policies (city_id, join_approver, join_min_standing, set_at_ms, set_by)
           values ($1, $2, $3, $4, $5)
           on conflict (city_id) do update
             set join_approver = excluded.join_approver,
                 join_min_standing = excluded.join_min_standing,
                 set_at_ms = excluded.set_at_ms,
                 set_by = excluded.set_by`,
          [city.id, approver, minStanding, now, actorId],
        );
        // 현상금 도시 상한(칸을 보냈을 때만): 설정 칸 상한보다 클 수 없다
        let bounty: string | null | undefined;
        if (bountyMax !== undefined) {
          const cap = o.rules().blacklistBountyMax;
          const asked = bountyMax === null ? null : BigInt(bountyMax);
          bounty = asked === null ? null : (asked > cap ? cap : asked).toString();
          await q.query("update city_policies set bounty_max = $2 where city_id = $1", [city.id, bounty]);
        }
        audit = {
          factionId: mine.factionId,
          cityId: city.id,
          approver,
          minStanding,
          ...(bounty === undefined ? {} : { bountyMax: bounty }),
        };
        return { ok: true, action: "join_policy_set", factionId: mine.factionId };
      });
      if (audit && o.db) {
        await writeAudit(o.db, {
          actor: { kind: "user", id: actorId, ip: null },
          action: "faction.house_join_policy",
          targetId: actorId,
          before: null,
          after: audit,
        });
      }
      return result;
    },

    async leaveCity(leaderId) {
      const now = o.now();
      const presets = o.presets?.() ?? [];
      let audit = null as Record<string, unknown> | null;
      let dropped = null as { readonly memberIds: readonly string[]; readonly oldNation: number } | null;
      const p = o.persistence?.();
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, leaderId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        const house = await lockHouse(q, mine.factionId);
        if (!house) return fail("not_found");
        if (await houseHasCity(q, house.id)) return fail("has_city");
        const before = await houseHomeRow(q, house.id);
        if (!before || before.cityId === null) return fail("no_home_city");
        const oldCity = await cityHome(q, before.cityId, presets);
        const oldNation = house.nation ?? oldCity?.nationId ?? null;
        const leaderName = await cyborgNameOf(q, leaderId);

        // 소속 도시 비움 + set_at_ms = now로 재가입 대기 기간 시작
        await q.query(
          `update house_homes
              set city_id = null, set_at_ms = $2, pending_city_id = null, pending_at_ms = null
            where faction_id = $1`,
          [house.id, now],
        );
        await q.query("update factions set born_of = null where id = $1", [house.id]);
        await q.query("delete from city_house_applications where house_id = $1", [house.id]);

        const memberIds = await notifyHouse(q, house, leaderId, {
          kind: "city_left",
          other: leaderName,
          reason: oldCity?.name ?? null,
          nowMs: now,
        });

        // 가문원 국적 해제(세계가 준비됐으면 houseTies.reload()가 메모리·DB를 맞춘다; DB 단독 시험을 위해 여기서도 반영)
        if (memberIds.length > 0) {
          await q.query("delete from faction_members where user_id = any($1::uuid[])", [memberIds]);
          await q.query("update cyborgs set faction_id = null where user_id = any($1::uuid[])", [memberIds]);
          // 세계 사이보그 서비스가 없을 때만 DB에 우호도 하락을 직접 적는다(있으면 커밋 뒤 dropStanding으로 메모리·DB 동시 반영)
          if (oldNation !== null && !p?.cyborgs) {
            for (const userId of memberIds) {
              await q.query(
                `insert into user_nation_standings (user_id, faction_id, score, updated_at_ms)
                 values ($1, $2, greatest($3::int, -$4::int), $5)
                 on conflict (user_id, faction_id) do update
                   set score = greatest($3::int, user_nation_standings.score - $4::int),
                       updated_at_ms = excluded.updated_at_ms`,
                [userId, oldNation, RELATION_SCORE_MIN, DEFAULT_LEAVE_STANDING_DROP, now],
              );
            }
          } else if (oldNation !== null) {
            dropped = { memberIds, oldNation };
          }
        }
        audit = { factionId: house.id, oldCityId: before.cityId, oldNation };
        return { ok: true, action: "city_left", factionId: house.id };
      });

      if (result.ok && dropped !== null && p?.cyborgs) {
        const { memberIds, oldNation } = dropped;
        const drop = p.cyborgs.naturalizationRules(oldNation).standingDrop || DEFAULT_LEAVE_STANDING_DROP;
        for (const userId of memberIds) p.cyborgs.dropStanding(userId, oldNation, drop, now);
        await p.writer.durable();
      }
      if (audit && o.db) {
        await writeAudit(o.db, {
          actor: { kind: "user", id: leaderId, ip: null },
          action: "faction.house_city_leave",
          targetId: leaderId,
          before: null,
          after: audit,
        });
      }
      return result;
    },

    async expelHouse(actorId, cityId, targetHouseId) {
      const now = o.now();
      const presets = o.presets?.() ?? [];
      let audit = null as Record<string, unknown> | null;
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, actorId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        if (mine.factionId === targetHouseId) return fail("self");
        const city = await cityHome(q, cityId, presets);
        if (!city) return fail("unknown_city");
        const policy = await readCityPolicyRow(q, city.id);
        const approver = effectiveJoinApprover(policy.ownApprover, policy.isNpcCity);
        if (!(await canManageCityJoin(q, mine.factionId, city.id, city.nationId, approver)))
          return fail("not_ruler");
        const targetHouse = await lockHouse(q, targetHouseId);
        if (!targetHouse) return fail("not_found");
        if (await houseHasCity(q, targetHouse.id)) return fail("has_city");
        const home = await houseHomeRow(q, targetHouse.id);
        if (!home || home.cityId !== city.id) return fail("not_found");
        const actorName = await cyborgNameOf(q, actorId);

        // 추방: 우호도 변화 없음, 재가입 대기 초기화(다른 도시에 가입할 수 있게 set_at_ms = 0)
        await q.query(
          `update house_homes
              set city_id = null, set_at_ms = 0, pending_city_id = null, pending_at_ms = null
            where faction_id = $1`,
          [targetHouse.id],
        );
        await q.query("update factions set born_of = null where id = $1", [targetHouse.id]);
        await q.query("delete from city_house_applications where house_id = $1 and city_id = $2", [
          targetHouse.id,
          city.id,
        ]);

        const memberIds = await notifyHouse(q, targetHouse, null, {
          kind: "city_expelled",
          other: actorName,
          reason: city.name,
          nowMs: now,
        });
        if (memberIds.length > 0) {
          await q.query("delete from faction_members where user_id = any($1::uuid[])", [memberIds]);
          await q.query("update cyborgs set faction_id = null where user_id = any($1::uuid[])", [memberIds]);
        }
        audit = {
          actorHouseId: mine.factionId,
          cityId: city.id,
          targetHouseId: targetHouse.id,
          nationId: city.nationId,
        };
        return { ok: true, action: "city_expelled", factionId: targetHouse.id };
      });
      if (audit && o.db) {
        await writeAudit(o.db, {
          actor: { kind: "user", id: actorId, ip: null },
          action: "faction.house_city_expel",
          targetId: actorId,
          before: null,
          after: audit,
        });
      }
      return result;
    },
  };
}

/** 정부 판의 가문 도시 가입·추방·블랙리스트 조회(tRPC world.government) */
export async function readCityMembership(
  q: IdentityQueryable,
  input: {
    readonly cityId: number;
    readonly viewerId: string;
    readonly nowMs: number;
    readonly rules: HouseRules;
    /** 보는 사람의 사이보그 본체가 지금 이 도시에 서 있나 */
    readonly viewerInCity: boolean;
    /** 보는 사람의 이 나라 우호도 */
    readonly viewerStanding?: ((nationId: number) => number) | undefined;
    /** 이 도시·나라와 전쟁 중인 도시에 거주하는 가문 보유 유닛 수 */
    readonly hostileUnitsFor?:
      | ((memberUserIds: readonly string[], targetNationId: number) => number)
      | undefined;
  },
): Promise<GovernmentCityMembership | null> {
  const city = await cityHome(q, input.cityId);
  if (!city) return null;
  const [policy, mine, blacklist, ownBountyMax] = await Promise.all([
    readCityPolicyRow(q, city.id),
    membershipOf(q, input.viewerId),
    listNationBlacklist(q, city.nationId),
    readCityBountyMax(q, city.id),
  ]);
  const approver = effectiveJoinApprover(policy.ownApprover, policy.isNpcCity);
  const minStanding = effectiveMinStanding(policy.ownMinStanding);
  const canSetPolicy =
    mine?.role === "leader" ? await canSetCityJoinPolicy(q, mine.factionId, city.id, city.nationId) : false;
  const canManage =
    mine?.role === "leader"
      ? await canManageCityJoin(q, mine.factionId, city.id, city.nationId, approver)
      : false;

  // 신청 가능 여부와 차단 사유, 적대 거주 유닛 수
  let applyBlock: string | null = null;
  let hostileResidentUnits = 0;
  if (!mine) {
    applyBlock = "no_house";
  } else if (mine.role !== "leader") {
    applyBlock = "not_leader";
  } else {
    const [hasCity, home, blacklisted, existingApp, members] = await Promise.all([
      houseHasCity(q, mine.factionId),
      houseHomeRow(q, mine.factionId),
      hasBlacklistedMember(q, mine.factionId, city.nationId),
      q.query<{ id: string }>(
        "select id from city_house_applications where city_id = $1 and house_id = $2 and expires_at_ms > $3",
        [city.id, mine.factionId, input.nowMs],
      ),
      q.query<{ user_id: string }>("select user_id from house_members where faction_id = $1", [
        mine.factionId,
      ]),
    ]);
    if (input.hostileUnitsFor) {
      hostileResidentUnits = input.hostileUnitsFor(
        members.rows.map((r) => r.user_id),
        city.nationId,
      );
    }
    if (hasCity) applyBlock = "has_city";
    else if (home?.cityId === city.id || home?.pending?.cityId === city.id) applyBlock = "same_city";
    else if (!input.viewerInCity) applyBlock = "wrong_city";
    else if (home && home.setAtMs > 0 && home.setAtMs + input.rules.homeWaitMs > input.nowMs)
      applyBlock = "home_wait";
    else if (blacklisted) applyBlock = "blacklisted";
    else if (existingApp.rows.length > 0) applyBlock = "already_applied";
    else if (approver === "auto") {
      const standing =
        input.viewerStanding !== undefined
          ? input.viewerStanding(city.nationId)
          : await standingFromDb(q, input.viewerId, city.nationId);
      if (standing < minStanding) applyBlock = "standing_too_low";
    }
  }

  let applications: GovernmentCityApplicationRow[] = [];
  let houses: GovernmentCityHouseRow[] = [];
  if (canManage) {
    const [appRows, houseRows] = await Promise.all([
      q.query<{
        id: string;
        house_id: string;
        house_name: string;
        leader_name: string | null;
        member_count: number;
        created_at_ms: string;
        expires_at_ms: string;
      }>(
        `select a.id, a.house_id, p.name as house_name,
                (select c.name from house_members l join cyborgs c on c.user_id = l.user_id
                  where l.faction_id = a.house_id and l.role = 'leader' limit 1) as leader_name,
                (select count(*)::int from house_members m where m.faction_id = a.house_id) as member_count,
                a.created_at_ms, a.expires_at_ms
           from city_house_applications a
           join factions f on f.id = a.house_id and f.dissolved_at_ms is null
           join faction_profiles p on p.faction_id = a.house_id
          where a.city_id = $1 and a.expires_at_ms > $2
          order by a.created_at_ms, a.id
          limit 50`,
        [city.id, input.nowMs],
      ),
      q.query<{
        house_id: string;
        house_name: string;
        leader_name: string | null;
        member_count: number;
        tax_debt: string | null;
      }>(
        `select h.faction_id as house_id, p.name as house_name,
                (select c.name from house_members l join cyborgs c on c.user_id = l.user_id
                  where l.faction_id = h.faction_id and l.role = 'leader' limit 1) as leader_name,
                (select count(*)::int from house_members m where m.faction_id = h.faction_id) as member_count,
                s.debt::text as tax_debt
           from house_homes h
           join factions f on f.id = h.faction_id and f.kind = 'player' and f.dissolved_at_ms is null
           join faction_profiles p on p.faction_id = h.faction_id
           left join house_city_tax_state s on s.faction_id = h.faction_id and s.city_id = h.city_id
          where h.city_id = $1
          order by member_count desc, h.faction_id
          limit 100`,
        [city.id],
      ),
    ]);
    applications = appRows.rows.map((row) => ({
      id: Number(row.id),
      houseId: Number(row.house_id),
      houseName: row.house_name,
      leaderName: row.leader_name,
      memberCount: row.member_count,
      createdAtMs: Number(row.created_at_ms),
      expiresAtMs: Number(row.expires_at_ms),
    }));
    houses = houseRows.rows.map((row) => ({
      houseId: Number(row.house_id),
      houseName: row.house_name,
      leaderName: row.leader_name,
      memberCount: row.member_count,
      own: mine?.factionId === Number(row.house_id),
      ...(row.tax_debt && row.tax_debt !== "0" ? { taxDebt: row.tax_debt } : {}),
    }));
  }

  const houseCityTax = await readGovernmentHouseCityTax(q, {
    cityId: city.id,
    nationId: city.nationId,
    viewerHouseId: mine?.factionId ?? null,
    viewerIsLeader: mine?.role === "leader",
  });

  return {
    approver,
    ownApprover: policy.ownApprover,
    minStanding,
    ownMinStanding: policy.ownMinStanding,
    canManage,
    canSetPolicy,
    bounty: {
      max: effectiveBountyMax(input.rules.blacklistBountyMax, ownBountyMax).toString(),
      ownMax: ownBountyMax === null ? null : ownBountyMax.toString(),
      cap: input.rules.blacklistBountyMax.toString(),
      canPost: mine?.role === "leader" && (await ruledBy(q, mine.factionId)).cities.has(city.id),
      canPropose:
        mine?.role === "leader" && (await isCityOrNationRuler(q, mine.factionId, city.id, city.nationId)),
    },
    canApply: applyBlock === null,
    applyBlock,
    hostileResidentUnits,
    applications,
    houses,
    blacklist,
    houseCityTax,
  };
}
