// 신전·종교 서비스(서버) — 기획 D-517(사용자 원문 "수명이다하면 비활성 상태가 되어 환생(종교시설)이나 유전자 조각(생명과학연구소)으로 변환")·
// D-021·D-311(신관이 신전에서 환생·신격화 집전, 신격화 = 그 도시 수호신·도시당 상한 S15, 유전자는 D-517로 빠짐)·D-441(비용 = 신앙도·화폐)·
// D-444 165·D-451(신앙도 = 문턱, 환생하면 0), docs/adr/2026-11-07-temple-religion.md. 규칙은 @terra/sim society/temple.ts 한 벌이다.
// - 비활성: 유저 휴먼(유닛 종류 4)의 수명 끝 ≤ 지금. 고르지 않으면 그대로 남는다(상한 설정 칸 출발값 없음). 1분마다(sweep, 융합 서비스의
//   수명 타이머) 메모리 표를 다시 만들고, 새 비활성은 그 주체를 수명 끝까지 정산한 뒤 표에 넣는다 → 노동 계약 서비스가 계약을 "유닛 사라짐"으로
//   끝낸다(unitAway 고리, 옛 LifeEngine _processWraith "활성 계약 종료"). 비활성은 새 계약·구인·건물 작업 일꾼이 unit_busy다.
// - 신전 = 신앙 단계 시설(places.ts). 누구의 신전이든 쓴다(D-311 유저·NPC 시설 모두). 요금은 남의 신전 = 주인 수입, 내 신전 = 소각 [임시].
//   신관 직무가 서버에 없어 신전 시설이 집전한다(질문 453).
// - 의식: 내 휴먼·비활성·그 유닛이 선 칸의 도시 = 신전이 선 도시·신앙도 문턱·화폐·(신격화) 도시당 상한. 환생 = 레벨 1·태어난 시각 = 지금·수명
//   다시(T4)·환생 +1·신앙도 0. 신격화(기획 답 456 가) = 수호신 줄(버프 출발값 방어) + 같은 휴먼이 수호신 상태(종류는 휴먼 그대로 — 기획 D-589)가 되어 그 자리에 멈춰
//   그 도시에 남는다(휴먼 행은 지우고 지닌 것·배운 스킬·신앙은 그대로 — 융합과 같은 꼴). 수호신은 일하지 않고(isAway), 주인이 옮기지 못하며,
//   그 도시가 공격받는 전투에 수비로 든다(cityDefense.ts). 유전자는 들지 않는다(D-517). 유전자로 바꾸는 길(생명과학 연구소)은 유전자 명령
//   convert(fusion/geneCommands.ts)다.
// - 수호신 버프(456 가: 종류는 수호신마다 편집기 칸): 개발 편집 devGuardianBuff(dev·admin, 누구의 수호신이든). 효과(470 가): 방어 = 도시 방어
//   (cityDefense.ts), 만족도 = 그 도시 휴먼 만족도 하루 +(NPC 사회 런타임 하루 끝이 citySatisfaction을 읽는다), 생산 = 그 도시 시설 산출 ‰ +
//   (노동 계약 정산이 buildingProductionPm을 읽는다). 정산·하루 끝은 동기라 도시마다 버프를 메모리 표로 둔다(1분 sweep·신격화·버프 편집마다
//   고친다).
// - 기도·헌금(옛 religion_routes.js): 내 사이보그와 내 휴먼 모두(비활성 포함)의 신앙도·포인트를 함께 올린다. 종교 목록이 아직 없어 종교 없이
//   쌓인다 [임시](질문 457).
// - 신전 축복(D-558 1548 "신전 축복" → D-571 답 1968 "기도하면 잠시 걸리는 효과 — 종교컨텐츠 일일 보상같은. 아직 시스템 미흡 임시로"): 기도에
//   성공하면 사이보그 본체에 걸린 효과 temple_blessing(팩 효과 사전 — 이동 속도 버프)을 설정 칸 d571_temple_blessing_pm·_ms만큼 건다(같은 효과는
//   새로 건다). 걸린 효과라 2차맵 걷기 빠르기(walkSpeed.ts)와 전투 시작 효과에 그대로 든다. 기도 쿨다운(d444_pray_cooldown_ms)이 곧 축복 쿨이다.
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
  applyRebirthAdvantage,
  devotionGain,
  guardianBuffValue,
  inactiveWindow,
  positionAt,
  rebirthAdvantage,
  rebirthHuman,
  riteBlockers,
  riteCost,
} from "@terra/sim";
import type { CyborgService } from "../cyborg/service.ts";
import type { HoldingService } from "../holdings/service.ts";
import type { Ledger } from "../economy/ledger.ts";
import { buildingAccessOf } from "../facilities/access.ts";
import { buildingPlace } from "../facilities/places.ts";
import type { WorldFacilities } from "../facilities/world.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { moneyBalance } from "../world/money.ts";
import type { Settlement } from "../world/settlement.ts";
import { unavailable } from "../world/unitCondition.ts";
import { UNIT_KIND_HUMAN, isGuardianUnit } from "../world/unitKinds.ts";
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
  writeHumanGrowth,
} from "./rows.ts";

/** 신전 축복 효과(팩 효과 사전 항목 ID — 이동 속도 버프) */
export const TEMPLE_BLESSING_EFFECT = "temple_blessing";
/** 신전 축복 효과 줄의 출처 칸(물건 ID 자리) */
export const TEMPLE_BLESSING_SOURCE = "temple";

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
  /** 보유 물건(걸린 효과 — 신전 축복). 없으면 축복을 걸지 않는다 */
  readonly holdings?: Pick<HoldingService, "grantEffect"> | undefined;
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
  /** 도시마다 수호신 만족도 버프(하루 + 밀리점, 470 가). 버프가 없는 도시는 없다 */
  citySatisfaction(): ReadonlyMap<number, number>;
  /** 그 건물이 선 도시의 수호신 생산 버프(산출 + ‰, 470 가). 없으면 0 */
  buildingProductionPm(buildingId: number): number;
  /**
   * 그 도시에 싸울 수 있는 수호신 유닛이 있나(기획 답 472 가 — 수비 휴먼이 없어도 웨이브 전투를 연다): 세계에 있고 수호신 상태·부상·포로·
   * 비활성이 아님(도시 방어 cityDefense.ts가 전투에 넣는 조건과 같다)
   */
  hasFightingGuardian(cityId: number, nowMs: number): boolean;
  /** 비활성 표를 다시 만들고 새 비활성의 주체를 정산한다(계약 끝). 새로 비활성이 된 유닛 수 */
  sweep(nowMs: number): Promise<number>;
}

const fail = (code: TempleResultCode): TempleCommandResult => ({ ok: false, code });

export function createTempleService(o: TempleServiceOptions): TempleService {
  const { ledger, writer, settlement } = o;
  /** 비활성 유닛 → 소유 주체 */
  const inactive = new Map<number, number>();
  /** 수호신 → 도시·버프(메모리 표, DB 행이 원본 — 1분 sweep·신격화·버프 편집마다 고친다) */
  const guardianBuffs = new Map<number, { readonly cityId: number; readonly buff: GuardianBuff }>();
  let sweeping = false;
  const reloadGuardians = async (): Promise<void> => {
    const rows = await readGuardians(o.pool);
    guardianBuffs.clear();
    for (const row of rows) guardianBuffs.set(row.unitId, { cityId: row.cityId, buff: row.buff });
  };
  /** 도시마다 버프 종류 목록 */
  // 처음 한 번(1분 sweep 전에도 버프가 들게). 실패하면 다음 sweep이 다시 읽는다
  void reloadGuardians().catch(() => undefined);
  const buffsByCity = (): Map<number, GuardianBuff[]> => {
    const out = new Map<number, GuardianBuff[]>();
    for (const entry of guardianBuffs.values()) {
      const list = out.get(entry.cityId);
      if (list) list.push(entry.buff);
      else out.set(entry.cityId, [entry.buff]);
    }
    return out;
  };

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

  /** 내 휴먼(종류 4, 수호신 아님, 포로 아님) */
  const myHuman = (ownerId: number, unitId: number): TempleResultCode | undefined => {
    const found = unitOf(unitId);
    if (!found || found.info.ownerId !== ownerId) return "unknown_unit";
    if (found.info.kind !== UNIT_KIND_HUMAN || isGuardianUnit(found.info)) return "wrong_kind";
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
        if (unit.ownerId === ownerId && unit.kind === UNIT_KIND_HUMAN && !isGuardianUnit(unit))
          humans.push(unit.id);
      });
    const faith = await readFaith(o.pool, humans);
    // 읽은 뒤 커밋 전까지 기다림이 없다(한 번의 동기 처리). 그 사이 떠난 유닛은 건너뛴다
    for (const [unitId, row] of faith)
      if (unitOf(unitId)) writeFaith(writer, unitId, addDevotion(row.faith, row.faithPoints, gain));
    return o.cyborgs?.addFaith(userId, gain)?.faith;
  };

  /** 신전 축복(D-571 답 1968): 사이보그 본체에 이동 속도 효과를 건다(같은 커밋). 값·시간이 0이거나 본체가 없으면 아무것도 하지 않는다 */
  const bless = (userId: string, c: SocietyCoefficients["temple"], at: number): void => {
    const unitId = o.cyborgs?.record(userId)?.unitId;
    if (!o.holdings || unitId === null || unitId === undefined) return;
    const value = Math.trunc(c.blessingMovePm);
    const ms = Math.trunc(c.blessingMs);
    if (value <= 0 || ms <= 0) return;
    o.holdings.grantEffect(
      unitId,
      { effect: TEMPLE_BLESSING_EFFECT, value, untilMs: at + ms, source: TEMPLE_BLESSING_SOURCE },
      at,
    );
  };

  return {
    overview: (viewer, nowMs) => buildTempleOverview({ ...o, cityOfUnit }, viewer, nowMs),

    async pray(userId, input) {
      const owner = ownerFor(userId);
      if ("fail" in owner) return fail(owner.fail);
      const temple = templeOf(input.buildingId);
      if (!temple.ok) return fail(temple.code);
      if (buildingAccessOf(ledger)?.check(userId, input.buildingId).allowed === false)
        return fail("temple_closed");
      const c = o.rules().temple;
      await writer.durable();
      const last = await readLastPrayer(o.pool, owner.ownerId);
      const at = o.now();
      if (last !== null && at < last + Math.max(0, c.prayCooldownMs)) return fail("cooldown");
      const gain = devotionGain("pray", 0n, c);
      const faith = await devote(userId, owner.ownerId, gain);
      writer.upsert("templeDevotions", { owner_id: owner.ownerId, last_prayed_at_ms: at });
      bless(userId, c, at);
      await writer.durable();
      return { ok: true, gained: gain, ...(faith === undefined ? {} : { faith }) };
    },

    async offer(userId, input) {
      const owner = ownerFor(userId);
      if ("fail" in owner) return fail(owner.fail);
      const temple = templeOf(input.buildingId);
      if (!temple.ok) return fail(temple.code);
      if (buildingAccessOf(ledger)?.check(userId, input.buildingId).allowed === false)
        return fail("temple_closed");
      const amount = BigInt(input.amount);
      if (moneyBalance(ledger, owner.ownerId) < amount) return fail("insufficient_funds");
      const gain = devotionGain("offer", amount, o.rules().temple);
      await writer.durable();
      // 읽는 동안 잔고가 바뀌었을 수 있다 → 다시 본다
      if (moneyBalance(ledger, owner.ownerId) < amount) return fail("insufficient_funds");
      payServiceFee(
        o.facilities,
        ledger,
        owner.ownerId,
        { ownerId: temple.ownerId, buildingId: input.buildingId },
        amount,
        o.now(),
        "temple_offering",
      );
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
      if (buildingAccessOf(ledger)?.check(userId, input.buildingId).allowed === false)
        return fail("temple_closed");
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
      if (buildingAccessOf(ledger)?.check(userId, input.buildingId).allowed === false)
        return fail("temple_closed");
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
          currency: moneyBalance(ledger, owner.ownerId),
          guardians: temple.cityId === null ? 0 : (guardians.get(temple.cityId) ?? 0),
        },
        c,
      );
      if (blockers.includes("not_inactive")) return fail("not_inactive");
      if (temple.cityId === null || cityOfUnit(input.unit, at) !== temple.cityId) return fail("wrong_city");
      if (blockers.includes("faith")) return fail("faith_low");
      if (blockers.includes("currency")) return fail("insufficient_funds");
      if (blockers.includes("guardian_cap")) return fail("guardian_cap");
      payServiceFee(
        o.facilities,
        ledger,
        owner.ownerId,
        { ownerId: temple.ownerId, buildingId: input.buildingId },
        cost.currency,
        at,
        `temple_${input.rite}`,
      );
      if (input.rite === "rebirth") {
        // 굴림 차례: 수명(T4) → 어드밴티지 종류 → 어느 스탯(D-520 "어드벤티지를 준다. 초기스탯이나 k값 증가이나 확률로.")
        const rng = createRng(o.seed());
        const roll = rng.nextInt(10_000);
        const next = rebirthHuman({ ...human, faith: faith.faith }, at, roll, society);
        const advantage = rebirthAdvantage(rng.nextInt(10_000), rng.nextInt(6), c);
        const grown = applyRebirthAdvantage(human.stats, human.kPm, advantage);
        writeHuman(writer, human, {
          ...next,
          ...(advantage.kind === "stat" ? { stats: grown.stats } : {}),
        });
        if (advantage.kind === "k") writeHumanGrowth(writer, input.unit, grown.kPm);
        writeFaith(writer, input.unit, { faith: next.faith, faithPoints: faith.faithPoints });
      } else {
        // 수호신 줄 → 같은 휴먼이 수호신 상태가 되어(종류는 그대로 — 기획 D-589) 선 칸에 멈춘다 → 휴먼 행(수명)을 지운다. 지닌 것·배운 스킬·신앙은 그대로
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
        guardianBuffs.set(input.unit, { cityId: temple.cityId, buff: DEFAULT_GUARDIAN_BUFF });
        const found = unitOf(input.unit);
        if (found) {
          found.map.markGuardian(input.unit);
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
      guardianBuffs.set(row.unitId, { cityId: row.cityId, buff: input.buff });
      await writer.durable();
      return { ok: true, unitId: input.unit };
    },

    isInactive: (unitId) => inactive.has(unitId),

    isAway: (unitId) => inactive.has(unitId) || isGuardianUnit(unitOf(unitId)?.info),

    citySatisfaction() {
      const c = o.rules().temple;
      const out = new Map<number, number>();
      for (const [cityId, buffs] of buffsByCity()) {
        const value = guardianBuffValue(buffs, "satisfaction", c);
        if (value > 0) out.set(cityId, value);
      }
      return out;
    },

    hasFightingGuardian(cityId, nowMs) {
      for (const [unitId, entry] of guardianBuffs) {
        if (entry.cityId !== cityId || inactive.has(unitId)) continue;
        const info = unitOf(unitId)?.info;
        if (info && isGuardianUnit(info) && !unavailable(info.condition, nowMs)) return true;
      }
      return false;
    },

    buildingProductionPm(buildingId) {
      const world = o.facilities;
      if (!world || guardianBuffs.size === 0) return 0;
      const cityId = buildingPlace(world.service.places, buildingId)?.cityId;
      if (cityId === null || cityId === undefined) return 0;
      return guardianBuffValue(buffsByCity().get(cityId) ?? [], "production", o.rules().temple);
    },

    async sweep(nowMs) {
      if (!o.ready() || sweeping) return 0;
      sweeping = true;
      try {
        await writer.durable();
        // 수호신 버프 표도 DB 행으로 다시 맞춘다(만족도·생산 버프가 읽는다)
        await reloadGuardians();
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
