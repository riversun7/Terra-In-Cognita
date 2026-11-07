// 신전·종교 서비스(서버) — 기획 D-517(사용자 원문 "수명이다하면 비활성 상태가 되어 환생(종교시설)이나 유전자 조각(생명과학연구소)으로 변환")·
// D-021·D-311(신관이 신전에서 환생·신격화 집전, 신격화 = 그 도시 수호신·도시당 상한 S15, 유전자는 D-517로 빠짐)·D-441(비용 = 신앙도·화폐)·
// D-444 165·D-451(신앙도 = 문턱, 환생하면 0), docs/adr/2026-11-07-temple-religion.md. 규칙은 @terra/sim society/temple.ts 한 벌이다.
// - 비활성: 유저 휴먼(유닛 종류 4)의 수명 끝 ≤ 지금. 고르지 않으면 그대로 남는다(상한 설정 칸 출발값 없음). 1분마다(sweep, 융합 서비스의
//   수명 타이머) 메모리 표를 다시 만들고, 새 비활성은 그 주체를 수명 끝까지 정산한 뒤 표에 넣는다 → 노동 계약 서비스가 계약을 "유닛 사라짐"으로
//   끝낸다(unitAway 고리, 옛 LifeEngine _processWraith "활성 계약 종료"). 비활성은 새 계약·구인·건물 작업 일꾼이 unit_busy다.
// - 신전 = 신앙 단계 시설(places.ts). 누구의 신전이든 쓴다(D-311 유저·NPC 시설 모두). 요금은 남의 신전 = 주인 수입, 내 신전 = 소각 [임시].
//   신관 직무가 서버에 없어 신전 시설이 집전한다(질문 453).
// - 의식: 내 휴먼·비활성·그 유닛이 선 칸의 도시 = 신전이 선 도시·신앙도 문턱·화폐·(신격화) 도시당 상한. 환생 = 레벨 1·태어난 시각 = 지금·수명
//   다시(T4)·환생 +1·신앙도 0. 신격화(기획 답 456 가) = 수호신 줄(버프 출발값 방어) + 같은 유닛이 수호신 유닛(종류 6)이 되어 그 자리에 멈춰
//   그 도시에 남는다(휴먼 행은 지우고 지닌 것·배운 스킬·신앙은 그대로 — 융합과 같은 꼴). 수호신은 일하지 않고(isAway), 주인이 옮기지 못하며,
//   그 도시가 공격받는 전투에 수비로 든다(cityDefense.ts). 유전자는 들지 않는다(D-517). 유전자로 바꾸는 길(생명과학 연구소)은 유전자 명령
//   convert(fusion/geneCommands.ts)다.
// - 수호신 버프(456 가: 종류는 수호신마다 편집기 칸): 개발 편집 devGuardianBuff(dev·admin, 누구의 수호신이든).
// - 기도·헌금(옛 religion_routes.js): 내 사이보그와 내 휴먼 모두(비활성 포함)의 신앙도·포인트를 함께 올린다. 종교 목록이 아직 없어 종교 없이
//   쌓인다 [임시](질문 457).
// 명령 하나 = 읽기(DB, 쓰기 대기열이 따라잡은 뒤) → 다시 확인(메모리) → 한 번의 동기 처리 → 커밋 뒤 답(U2).
import type { TempleResultCode } from "@terra/protocol";
import { createRng } from "@terra/shared";
import type { TempleOverviewResponse } from "@terra/shared/temple";
import {
  CELL_UNITS,
  DEFAULT_GUARDIAN_BUFF,
  type GuardianBuff,
  type SocietyCoefficients,
  type TempleRite,
  addDevotion,
  devotionGain,
  inactiveWindow,
  positionAt,
  rebirthHuman,
  riteBlockers,
  riteCost,
} from "@terra/sim";
import type { CyborgService } from "../cyborg/service.ts";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldFacilities } from "../facilities/world.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { ASSET_CREDIT, type Settlement } from "../world/settlement.ts";
import { UNIT_KIND_GUARDIAN, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { buildTempleOverview } from "./overview.ts";
import { RELIGION_STAGE, payServiceFee, serviceFacility, unitCity } from "./places.ts";
import {
  readFaith,
  readFullHuman,
  readGuardianCounts,
  readGuardians,
  readLastPrayer,
  writeFaith,
  writeGuardian,
  writeHuman,
} from "./rows.ts";

export type TempleCommandResult =
  | { readonly ok: true; readonly unitId?: number; readonly faith?: number; readonly gained?: number }
  | { readonly ok: false; readonly code: TempleResultCode };

export interface TempleServiceOptions {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly settlement: Settlement;
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  readonly pool: QueryPool;
  /** 건물(신전·연구소 시설 줄·일함·도시 자리). 없으면 신전이 없다 */
  readonly facilities?: WorldFacilities | undefined;
  /** 사이보그(본체 신앙도). 없으면 사이보그 신앙은 오르지 않는다 */
  readonly cyborgs?: CyborgService | undefined;
  readonly hasCyborg: (userId: string) => boolean;
  /** 설정 칸 실효 값(부를 때마다 읽는다: temple·fusion·수명 T4) */
  readonly rules: () => SocietyCoefficients;
  readonly now: () => number;
  readonly seed: () => number;
  readonly ready: () => boolean;
}

export interface TempleService {
  overview(viewer: { id: string; devGrant: boolean }, nowMs: number): Promise<TempleOverviewResponse>;
  pray(userId: string, input: { readonly buildingId: number }): Promise<TempleCommandResult>;
  offer(
    userId: string,
    input: { readonly buildingId: number; readonly amount: string },
  ): Promise<TempleCommandResult>;
  rite(
    userId: string,
    input: {
      readonly buildingId: number;
      readonly unit: number;
      readonly rite: TempleRite;
      readonly cost: string;
    },
  ): Promise<TempleCommandResult>;
  devInactivate(userId: string, input: { readonly unit: number }): Promise<TempleCommandResult>;
  /** 개발 편집: 수호신 하나의 도시 버프 종류를 바꾼다(기획 답 456 가 — 수호신마다 편집기 칸, 권한은 게이트웨이가 본다) */
  devGuardianBuff(input: {
    readonly unit: number;
    readonly buff: GuardianBuff;
  }): Promise<TempleCommandResult>;
  /** 비활성인가(메모리 표, 1분마다 다시 만든다) — 전투(도시 방어)가 뺀다 */
  isInactive(unitId: number): boolean;
  /** 일하지 않는 유닛인가(비활성 또는 수호신) — 노동 계약·건물 작업·건물 공격이 묻는다 */
  isAway(unitId: number): boolean;
  /** 비활성 표를 다시 만들고 새 비활성의 주체를 정산한다(계약 끝). 새로 비활성이 된 유닛 수 */
  sweep(nowMs: number): Promise<number>;
}

const fail = (code: TempleResultCode): TempleCommandResult => ({ ok: false, code });

export function createTempleService(o: TempleServiceOptions): TempleService {
  const { ledger, writer, settlement } = o;
  /** 비활성 유닛 → 소유 주체 */
  const inactive = new Map<number, number>();
  let sweeping = false;

  const unitOf = (unitId: number) => {
    for (const map of o.maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return { map, info };
    }
    return undefined;
  };

  const ownerFor = (userId: string): { ownerId: number } | { fail: TempleResultCode } => {
    if (!o.ready()) return { fail: "busy" };
    if (!o.hasCyborg(userId)) return { fail: "no_cyborg" };
    const ownerId = settlement.findOwnerOfUser(userId);
    return ownerId === undefined ? { fail: "no_cyborg" } : { ownerId };
  };

  /** 신전 확인: 신앙 단계 시설 → 다 지었고 30% 이상 */
  const templeOf = (
    buildingId: number,
  ):
    | { readonly ok: true; readonly cityId: number | null; readonly ownerId: number | null }
    | { readonly ok: false; readonly code: TempleResultCode } => {
    const found = serviceFacility(o.facilities, buildingId, RELIGION_STAGE);
    if (found.ok) return found;
    return { ok: false, code: found.reason === "closed" ? "temple_closed" : "not_temple" };
  };

  /** 내 휴먼(종류 4, 포로 아님) */
  const myHuman = (ownerId: number, unitId: number): TempleResultCode | undefined => {
    const found = unitOf(unitId);
    if (!found || found.info.ownerId !== ownerId) return "unknown_unit";
    if (found.info.kind !== UNIT_KIND_HUMAN) return "wrong_kind";
    if (found.info.condition.heldBy !== null) return "captive";
    return undefined;
  };

  const cityOfUnit = (unitId: number, atMs: number): number | null =>
    unitCity(o.maps, o.facilities, unitId, atMs);

  /** 기도·헌금 한 번: 내 사이보그와 내 휴먼 모두의 신앙도·포인트를 함께 올린다(옛 "미니언 공유"). 사이보그 새 신앙도 */
  const devote = async (userId: string, ownerId: number, gain: number): Promise<number | undefined> => {
    const humans: number[] = [];
    for (const map of o.maps.values())
      map.forEachUnit((unit) => {
        if (unit.ownerId === ownerId && unit.kind === UNIT_KIND_HUMAN) humans.push(unit.id);
      });
    const faith = await readFaith(o.pool, humans);
    // 읽은 뒤 커밋 전까지 기다림이 없다(한 번의 동기 처리). 그 사이 떠난 유닛은 건너뛴다
    for (const [unitId, row] of faith)
      if (unitOf(unitId)) writeFaith(writer, unitId, addDevotion(row.faith, row.faithPoints, gain));
    return o.cyborgs?.addFaith(userId, gain)?.faith;
  };

  return {
    overview: (viewer, nowMs) => buildTempleOverview({ ...o, cityOfUnit }, viewer, nowMs),

    async pray(userId, input) {
      const owner = ownerFor(userId);
      if ("fail" in owner) return fail(owner.fail);
      const temple = templeOf(input.buildingId);
      if (!temple.ok) return fail(temple.code);
      const c = o.rules().temple;
      await writer.durable();
      const last = await readLastPrayer(o.pool, owner.ownerId);
      const at = o.now();
      if (last !== null && at < last + Math.max(0, c.prayCooldownMs)) return fail("cooldown");
      const gain = devotionGain("pray", 0n, c);
      const faith = await devote(userId, owner.ownerId, gain);
      writer.upsert("templeDevotions", { owner_id: owner.ownerId, last_prayed_at_ms: at });
      await writer.durable();
      return { ok: true, gained: gain, ...(faith === undefined ? {} : { faith }) };
    },

    async offer(userId, input) {
      const owner = ownerFor(userId);
      if ("fail" in owner) return fail(owner.fail);
      const temple = templeOf(input.buildingId);
      if (!temple.ok) return fail(temple.code);
      const amount = BigInt(input.amount);
      if (ledger.balanceOf(owner.ownerId, ASSET_CREDIT) < amount) return fail("insufficient_funds");
      const gain = devotionGain("offer", amount, o.rules().temple);
      await writer.durable();
      // 읽는 동안 잔고가 바뀌었을 수 있다 → 다시 본다
      if (ledger.balanceOf(owner.ownerId, ASSET_CREDIT) < amount) return fail("insufficient_funds");
      payServiceFee(ledger, owner.ownerId, temple.ownerId, amount, o.now(), "temple_offering");
      const faith = await devote(userId, owner.ownerId, gain);
      await writer.durable();
      return { ok: true, gained: gain, ...(faith === undefined ? {} : { faith }) };
    },

    async rite(userId, input) {
      const owner = ownerFor(userId);
      if ("fail" in owner) return fail(owner.fail);
      const first = myHuman(owner.ownerId, input.unit);
      if (first) return fail(first);
      const pre = templeOf(input.buildingId);
      if (!pre.ok) return fail(pre.code);
      await writer.durable();
      const human = await readFullHuman(o.pool, input.unit);
      if (!human) return fail("unknown_unit");
      const [faithRows, guardians] = await Promise.all([
        readFaith(o.pool, [input.unit]),
        readGuardianCounts(o.pool),
      ]);
      // 읽는 동안 바뀌었을 수 있다 → 메모리로 다시 본다. 여기부터 커밋 전까지 기다림이 없다
      const again = myHuman(owner.ownerId, input.unit);
      if (again) return fail(again);
      const temple = templeOf(input.buildingId);
      if (!temple.ok) return fail(temple.code);
      const society = o.rules();
      const c = society.temple;
      const at = o.now();
      const faith = faithRows.get(input.unit) ?? { faith: 0, faithPoints: 0 };
      const cost = riteCost(input.rite, c);
      if (String(cost.currency) !== input.cost) return fail("cost_changed");
      const blockers = riteBlockers(
        {
          rite: input.rite,
          nowMs: at,
          window: inactiveWindow(human.bornAtMs, human.lifespanMs, c),
          faith: faith.faith,
          currency: ledger.balanceOf(owner.ownerId, ASSET_CREDIT),
          guardians: temple.cityId === null ? 0 : (guardians.get(temple.cityId) ?? 0),
        },
        c,
      );
      if (blockers.includes("not_inactive")) return fail("not_inactive");
      if (temple.cityId === null || cityOfUnit(input.unit, at) !== temple.cityId) return fail("wrong_city");
      if (blockers.includes("faith")) return fail("faith_low");
      if (blockers.includes("currency")) return fail("insufficient_funds");
      if (blockers.includes("guardian_cap")) return fail("guardian_cap");
      payServiceFee(ledger, owner.ownerId, temple.ownerId, cost.currency, at, `temple_${input.rite}`);
      if (input.rite === "rebirth") {
        const roll = createRng(o.seed()).nextInt(10_000);
        const next = rebirthHuman({ ...human, faith: faith.faith }, at, roll, society);
        writeHuman(writer, human, next);
        writeFaith(writer, input.unit, { faith: next.faith, faithPoints: faith.faithPoints });
      } else {
        // 수호신 줄 → 같은 유닛이 수호신 유닛(종류 6)이 되어 선 칸에 멈춘다 → 휴먼 행(수명)을 지운다. 지닌 것·배운 스킬·신앙은 그대로
        writeGuardian(writer, {
          unitId: input.unit,
          ownerId: owner.ownerId,
          cityId: temple.cityId,
          templeId: input.buildingId,
          level: human.level,
          rebirths: human.rebirths,
          stats: human.stats,
          elements: human.elements,
          faith: faith.faith,
          deifiedAtMs: at,
          buff: DEFAULT_GUARDIAN_BUFF,
        });
        const found = unitOf(input.unit);
        if (found) {
          found.map.setKind(input.unit, UNIT_KIND_GUARDIAN);
          const point = positionAt(found.info.motion, at);
          found.map.relocateToSafety(input.unit, {
            x: Math.floor(point.x / CELL_UNITS),
            y: Math.floor(point.y / CELL_UNITS),
          });
        }
        writer.remove("humans", { unit_id: input.unit });
      }
      inactive.delete(input.unit);
      await writer.durable();
      return { ok: true, unitId: input.unit };
    },

    async devInactivate(userId, input) {
      const owner = ownerFor(userId);
      if ("fail" in owner) return fail(owner.fail);
      const first = myHuman(owner.ownerId, input.unit);
      if (first && first !== "captive") return fail(first);
      await writer.durable();
      const human = await readFullHuman(o.pool, input.unit);
      if (!human) return fail("unknown_unit");
      const at = o.now();
      if (human.bornAtMs + human.lifespanMs <= at) return fail("already_inactive");
      // 수명 끝 = 지금(태어난 시각을 당긴다). 지금까지 일한 몫을 정산한 뒤 비활성으로 둔다 → 다음 정산에서 노동 계약이 이 시각에 끝난다
      writeHuman(writer, human, {
        bornAtMs: at - human.lifespanMs,
        lifespanMs: human.lifespanMs,
        rebirths: human.rebirths,
        level: human.level,
      });
      settlement.settleOwner(owner.ownerId, at);
      inactive.set(input.unit, owner.ownerId);
      await writer.durable();
      return { ok: true, unitId: input.unit };
    },

    async devGuardianBuff(input) {
      if (!o.ready()) return fail("busy");
      await writer.durable();
      const [row] = await readGuardians(o.pool, { unitId: input.unit });
      if (!row) return fail(unitOf(input.unit) ? "wrong_kind" : "unknown_unit");
      writeGuardian(writer, { ...row, buff: input.buff });
      await writer.durable();
      return { ok: true, unitId: input.unit };
    },

    isInactive: (unitId) => inactive.has(unitId),

    isAway: (unitId) => inactive.has(unitId) || unitOf(unitId)?.info.kind === UNIT_KIND_GUARDIAN,

    async sweep(nowMs) {
      if (!o.ready() || sweeping) return 0;
      sweeping = true;
      try {
        await writer.durable();
        const result = await o.pool.query(
          `select h.unit_id, u.owner_id, h.born_at_ms + h.lifespan_ms as ends
             from world_humans h join world_units u on u.id = h.unit_id
            where u.kind = $1 and h.born_at_ms + h.lifespan_ms <= $2 order by ends, h.unit_id`,
          [UNIT_KIND_HUMAN, nowMs],
        );
        const rows = result.rows.map((row) => ({
          unitId: Number(row.unit_id),
          ownerId: Number(row.owner_id),
          endsAtMs: Number(row.ends),
        }));
        // 떠났거나(지워짐) 환생한 유닛은 표에서 뺀다
        const still = new Set(rows.map((row) => row.unitId));
        for (const unitId of inactive.keys()) if (!still.has(unitId)) inactive.delete(unitId);
        // 새 비활성: 그 주체를 수명 끝까지 정산한 뒤 표에 넣는다(그때까지는 일했다). 그다음 지금까지 정산하면 노동 계약이 수명 끝에
        // "유닛 사라짐"으로 끝난다(unitAway, 옛 _processWraith "활성 계약 종료")
        const fresh = rows.filter((row) => !inactive.has(row.unitId));
        for (const row of fresh) {
          settlement.settleOwner(row.ownerId, row.endsAtMs);
          inactive.set(row.unitId, row.ownerId);
        }
        for (const ownerId of new Set(fresh.map((row) => row.ownerId)))
          settlement.settleOwner(ownerId, nowMs);
        if (fresh.length > 0) await writer.durable();
        return fresh.length;
      } finally {
        sweeping = false;
      }
    },
  };
}
