// 다친 유닛의 자율 병원 판단 — 관리인이 맡은 유닛(league-2, 사용자 결정 D-590 2507 가)과 NPC 휴먼(league-3, D-555 1509 "NPC만으로도 똑같이").
// docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (league-2, D-590)"·"바뀜 (league-3)".
// 사용자 원문(D-590): "유닛이 알아서 병원가서 치료하고 오든지 경미한부상은 계속 일하든지 자율판단". 관리인이 맡은 일(남의 시설 임금형 계약 — offlineSteward.ts
// stewardExemption)도 다른 일처럼 작업 중 부상(D-521)을 굴린다(정산 고리 그대로 — 새 부상 규칙 없음). 다친 유닛은 스스로 판단한다:
// - 판단(stewardTreats): D-586 유닛 2차 지수의 위험 감수(@terra/sim/npcAi deriveUnitDrives risk — 과감 6 : 호전 2 : 자치 2)와 부상 무게(단계 × 1000 ÷ 3 — 경상 333·
//   중상 666·중태 1000)를 견준다. 무게 > 위험 감수면 병원에 가고, 아니면 계속 일한다(자연 치유). 성향이 없는 유닛은 가운데(500 — 경상은 일, 중상부터 병원)
//   [임시 — 꼴은 질문 2645 (가) 확인].
// - 요금 상한(league-3, 2645 (다) 기술 기본값): 견적 ≤ 지갑 × 설정 칸 house_unit_care_cost_cap_pm(‰)인 병원만 고른다(비접속 동안 지갑이 비지 않게).
// - 그 도시 병원(유닛이 선 칸의 도시에서 일하는 병원 — 병원 서비스 careQuotes): 상한 안에서 가장 빠른 곳에서 치료한다. 플레이어 유닛은 유저가 누르는 것과 같은
//   명령·요금(hospital treat), NPC 휴먼은 그 휴먼 지갑(treatBy — 나라 화폐 [임시 — 질문 2701]). 치료는 배율만 바꾸고 계약은 그대로라 그 자리에서 일을 잇는다.
// - 다른 도시 병원(league-3, 2645 기획 검토 — D-590 "병원가서 치료하고 오든지" + D-591 "어떠한 경우에도 순간이동은 없다"): 그 도시에 일하는 병원이 없거나 상한 안의
//   병원이 없으면 상한 안의 다른 도시 병원 가운데 가장 가까운 곳(행성 위 2차맵 거리 → 2차맵 안 칸 거리 → 건물 ID, travel/encounterHome.ts nearestHome)으로 실제로
//   걸어간다(플레이어 = 이동 서비스 start, 이동 kind move. NPC 휴먼 = NPC 이동 CareNpcTravel). 닿으면 그 도시 병원에서 치료하고(견적을 다시 받는다) 떠난 자리로
//   걸어 돌아온다. 떠나면 그 시설 2차맵을 떠나므로 계약이 끝난다(labor/service.ts 522 ①) — 돌아오면 관리인이 다시 그 2차맵 일자리에 넣는다(일을 쉬고 돌아온다).
//   가는·돌아오는 동안은 관리인이 새 일자리에 넣지 않는다(busy). 기억은 메모리(다시 켜면 버린다 — 유닛은 선 자리에 남는다) [임시].
//   플레이어 유닛: 유저가 접속하면 그 길은 유저에게 맡기고 기억을 버린다(유저가 멈추거나 바꿀 수 있다). NPC 휴먼: NPC 이동이 없으면(통합 전 — no-teleport-b의
//   travel/npcTravel.ts) 걸어가지 않고 같은 도시 병원만 쓴다 [임시].
// - 부하: 살피기(offlineSteward.ts sweep)마다 한 번, 치료·출발 합 STEWARD_CARE_PER_SWEEP번까지(NPC 휴먼은 견적 받기 NPC_CARE_PER_SWEEP번 따로 — 돌아가며). 병원 서비스는 월드 밖
//   (hospital/attach.ts)에서 만들어지므로 2차맵 모음(world.maps — 관리인과 같은 객체)에 붙여 둔다(attachStewardCare).
import { type UnitTraits, unitTraitsFromArray } from "@terra/shared/unitTraits";
import { type Motion, type SizeClass, anchorAt, positionAt } from "@terra/sim";
import { deriveUnitDrives } from "@terra/sim/npcAi";
import { nearestHome } from "../travel/encounterHome.ts";
import { type UnitCondition, injuryNowOf } from "../world/unitCondition.ts";

/** [임시] 한 번 살필 때 관리인 유닛의 치료·출발 수 상한 */
export const STEWARD_CARE_PER_SWEEP = 20;
/** [임시] 한 번 살필 때 NPC 휴먼의 견적 받기 수 상한(돌아가며) */
export const NPC_CARE_PER_SWEEP = 20;
/** [임시] 병원 길 기억을 버리기까지(ms — 길이 끊겨 끝남을 모를 때) */
export const CARE_TRIP_MAX_MS = 3 * 86_400_000;

/** 부상 무게(0~1000): 단계 × 1000 ÷ 3(내림, 중태 = 1000) */
export const injuryWeightPm = (stage: number): number =>
  Math.min(1000, Math.floor((Math.max(0, Math.trunc(stage)) * 1000) / 3));

/** 위험 감수(0~1000): 성향 → D-586 2차 지수 risk. 성향이 없으면 가운데 500 */
export function stewardRisk(traits: UnitTraits | undefined): number {
  if (!traits) return 500;
  return deriveUnitDrives({ traits, satisfactionMilli: null, fedPm: null }).risk;
}

/** 병원에 가나: 다쳤고 부상 무게가 위험 감수보다 크다 */
export function stewardTreats(stage: number, risk: number): boolean {
  return stage > 0 && injuryWeightPm(stage) > risk;
}

/** 요금 상한(지갑 × ‰, 내림) */
export const careBudget = (balance: bigint, capPm: number): bigint =>
  balance <= 0n ? 0n : (balance * BigInt(Math.min(1000, Math.max(0, Math.trunc(capPm))))) / 1000n;

/** 자율 치료가 내는 지갑(hospital/service.ts CarePayer와 같은 꼴) */
export interface CarePayerRef {
  readonly ownerId: number;
  readonly account: number;
  readonly asset: string;
}

/** 견적 한 곳(hospital/service.ts CareQuote의 몫) */
export interface CareQuoteRef {
  readonly buildingId: number;
  readonly cityId: number;
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
  readonly cost: bigint;
}

/** 병원 서비스에서 쓰는 몫(hospital/service.ts HospitalService) */
export interface StewardHospital {
  careQuotes(
    unitId: number,
    nowMs: number,
  ): Promise<{ readonly cityId: number | null; readonly options: readonly CareQuoteRef[] } | undefined>;
  treat(
    userId: string,
    input: { readonly buildingId: number; readonly unit: number; readonly cost: string },
  ): Promise<{ readonly ok: boolean }>;
  treatBy(
    payer: CarePayerRef,
    input: { readonly buildingId: number; readonly unit: number; readonly cost: string },
  ): Promise<{ readonly ok: boolean }>;
}

/** 목적지(2차맵과 그 안 칸) */
export interface CareSpot {
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

/** 플레이어 유닛 이동(이동 서비스 travel/service.ts의 몫) */
export interface CareTravel {
  start(
    userId: string,
    request: CareSpot & { readonly unitId: number; readonly kind: "move" },
  ): Promise<{ readonly ok: boolean }>;
  list(
    userId: string,
  ): readonly { readonly unitId: number; readonly state: "going" | "arrived" | "stopped" }[];
}

/** NPC 이동 끝남 알림(no-teleport-b travel/npcJourney.ts NpcTravelDone과 같은 꼴 — 여기서는 unitId·state만 쓴다) */
export interface CareNpcTravelDone {
  readonly unitId: number;
  readonly state: "arrived" | "stopped";
  /** 멈춘 까닭(도착이면 null) */
  readonly stop: unknown;
  /** 끝난 때 유닛이 선 2차맵(모르면 undefined) */
  readonly mapKey: number | undefined;
}

/** NPC 보내기 결과(no-teleport-b NpcSendResult와 같은 꼴) */
export type CareNpcSendResult =
  | { readonly ok: true; readonly arriveAt: number }
  | { readonly ok: false; readonly code: string };

/**
 * NPC 휴먼 2차맵 사이 이동(league-3 — 줄기 no-teleport-b(머리 0ce23b84ba) travel/npcTravel.ts NpcTravel.send와 같은 꼴: send(unitId, { mapKey, x, y }, onDone?) →
 * 결과, 끝나면 onDone 한 번(메모리에만 — 다시 켜면 버린다). 봇·NPC 지도자만, 목적 2차맵은 띄운 것(병원이 선 2차맵은 건물이 있어 늘 떠 있다)).
 * 그 줄기가 합쳐지면 hospital/attach.ts가 npcTravelOf(world.persistence.travel)를 넘긴다. 없으면 NPC 휴먼은 같은 도시 병원만 쓴다
 */
export interface CareNpcTravel {
  send(unitId: number, to: CareSpot, onDone?: (done: CareNpcTravelDone) => void): Promise<CareNpcSendResult>;
}

/** NPC 휴먼 몫(NPC 런타임이 있을 때만) */
export interface NpcCareSource {
  /** NPC 나라 주체의 거울 세계 휴먼인가(플레이어 주체 유닛·지도자가 아닌 것) */
  isHuman(unitId: number, ownerId: number, kind: number): boolean;
  traitsOf(unitId: number): UnitTraits | undefined;
  /** 그 휴먼 지갑(나라 화폐). 없으면 치료하지 않는다 */
  purseOf(unitId: number, ownerId: number): CarePayerRef | undefined;
  /** NPC 이동(없으면 걸어가지 않는다) */
  travel(): CareNpcTravel | undefined;
}

interface CareMap {
  readonly mapKey: number;
  forEachUnit(
    visit: (unit: {
      readonly id: number;
      readonly kind: number;
      readonly ownerId: number;
      readonly traits?: readonly number[] | undefined;
    }) => void,
  ): void;
  unitInfo(
    unitId: number,
  ): { readonly condition: UnitCondition; readonly motion: Motion; readonly size: SizeClass } | undefined;
}

/** 관리인 살피기 한 번의 입력 */
export interface StewardCareInput {
  /** 관리인이 맡은 비접속 유저(소유 주체 → 사용자) */
  readonly owners: ReadonlyMap<number, string>;
  /** 관리인이 맡는 일을 하는 유닛인가(stewardExemption) */
  readonly stewarded: (unitId: number) => boolean;
  /** 관리인이 다루는 유닛 종류(고용 휴먼·사이보그 유닛) */
  readonly kinds: ReadonlySet<number>;
  readonly nowMs: number;
  /** 요금 상한(‰ — 설정 칸 house_unit_care_cost_cap_pm). 없으면 1000(지갑 전부) */
  readonly costCapPm?: number | undefined;
}

export interface StewardCare {
  /** 살핀다: 그 도시 병원 치료·다른 도시 병원으로 출발·닿은 길 처리. 치료한 수 */
  run(input: StewardCareInput): Promise<number>;
  /** 병원에 가거나 돌아오는 중인 유닛(관리인이 새 일자리에 넣지 않는다) */
  busy(unitId: number): boolean;
}

const careByMaps = new WeakMap<object, StewardCare>();

/** 2차맵 모음에 자율 병원 판단을 붙인다(hospital/attach.ts) */
export function attachStewardCare(maps: object, care: StewardCare): void {
  careByMaps.set(maps, care);
}

/** 2차맵 모음에 붙은 자율 병원 판단(없으면 undefined — 병원 서비스가 없는 시험·서버) */
export function stewardCareOf(maps: object): StewardCare | undefined {
  return careByMaps.get(maps);
}

/** 병원 길 하나(메모리) */
interface CareTrip {
  readonly unitId: number;
  readonly ownerId: number;
  /** 플레이어 유닛이면 그 유저(NPC 휴먼은 undefined) */
  readonly userId: string | undefined;
  readonly payer: CarePayerRef | undefined;
  readonly hospitalCity: number;
  readonly origin: CareSpot;
  readonly capPm: number;
  readonly sinceMs: number;
  phase: "going" | "returning";
  /** NPC 이동이 끝났다고 알렸나(플레이어는 이동 서비스 목록으로 본다) */
  done: boolean;
}

/** 그 유닛을 치료한다(그 도시 견적에서 상한 안 가장 빠른 곳). 치료했으면 true */
async function treatHere(
  hospital: StewardHospital,
  unitId: number,
  cityId: number,
  options: readonly CareQuoteRef[],
  budget: bigint,
  userId: string | undefined,
  payer: CarePayerRef | undefined,
): Promise<boolean> {
  const option = options.find((entry) => entry.cityId === cityId && entry.cost <= budget);
  if (!option) return false;
  const input = { buildingId: option.buildingId, unit: unitId, cost: String(option.cost) };
  if (userId !== undefined) return (await hospital.treat(userId, input)).ok;
  return payer ? (await hospital.treatBy(payer, input)).ok : false;
}

/** 자율 병원 판단을 만든다 */
export function createStewardCare(o: {
  readonly maps: ReadonlyMap<number, CareMap>;
  readonly hospital: () => StewardHospital | undefined;
  /** 플레이어 유닛 이동(없으면 다른 도시로 걷지 않는다) */
  readonly travel?: (() => CareTravel | undefined) | undefined;
  /** 플레이어 주체의 지갑(유저 치료와 같은 계정·화폐). 없으면 상한을 셀 수 없어 치료하지 않는다 */
  readonly playerPayer?: ((ownerId: number) => CarePayerRef | undefined) | undefined;
  /** 계정 잔고 */
  readonly balance?: ((account: number) => bigint) | undefined;
  /** NPC 휴먼(없으면 관리인 유닛만) */
  readonly npc?: (() => NpcCareSource | undefined) | undefined;
  readonly log?: { warn(obj: object, message: string): void } | undefined;
}): StewardCare {
  const trips = new Map<number, CareTrip>();
  /** NPC 휴먼 살피기 차례(지난번 마지막 유닛 ID — 못 고치는 휴먼이 앞자리를 늘 차지하지 않게 돌아가며 본다) */
  let npcCursor = 0;

  const locate = (unitId: number, nowMs: number): CareSpot | undefined => {
    for (const map of o.maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return { mapKey: map.mapKey, ...anchorAt(positionAt(info.motion, nowMs), info.size) };
    }
    return undefined;
  };

  /** 보낸다(플레이어 = 이동 서비스, NPC = NPC 이동). 보냈으면 true */
  async function send(trip: CareTrip, to: CareSpot): Promise<boolean> {
    trip.done = false;
    if (trip.userId !== undefined) {
      const travel = o.travel?.();
      return travel
        ? (await travel.start(trip.userId, { unitId: trip.unitId, ...to, kind: "move" })).ok
        : false;
    }
    const travel = o.npc?.()?.travel();
    if (!travel) return false;
    const sent = await travel.send(trip.unitId, to, (done) => {
      if (trips.get(done.unitId) !== trip) return;
      trip.done = true;
      // NPC 휴먼은 닿은 뒤 다시 스스로 걷는다 — 닿은 때 바로 처리한다
      settle(trip, Date.now()).catch((error: unknown) =>
        o.log?.warn({ err: error, unitId: trip.unitId }, "npc hospital trip failed"),
      );
    });
    return sent.ok;
  }

  /** 길이 끝난(닿은·멈춘) 병원 길: 가는 길이면 그 도시에서 치료하고 돌아오고, 돌아오는 길이면 잊는다 */
  async function settle(trip: CareTrip, nowMs: number): Promise<void> {
    if (trip.phase === "returning") {
      trips.delete(trip.unitId);
      return;
    }
    const hospital = o.hospital();
    const quotes = hospital ? await hospital.careQuotes(trip.unitId, nowMs) : undefined;
    if (hospital && quotes && quotes.cityId === trip.hospitalCity) {
      const payer = trip.userId === undefined ? trip.payer : o.playerPayer?.(trip.ownerId);
      const budget = payer ? careBudget(o.balance?.(payer.account) ?? 0n, trip.capPm) : 0n;
      await treatHere(
        hospital,
        trip.unitId,
        trip.hospitalCity,
        quotes.options,
        budget,
        trip.userId,
        trip.payer,
      );
    }
    // 치료했든 못 했든(나음·돈 모자람·병원 닫힘) 떠난 자리로 돌아온다
    trip.phase = "returning";
    if (!(await send(trip, trip.origin))) trips.delete(trip.unitId);
  }

  /** 이어 오던 병원 길을 처리한다(끝난 것만) */
  const advance = async (input: StewardCareInput): Promise<void> => {
    for (const trip of [...trips.values()].toSorted((a, b) => a.unitId - b.unitId)) {
      if (input.nowMs - trip.sinceMs > CARE_TRIP_MAX_MS) {
        trips.delete(trip.unitId);
        continue;
      }
      if (trip.userId !== undefined) {
        // 유저가 돌아오면 그 길은 유저에게 맡긴다
        if (input.owners.get(trip.ownerId) !== trip.userId) {
          trips.delete(trip.unitId);
          continue;
        }
        const state = o
          .travel?.()
          ?.list(trip.userId)
          .find((view) => view.unitId === trip.unitId)?.state;
        if (state === "going") continue;
      } else if (!trip.done) continue;
      await settle(trip, input.nowMs);
    }
  };

  /** 한 유닛: 그 도시 병원에서 치료(treated)하거나 다른 도시 병원으로 보낸다(sent). 아무것도 못 했으면 none */
  const care = async (
    hospital: StewardHospital,
    unitId: number,
    ownerId: number,
    userId: string | undefined,
    payer: CarePayerRef | undefined,
    input: StewardCareInput,
  ): Promise<"treated" | "sent" | "none"> => {
    if (!payer) return "none";
    const quotes = await hospital.careQuotes(unitId, input.nowMs);
    if (!quotes) return "none";
    const capPm = input.costCapPm ?? 1000;
    const budget = careBudget(o.balance?.(payer.account) ?? 0n, capPm);
    if (
      quotes.cityId !== null &&
      (await treatHere(hospital, unitId, quotes.cityId, quotes.options, budget, userId, payer))
    )
      return "treated";
    // 다른 도시 병원(상한 안 가장 가까운 곳)으로 걸어간다
    const from = locate(unitId, input.nowMs);
    if (!from) return "none";
    const target = nearestHome(
      quotes.options
        .filter((entry) => entry.cityId !== quotes.cityId && entry.cost <= budget)
        .map((entry) => ({ ...entry, id: entry.buildingId })),
      from,
    );
    if (!target) return "none";
    const trip: CareTrip = {
      unitId,
      ownerId,
      userId,
      payer: userId === undefined ? payer : undefined,
      hospitalCity: target.cityId,
      origin: from,
      capPm,
      sinceMs: input.nowMs,
      phase: "going",
      done: false,
    };
    trips.set(unitId, trip);
    if (await send(trip, { mapKey: target.mapKey, x: target.x, y: target.y })) return "sent";
    trips.delete(unitId);
    return "none";
  };

  return {
    busy: (unitId) => trips.has(unitId),
    async run(input) {
      const hospital = o.hospital();
      if (!hospital) return 0;
      await advance(input);
      const npc = o.npc?.();
      // 관리인 유닛(사용자 → 유닛)·NPC 휴먼(유닛 ID 차례)
      const goers = new Map<string, { unitId: number; ownerId: number }[]>();
      const npcGoers: { unitId: number; ownerId: number }[] = [];
      for (const map of o.maps.values())
        map.forEachUnit((unit) => {
          if (trips.has(unit.id)) return;
          const userId = input.owners.get(unit.ownerId);
          const steward = userId !== undefined && input.kinds.has(unit.kind) && input.stewarded(unit.id);
          if (!steward && !(userId === undefined && npc?.isHuman(unit.id, unit.ownerId, unit.kind) === true))
            return;
          const info = map.unitInfo(unit.id);
          if (!info || info.condition.heldBy !== null) return;
          const stage = injuryNowOf(info.condition, input.nowMs).stage;
          const traits = steward
            ? unitTraitsFromArray(unit.traits)
            : (npc?.traitsOf(unit.id) ?? unitTraitsFromArray(unit.traits));
          if (!stewardTreats(stage, stewardRisk(traits))) return;
          if (!steward || userId === undefined) {
            npcGoers.push({ unitId: unit.id, ownerId: unit.ownerId });
            return;
          }
          const list = goers.get(userId) ?? [];
          list.push({ unitId: unit.id, ownerId: unit.ownerId });
          goers.set(userId, list);
        });
      let treated = 0;
      let done = 0;
      for (const [userId, units] of [...goers].toSorted((a, b) => (a[0] < b[0] ? -1 : 1)))
        for (const unit of units.toSorted((a, b) => a.unitId - b.unitId)) {
          if (done >= STEWARD_CARE_PER_SWEEP) break;
          const result = await care(
            hospital,
            unit.unitId,
            unit.ownerId,
            userId,
            o.playerPayer?.(unit.ownerId),
            input,
          );
          if (result !== "none") done += 1;
          if (result === "treated") treated += 1;
        }
      // NPC 휴먼: 견적을 받는 수 자체를 NPC_CARE_PER_SWEEP로 막는다(견적마다 DB 읽기) — 지난번 다음 유닛 ID부터 돌아가며
      let npcTried = 0;
      const ordered = npcGoers.toSorted((a, b) => a.unitId - b.unitId);
      const pivot = ordered.findIndex((unit) => unit.unitId > npcCursor);
      const rotated = pivot <= 0 ? ordered : [...ordered.slice(pivot), ...ordered.slice(0, pivot)];
      if (npc)
        for (const unit of rotated) {
          if (npcTried >= NPC_CARE_PER_SWEEP) break;
          npcTried += 1;
          npcCursor = unit.unitId;
          const result = await care(
            hospital,
            unit.unitId,
            unit.ownerId,
            undefined,
            npc.purseOf(unit.unitId, unit.ownerId),
            input,
          );
          if (result === "treated") treated += 1;
        }
      return treated;
    },
  };
}
