// 국적 바꾸기(귀화) 서비스(서버 권위) — 기획 정리 D-523 포인터(질문 745 나: 다른 나라 정부에서 "귀화" 신청, 값·쉬는 날은 설정 칸)·D-526(받는
// 나라가 지원금 또는 입회비를 정함, 옛 나라에 반환 없음, 옛 나라 우호도 하락 — 적대 세력으로 가면 크게), 정착 지원금은 사이보그마다 한 번이고
// 세력을 바꿔도 다시 주지 않는다(D-163·D-7032), docs/adr/2026-11-08-citizenship.md.
// - 받는 나라 = 누른 행정 건물(government_hall)이 선 도시의 주인 나라(NPC 사회 런타임 거울 도시). 첫 접속에서 고를 수 있는 나라와 같은 목록만
//   받는다(고정 NPC 국가 + 이 서버에 시작 도시, [임시] 질문 790).
// - 정부에 직접 가야 한다: 내 사이보그 본체가 그 도시(그 칸의 도시 = 행정 건물의 도시)에 서 있어야 한다(병원·신전과 같은 셈, [임시] 질문 791).
// - 값(D-526): 받는 나라의 귀화 조건(나라가 정한 값, 없으면 설정 칸 citizenship_fee — NPC 국가는 기본값) 하나. + 입회비 = 옮겨 오는 사람 → 받는
//   나라 국고, − 지원금 = 받는 나라 국고 → 옮겨 오는 사람(국고가 모자라면 있는 만큼 — 새 화폐를 만들지 않는다, [임시] 질문 845). 옛 나라에는
//   돌려주지 않는다. 시험 화폐(정착 지원금과 같은 자산). 입회비가 잔고보다 크면 insufficient_funds(일부만 내지 않는다).
// - 우호도(D-526): 떠난 사람과 옛 나라 사이 우호도가 설정 칸 citizenship_standing_drop만큼, 받는 나라가 옛 나라와 전쟁 중(적대 세력)이면
//   citizenship_standing_drop_hostile만큼 떨어진다(−100~100 눈금, 표 user_nation_standings).
// - 쉬는 날: 마지막으로 바꾼 뒤 설정 칸 citizenship_rest_ms 동안 다시 바꿀 수 없다(첫 접속 고르기는 세지 않는다).
// - 나라는 하나(기획 D-569): 가문원의 나라는 가문 소속 도시의 나라라 귀화하지 못한다(in_house — 가문장은 소속 도시를 바꾸고 가문원은 가문을
//   나간 뒤 귀화한다). 귀화는 무소속의 소속 도시(내 도시)와 그 나라를 바꾸는 길이다.
// - 바뀌는 것: 나라(사이보그 행·세력 가입)와 내 도시(start_city_id = 귀화한 도시)·옛 나라 우호도. 그대로인 것: 유닛·건물·직무·노동 계약·고용한
//   휴먼(모두 내 소유 주체 것이라 주인이 그대로다), 받은 정착 지원금은 새 나라가 다시 주지 않는다([임시] 질문 793). 시야 공유·아는 도시는 다음
//   시야 틱·조회부터 새 나라.
// 명령 하나 = 다시 확인(메모리) → 한 번의 동기 처리(원장 거래·사이보그 행·가입·우호도·기록) → 커밋 뒤 답(U2).
import type { NationalityResultCode } from "@terra/protocol";
import type {
  NaturalizationBlock,
  NaturalizationNation,
  NaturalizationResponse,
  NaturalizationStanding,
} from "@terra/shared/citizenship";
import { RELATION_SCORE_MIN } from "@terra/shared/faction";
import type { LocalizedName } from "@terra/shared/roster";
import type { CyborgService } from "../cyborg/service.ts";
import type { CyborgRecord } from "../cyborg/state.ts";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldFacilities } from "../facilities/world.ts";
import { GOVERNMENT_FACILITY } from "../government/reads.ts";
import { unitCity } from "../temple/places.ts";
import type { Viewer } from "../trpc/context.ts";
import type { OwnerRow } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { ASSET_CREDIT, type Settlement } from "../world/settlement.ts";

export type NationalityCommandResult =
  | {
      readonly ok: true;
      readonly factionId: number;
      readonly cityId: number;
      readonly paid: string;
      readonly granted: string;
      readonly standingDrop: number;
      readonly hostile: boolean;
      readonly nextAtMs: number;
    }
  | { readonly ok: false; readonly code: NationalityResultCode };

/** NPC 사회 런타임 거울 세계에서 읽는 것(도시 주인·세력 코드·살아 있나·전쟁 상대 — 키는 모두 소유 주체 ID) */
export interface CitizenshipRuntime {
  readonly world: {
    readonly cities: ReadonlyMap<number, { readonly id: number; readonly owner: number }>;
    readonly factions: ReadonlyMap<
      number,
      { readonly code: string | null; readonly alive: boolean; readonly wars?: ReadonlySet<number> }
    >;
  };
}

export interface CitizenshipServiceOptions {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly cyborgs: Pick<
    CyborgService,
    "record" | "joinable" | "changeNation" | "naturalizationRules" | "standingOf"
  >;
  readonly facilities: WorldFacilities;
  readonly owners: ReadonlyMap<number, OwnerRow>;
  readonly settlement: Pick<Settlement, "findOwnerOfUser">;
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  /** NPC 사회 런타임(없으면 busy·not_ready) */
  readonly runtime: () => CitizenshipRuntime | undefined;
  readonly now: () => number;
  readonly ready: () => boolean;
  /** 조회만: 그 사람이 아는 도시(1차맵 도시 안개). 없으면 거르지 않는다 */
  readonly knownCityIds?: ((viewer: Viewer) => Promise<ReadonlySet<number>>) | undefined;
  /** 조회만: 세력 코드 → 나라 이름(팩 국가 프리셋) */
  readonly nationName?: ((code: string) => LocalizedName | undefined) | undefined;
  /** 가문원인가(D-569 — 가문원의 나라는 가문 소속 도시가 정해 귀화하지 못한다, world/houseTies.ts). 없으면 막지 않는다(시험) */
  readonly inHouse?: ((userId: string) => boolean) | undefined;
}

export interface CitizenshipService {
  /** 그 행정 건물에서 귀화하는 조건(입회비·지원금·우호도·쉬는 날·막는 까닭). 읽기만 한다 */
  terms(viewer: Viewer, buildingId: number, nowMs: number): Promise<NaturalizationResponse>;
  /** 귀화 신청(WebSocket nationality_change) */
  change(
    userId: string,
    input: { readonly buildingId: number; readonly factionId: number; readonly cost: string },
  ): Promise<NationalityCommandResult>;
}

const fail = (code: NationalityResultCode): NationalityCommandResult => ({ ok: false, code });

/** 받는 나라의 귀화 조건(부호 있는 값) → 입회비·지원금 요청(둘 중 하나만 0보다 크다) */
export function splitTerms(value: bigint): { readonly fee: bigint; readonly grant: bigint } {
  return value >= 0n ? { fee: value, grant: 0n } : { fee: 0n, grant: -value };
}

/** 옛 나라 우호도가 떨어지는 양: 받는 나라가 옛 나라와 전쟁 중이면 크게(D-526) */
export function standingDropOf(
  hostile: boolean,
  rules: { readonly standingDrop: number; readonly standingDropHostile: number },
): number {
  return hostile ? rules.standingDropHostile : rules.standingDrop;
}

/** 쉬는 날 끝(바꾼 적이 없으면 null). 이 시각부터 다시 바꿀 수 있다 */
export function restUntil(record: Pick<CyborgRecord, "nationChangedAtMs">, restMs: number): number | null {
  return record.nationChangedAtMs === null ? null : record.nationChangedAtMs + Math.max(0, restMs);
}

/** 받는 나라가 옛 나라와 전쟁 중인가(적대 세력, NPC 사회 런타임 전쟁 상태 — faction_wars war) */
const hostileTo = (
  runtime: CitizenshipRuntime,
  oldTreasury: number | undefined,
  newTreasury: number,
): boolean =>
  oldTreasury !== undefined && runtime.world.factions.get(oldTreasury)?.wars?.has(newTreasury) === true;

export function createCitizenshipService(o: CitizenshipServiceOptions): CitizenshipService {
  const { ledger, writer } = o;

  /** 세력 행 ID → 그 세력의 소유 주체(국고) */
  const treasuryOf = (factionRow: number): number | undefined => {
    for (const owner of o.owners.values()) if (owner.factionId === factionRow) return owner.id;
    return undefined;
  };

  /** 받는 나라가 실제로 줄 수 있는 지원금(국고가 모자라면 있는 만큼, [임시] 질문 845) */
  const grantPayable = (treasury: number, asked: bigint): bigint => {
    if (asked <= 0n) return 0n;
    const available = ledger.balanceOf(treasury, ASSET_CREDIT);
    if (available <= 0n) return 0n;
    return asked < available ? asked : available;
  };

  /** 건물이 띄운 2차맵에 서 있나 */
  const standing = (buildingId: number): boolean => {
    for (const map of o.maps.values()) if (map.buildingOwner(buildingId) !== undefined) return true;
    return false;
  };

  /** 행정 건물 → 도시·받는 나라(소유 주체·세력 행·코드). 아니면 undefined */
  const hallOf = (runtime: CitizenshipRuntime, buildingId: number) => {
    const record = o.facilities.service.facilities.get(buildingId);
    if (!record || record.facilityId !== GOVERNMENT_FACILITY || record.cityId === null) return undefined;
    if (!standing(buildingId)) return undefined;
    const city = runtime.world.cities.get(record.cityId);
    if (!city) return undefined;
    const factionRow = o.owners.get(city.owner)?.factionId ?? null;
    const faction = runtime.world.factions.get(city.owner);
    return {
      cityId: city.id,
      treasury: city.owner,
      factionRow,
      code: faction?.code ?? null,
      alive: faction?.alive ?? false,
    };
  };

  const nationView = (runtime: CitizenshipRuntime, factionRow: number): NaturalizationNation => {
    const treasury = treasuryOf(factionRow);
    const code = treasury === undefined ? null : (runtime.world.factions.get(treasury)?.code ?? null);
    return { id: factionRow, code, name: code === null ? null : (o.nationName?.(code) ?? null) };
  };

  /** 사이보그 본체 유닛(띄운 2차맵 어디든) */
  const bodyInfo = (unitId: number) => {
    for (const map of o.maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info;
    }
    return undefined;
  };

  /**
   * 신청을 막는 까닭(값·잔고 앞의 것만). 같은 나라 → 가문원 → 받을 수 없는 나라 → 잡힘 → 그 도시에 없음 → 쉬는 날 차례(화면이 첫 까닭
   * 하나를 보인다)
   */
  const blockOf = (
    record: CyborgRecord,
    hall: NonNullable<ReturnType<typeof hallOf>>,
    at: number,
  ): Exclude<NaturalizationBlock, "insufficient_funds"> | null => {
    if (hall.factionRow === record.factionId) return "same_nation";
    if (o.inHouse?.(record.userId) === true) return "in_house";
    if (hall.factionRow === null || !hall.alive || !o.cyborgs.joinable(hall.factionRow))
      return "not_joinable";
    const held = record.unitId === null ? null : (bodyInfo(record.unitId)?.condition.heldBy ?? null);
    if (held !== null) return "captive";
    if (record.unitId === null || unitCity(o.maps, o.facilities, record.unitId, at) !== hall.cityId)
      return "wrong_city";
    const until = restUntil(record, o.cyborgs.naturalizationRules(hall.factionRow ?? undefined).restMs);
    if (until !== null && at < until) return "resting";
    return null;
  };

  return {
    async terms(viewer, buildingId, nowMs) {
      const empty = (status: NaturalizationResponse["status"]): NaturalizationResponse => ({
        status,
        buildingId,
        terms: null,
        generatedAt: nowMs,
      });
      const runtime = o.runtime();
      if (!o.ready() || !runtime) return empty("not_ready");
      const hall = hallOf(runtime, buildingId);
      if (!hall) {
        const record = o.facilities.service.facilities.get(buildingId);
        return empty(record && standing(buildingId) ? "not_government" : "unknown_building");
      }
      // 모르는 도시의 건물은 없는 건물과 같은 답(정부 판과 같은 안개)
      if (o.knownCityIds && !(await o.knownCityIds(viewer)).has(hall.cityId))
        return empty("unknown_building");
      const record = o.cyborgs.record(viewer.id);
      if (!record) return empty("no_cyborg");
      const rules = o.cyborgs.naturalizationRules(hall.factionRow ?? undefined);
      const asked = splitTerms(rules.fee);
      const fee = asked.fee;
      const grant = grantPayable(hall.treasury, asked.grant);
      const ownerId = o.settlement.findOwnerOfUser(viewer.id);
      const balance = ownerId === undefined ? 0n : ledger.balanceOf(ownerId, ASSET_CREDIT);
      const until = restUntil(record, rules.restMs);
      const blocked: NaturalizationBlock | null =
        blockOf(record, hall, nowMs) ?? (balance < fee ? "insufficient_funds" : null);
      const hostile = hostileTo(runtime, treasuryOf(record.factionId), hall.treasury);
      const before = o.cyborgs.standingOf(viewer.id, record.factionId);
      const drop = standingDropOf(hostile, rules);
      const standingView: NaturalizationStanding = {
        now: before,
        drop,
        after: Math.max(RELATION_SCORE_MIN, before - drop),
        hostile,
      };
      return {
        status: "ready",
        buildingId,
        terms: {
          target:
            hall.factionRow === null
              ? {
                  id: 0,
                  code: hall.code,
                  name: hall.code === null ? null : (o.nationName?.(hall.code) ?? null),
                }
              : nationView(runtime, hall.factionRow),
          current: nationView(runtime, record.factionId),
          cityId: hall.cityId,
          fee: String(fee),
          grant: String(grant),
          cost: String(fee - grant),
          balance: String(balance),
          standing: standingView,
          targetStanding: hall.factionRow === null ? 0 : o.cyborgs.standingOf(viewer.id, hall.factionRow),
          restMs: rules.restMs,
          restUntilMs: until !== null && nowMs < until ? until : null,
          blocked,
        },
        generatedAt: nowMs,
      };
    },
    async change(userId, input) {
      const runtime = o.runtime();
      if (!o.ready() || !runtime) return fail("busy");
      const record = o.cyborgs.record(userId);
      if (!record) return fail("no_cyborg");
      const ownerId = o.settlement.findOwnerOfUser(userId);
      if (ownerId === undefined) return fail("no_cyborg");
      const hall = hallOf(runtime, input.buildingId);
      if (!hall) return fail("not_government");
      const at = o.now();
      const blocked = blockOf(record, hall, at);
      if (blocked) return fail(blocked);
      // 여기부터 hall.factionRow는 받을 수 있는 나라다(blockOf가 null을 not_joinable로 막았다)
      const target = hall.factionRow;
      if (target === null) return fail("not_joinable");
      // 이 명령은 시작할 때 받은 설정 칸 값 한 벌만 쓴다(기다림 없이 커밋까지 한 번의 동기 처리)
      const rules = o.cyborgs.naturalizationRules(target);
      const asked = splitTerms(rules.fee);
      const fee = asked.fee;
      const grant = grantPayable(hall.treasury, asked.grant);
      if (input.factionId !== target || input.cost !== String(fee - grant)) return fail("terms_changed");
      if (ledger.balanceOf(ownerId, ASSET_CREDIT) < fee) return fail("insufficient_funds");
      const hostile = hostileTo(runtime, treasuryOf(record.factionId), hall.treasury);
      const standingDrop = standingDropOf(hostile, rules);
      // 한 번의 동기 처리: 원장 거래(입회비 → 받는 나라 국고, 또는 지원금 ← 받는 나라 국고. 옛 나라에는 없음) → 사이보그 행·가입·우호도·기록
      const entries: { account: number; amount: bigint }[] = [];
      if (fee > 0n) {
        entries.push({ account: ledger.ownerAccount(ownerId, ASSET_CREDIT), amount: -fee });
        entries.push({ account: ledger.ownerAccount(hall.treasury, ASSET_CREDIT), amount: fee });
      }
      if (grant > 0n) {
        entries.push({ account: ledger.ownerAccount(hall.treasury, ASSET_CREDIT), amount: -grant });
        entries.push({ account: ledger.ownerAccount(ownerId, ASSET_CREDIT), amount: grant });
      }
      if (entries.length > 0)
        ledger.post({
          kind: "nationality_change",
          atMs: at,
          key: `nationality_change:${userId}:${at}`,
          entries,
        });
      o.cyborgs.changeNation(userId, {
        factionId: target,
        cityId: hall.cityId,
        buildingId: input.buildingId,
        atMs: at,
        fee,
        grant,
        standingDrop,
        hostile,
      });
      await writer.durable();
      return {
        ok: true,
        factionId: target,
        cityId: hall.cityId,
        paid: String(fee),
        granted: String(grant),
        standingDrop,
        hostile,
        nextAtMs: at + Math.max(0, rules.restMs),
      };
    },
  };
}
