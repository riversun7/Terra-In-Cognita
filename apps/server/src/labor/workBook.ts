// 유닛 직무 장부(서버) — docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산", 기획 D-506·D-507·60_UX §7.1 ③(첫 유닛 고용·직무 배치)
// 노동 계약 서비스(service.ts)가 들고 쓴다. 하는 일:
// - 직무 배치: 내 유닛을 내 채집 시설(다 지은 farm·lumber_camp·mine 등, 팩 gather가 있는 시설)에 돈 없이 둔다(질문 521). 자리 수 = 시설
//   레벨 × 레벨당 자리(팩 slotsPerLevel, 직무 배치 + 열린 노동 계약을 함께 센다). 산출은 그 건물 창고(사업장 창고)로 간다(D-569 1784 — 예전에는
//   그 건물이 선 도시의 내 도시 창고).
// - 채집 산출: 채집 시설에서 일한 주기(직무 배치·노동 계약 work 구간)를 시험 광석 대신 진짜 물건으로 바꾸는 산출 구간(goods)을 만든다
//   (gatherWork.ts, 시뮬과 같은 규칙 함수). 쌓인 진행·묶음 차례는 unit_work 줄에 남긴다(work.ts).
// - 직무 켜기·끄기: 일을 시작하면(배치·계약) 유닛 직무를 채집(JOB_GATHER)으로, 일이 끝나면 직무 없음(JOB_NONE)으로 바꾼다(@terra/sim
//   switchJob — 피로·단계 그대로, 진행 0). 직무 없는 동안은 정산이 쉬게 해 피로가 시간만큼 풀린다(D-430 회복 꼴, 기획 정리 D-518 525 ① —
//   다시 배치해도 피로가 지워지지 않는다). 정산 뒤 고리에서 일이 없는 플레이어 유닛의 직무를 끈다.
// - 임대형 상한(523 ②): 임대형 임차인 몫(그 건물 창고)은 그 건물 창고 상한까지만 쌓인다(leaseRooms — 정산 하나 안에서 함께 줄이는 남은 자리).
//   넘친 물건은 나오지 않는다(묶음 진행은 쓴다, 확인 대기 질문 580). 임금형·직무 배치는 채집소 고리가 없으면 상한이 없다(질문 411).
// - 사라짐: 유닛·시설이 사라지거나 주인이 바뀌거나 유닛이 일을 멈추면(비활성·수호신) 다음 정산에서 배치를 푼다(그 구간 산출 없음).
// - 채집소(사용자 지적 2026-11-08 "원자재채집소의 기능도 필요", gather/station.ts가 고리를 잇는다): 채집 시설이면 레벨 수확 버프를 곱하고, 산출은
//   그 건물 창고(채집소 창고, 상한 = 팩 storageKg × 레벨 — 모든 몫이 함께 쓴다)로 간다. 반경 안 원자재 오브젝트를 맡는 시설(벌목장·광산)은 묶음마다
//   반경 안 오브젝트 번수를 하나씩 쓴다(없으면 그 묶음을 끝내지 못한다 — 질문 664 ②). 오브젝트가 없는 농장도 창고·버프를 받는다(기획 정리 756 ②).
//   피로 덜기는 정산 뒤 고리(afterSettle)에서 한다. 고리가 없으면(DB 없는 세계·채집 세계 준비 전) 위 직무 배치·임대형 규칙 그대로 낸다.
import type { Primaries, SocietyCoefficients, OutputSegment, GoodsLine } from "@terra/sim";
import { JOB_GATHER, JOB_NONE, TEST_JOB_RULES, switchJob } from "@terra/sim";
import { buildingLocation } from "@terra/shared/goodsPlaces";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { UNIT_KIND_CYBORG, UNIT_KIND_CYBORG_UNIT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { type GatherSite, type LotRoll, gatherLots, gatherSettingsOf } from "./gatherWork.ts";
import { type WorkRecord, workRow } from "./work.ts";

/** 채집 산출 자료(건물 서비스가 잇는다 — facilities/world.ts attachLabor) */
export interface ProductionSource {
  /** 그 건물이 채집 시설이면 그 정의·레벨·도시·자리 수. 아니면(시설 줄 없음·채집 아님) undefined */
  site(buildingId: number): (GatherSite & { readonly slots: number }) | undefined;
  /**
   * 채집이 아닌 일터(병원 — 의사 직무 배치, D-521·docs/adr/2026-11-08-injury.md)면 다 지은 레벨·자리 수. 물건을 내지 않는다(산출 없음).
   * 없으면 채집 시설만 일터
   */
  workplace?(buildingId: number): { readonly level: number; readonly slots: number } | undefined;
  /**
   * 거래소 건물의 거래 직무(기획 D-571 1944 "거래소에 배치, 거래소 개인 창고·거래 물품 관리 역할", docs/adr/2026-11-16-exchange-buildings.md
   * "바뀜 (D-571)")면 다 지은 레벨과 주인마다 자리 수. 남의 거래소에도 둔다(산출 없음 — 주문 한도만 늘린다). 없으면 거래 직무 없음
   */
  tradeDesk?(buildingId: number): { readonly level: number; readonly slots: number } | undefined;
  /** 유닛의 1차 스탯(입은 장비·버프 포함, 공방 장인 실력과 같은 셈 — holdings primariesOf) */
  primaries(unitId: number): Primaries;
  /**
   * 그 건물 창고의 남은 자리(g) = 상한(팩 시설 storageKg × 레벨, N50) − 지금 든 무게(모든 주인). 상한이 없는 건물이면 undefined(임대형 상한,
   * 523 ②). 없으면 상한 없음
   */
  roomGrams?(buildingId: number): bigint | undefined;
  /** 자산 한 기본 단위의 무게(g, 물자가 아니면 0). 없으면 0 */
  weightGrams?(asset: string): bigint;
  /** 그 도시에서 일하는 유닛의 컨디션 합계(관리 보너스, D-534 — labor/condition.ts). 없으면 0 */
  condition?(unitId: number, cityId: number | null): number;
}

/** 정산 하나 안의 건물 창고 남은 자리(임대형 몫 523 ②·채집소 창고): 그 자산 qty 가운데 들어가는 양을 돌려주고 자리를 줄인다 */
export interface LeaseRooms {
  take(buildingId: number, asset: string, qty: bigint): bigint;
  /** 지금 남은 자리(g). 상한이 없는 건물이면 null */
  left(buildingId: number): bigint | null;
}

/** 채집소 고리(gather/station.ts가 잇는다). 없으면 채집 시설은 예전처럼 낸다 */
export interface StationHook {
  /**
   * 그 건물이 채집소(채집 시설 — 오브젝트를 맡는 벌목장·광산, 오브젝트 없는 농장)면 이번 산출 계획, 아니면 undefined.
   * room = 그 건물 창고 남은 자리(g, 정산 하나 안에서 함께 줄인 값). null = 상한 없음
   */
  plan(buildingId: number, unitId: number, room: bigint | null): StationPlan | undefined;
  /** 정산 뒤(그 주체 유닛 직무 상태를 적은 뒤): 채집소 일꾼의 피로를 덜어 준다 */
  afterSettle(ownerId: number): void;
}

/** 채집소 일꾼 하나의 이번 산출 계획 */
export interface StationPlan {
  /** 끝낼 수 있는 묶음 수 상한(반경 안 남은 오브젝트 번수, 창고가 가득이면 0). undefined = 상한 없음(오브젝트 없는 농장, 756 ②) */
  readonly maxLots: number | undefined;
  /**
   * 이번 정산의 k번째 묶음(0부터)이 쓸 오브젝트 규칙(기획 D-552 — 직접 채집과 같은 규칙). 오브젝트를 맡지 않는 채집소(facility)는 없다
   */
  readonly lotRoll?: ((k: number) => LotRoll | undefined) | undefined;
  /** 레벨 수확 버프를 곱한 수량(‰ 나머지는 (유닛, 묶음 차례, 자산)으로 정한 굴림 — 같은 입력이면 같다) */
  scale(asset: string, qty: bigint, seq: number): bigint;
  /** 끝낸 묶음만큼 오브젝트 번수를 쓰고 일꾼 상태·피로 덜기를 적는다 */
  commit(result: {
    readonly made: number;
    readonly lots: number;
    /** 묶음 상한(오브젝트·가득 찬 창고)에 막혔나 */
    readonly capped: boolean;
    /** 창고 자리가 모자라 덜 넣었나 */
    readonly clipped: boolean;
    readonly outputs: readonly { readonly asset: string; readonly qty: bigint }[];
  }): void;
}

/** 산출을 받는 곳: 그 주체의 그 위치 계정(아이템 자산마다) */
export interface GoodsReceiver {
  readonly ownerId: number;
  readonly location: number;
}

/** 플레이어 유닛 종류(직무를 켜고 끄는 대상). 봇·관리자 시험 유닛은 건드리지 않는다 */
const PLAYER_KINDS: ReadonlySet<number> = new Set([UNIT_KIND_CYBORG, UNIT_KIND_HUMAN, UNIT_KIND_CYBORG_UNIT]);

export interface WorkBook {
  attach(source: ProductionSource | undefined): void;
  readonly source: () => ProductionSource | undefined;
  /** 채집소 고리를 잇는다(gather/station.ts) */
  attachStation(hook: StationHook | undefined): void;
  readonly station: () => StationHook | undefined;
  /** 유닛이 직무 배치된 시설(없으면 undefined) */
  assignedTo(unitId: number): number | undefined;
  /** 그 시설에 직무 배치된 유닛(ID 차례) */
  assignedAt(buildingId: number): number[];
  /** 그 주체의 직무 배치 줄(유닛 ID 차례) */
  assignmentsOf(ownerId: number): WorkRecord[];
  /** 채집 시설이면 산출이 도시 창고(임금형·배치) 또는 건물 창고(임대형)로 가는 물건 구간 칸(goods). 채집 시설이 아니면 undefined */
  goodsFor(
    unitId: number,
    workerOwnerId: number,
    buildingId: number,
    receiver: (site: GatherSite) => GoodsReceiver,
    /** 임대형 몫이면 그 건물 창고 남은 자리(넘친 물건은 나오지 않는다). 없으면 상한 없음 */
    rooms?: LeaseRooms,
    /** 정산 하나에 함께 쓰는 건물 창고 남은 자리(채집소면 몫에 상관없이 그 건물 창고 상한을 쓴다) */
    shared?: LeaseRooms,
  ): OutputSegment["goods"];
  /** 정산 하나에 쓰는 건물 창고 남은 자리(처음 물을 때 원장에서 센다) */
  leaseRooms(): LeaseRooms;
  /** 직무 배치를 만든다(검사는 부르는 쪽, 정산 뒤에 부른다) */
  assign(unitId: number, ownerId: number, buildingId: number, atMs: number): void;
  /** 직무 배치를 푼다(정산 뒤에 부른다). 풀었으면 true */
  unassign(unitId: number, atMs: number): boolean;
  /** 유닛 직무를 채집으로 켠다(피로·단계 그대로, 진행 0) */
  startJob(unitId: number): void;
  /** 일이 없는 그 주체의 플레이어 유닛 직무를 끈다(정산 뒤 고리) */
  stopIdle(ownerId: number, working: (unitId: number) => boolean): void;
  /** 메모리 불변 조건: 배치된 유닛에 열린 계약이 있으면 안 된다 */
  check(openContract: (unitId: number) => boolean): string[];
}

export function createWorkBook(options: {
  readonly loaded: readonly WorkRecord[];
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  readonly rules: () => SocietyCoefficients;
  readonly now: () => number;
}): WorkBook {
  const { maps, ledger, writer } = options;
  const records = new Map<number, WorkRecord>(options.loaded.map((record) => [record.unitId, { ...record }]));
  let production: ProductionSource | undefined;
  let station: StationHook | undefined;
  const save = (record: WorkRecord): void => writer.upsert("unitWork", workRow(record));
  const recordOf = (unitId: number, ownerId: number): WorkRecord => {
    let record = records.get(unitId);
    if (!record) {
      record = {
        unitId,
        ownerId,
        buildingId: null,
        assignedAtMs: null,
        gatherBuildingId: null,
        gatherPoints: 0,
        gatherSeq: 0,
        updatedAtMs: options.now(),
      };
      records.set(unitId, record);
    }
    return record;
  };
  /** 유닛과 그 2차맵·지금 직무·종류 */
  const unitOf = (unitId: number) => {
    for (const map of maps.values()) {
      const info = map.unitInfo(unitId);
      if (!info) continue;
      let job: { job: number; phase: number; progressMs: number; fatigue: number } | undefined;
      map.forEachUnit((unit) => {
        if (unit.id === unitId) job = unit.job;
      });
      return { map, kind: info.kind, ownerId: info.ownerId, job };
    }
    return undefined;
  };

  return {
    attach(source) {
      production = source;
    },
    source: () => production,
    attachStation(hook) {
      station = hook;
    },
    station: () => station,
    assignedTo: (unitId) => records.get(unitId)?.buildingId ?? undefined,
    assignedAt(buildingId) {
      const out: number[] = [];
      for (const record of records.values()) if (record.buildingId === buildingId) out.push(record.unitId);
      return out.toSorted((a, b) => a - b);
    },
    assignmentsOf(ownerId) {
      return [...records.values()]
        .filter((record) => record.buildingId !== null && record.ownerId === ownerId)
        .toSorted((a, b) => a.unitId - b.unitId);
    },
    leaseRooms() {
      const left = new Map<number, bigint | null>();
      const roomOf = (buildingId: number): bigint | null => {
        if (!left.has(buildingId)) left.set(buildingId, production?.roomGrams?.(buildingId) ?? null);
        return left.get(buildingId) ?? null;
      };
      return {
        take(buildingId, asset, qty) {
          const weight = production?.weightGrams?.(asset) ?? 0n;
          if (qty <= 0n || weight <= 0n) return qty;
          const room = roomOf(buildingId);
          if (room === null) return qty;
          const fits = room / weight < qty ? room / weight : qty;
          left.set(buildingId, room - fits * weight);
          return fits;
        },
        left: roomOf,
      };
    },
    goodsFor(unitId, workerOwnerId, buildingId, receiver, rooms, shared) {
      const site = production?.site(buildingId);
      if (!site || !production) return undefined;
      const source = production;
      return (made: number): GoodsLine[] => {
        const record = recordOf(unitId, workerOwnerId);
        // 다른 시설에서 쌓은 진행은 이 시설로 옮기지 않는다(묶음 차례는 이어 간다)
        if (record.gatherBuildingId !== buildingId) {
          record.gatherBuildingId = buildingId;
          record.gatherPoints = 0;
        }
        // 채집소면 창고 자리(벌목장·광산은 반경 안 오브젝트 번수도)로 묶음 수를 막고 산출을 채집소 창고로(몫에 상관없이 그 건물 창고 상한)
        const limit = rooms ?? shared;
        const plan = station?.plan(buildingId, unitId, limit ? limit.left(buildingId) : null);
        const result = gatherLots({ points: record.gatherPoints, seq: record.gatherSeq }, made, {
          unitId,
          site,
          primaries: source.primaries(unitId),
          settings: gatherSettingsOf(options.rules()),
          cycleMs: TEST_JOB_RULES.cycleMs,
          maxLots: plan?.maxLots,
          lotRoll: plan?.lotRoll,
          condition: source.condition?.(unitId, site.cityId),
        });
        record.gatherPoints = result.points;
        record.gatherSeq = result.seq;
        record.updatedAtMs = options.now();
        save(record);
        const given = receiver(site);
        const to = plan ? { ownerId: given.ownerId, location: buildingLocation(buildingId) } : given;
        const cap = plan ? limit : rooms;
        const lines: GoodsLine[] = [];
        const placed: { asset: string; qty: bigint }[] = [];
        let clipped = false;
        for (const stack of result.outputs) {
          const scaled = plan ? plan.scale(stack.asset, stack.qty, result.seq) : stack.qty;
          // 임대형 몫·채집소 창고는 건물 창고 상한까지만(넘친 양은 나오지 않는다)
          const qty = cap ? cap.take(buildingId, stack.asset, scaled) : scaled;
          if (qty < scaled) clipped = true;
          if (qty <= 0n) continue;
          placed.push({ asset: stack.asset, qty });
          lines.push({
            source: ledger.systemAccount(`source:${stack.asset}`, stack.asset),
            account: ledger.ownerAccount(to.ownerId, stack.asset, to.location),
            qty,
          });
        }
        plan?.commit({ made, lots: result.lots, capped: result.capped, clipped, outputs: placed });
        return lines;
      };
    },
    assign(unitId, ownerId, buildingId, atMs) {
      const record = recordOf(unitId, ownerId);
      record.ownerId = ownerId;
      record.buildingId = buildingId;
      record.assignedAtMs = atMs;
      record.updatedAtMs = atMs;
      save(record);
    },
    unassign(unitId, atMs) {
      const record = records.get(unitId);
      if (!record || record.buildingId === null) return false;
      record.buildingId = null;
      record.assignedAtMs = null;
      record.updatedAtMs = atMs;
      save(record);
      return true;
    },
    startJob(unitId) {
      const unit = unitOf(unitId);
      if (!unit?.job || unit.job.job === JOB_GATHER) return;
      unit.map.setJob(unitId, switchJob(unit.job, JOB_GATHER));
    },
    stopIdle(ownerId, working) {
      for (const map of maps.values())
        map.forEachUnit((unit) => {
          if (unit.ownerId !== ownerId || unit.job.job === JOB_NONE || !PLAYER_KINDS.has(unit.kind)) return;
          if (working(unit.id)) return;
          // 피로·단계는 그대로: 직무 없는 동안 정산이 쉬게 해 시간만큼 푼다(525 ①)
          map.setJob(unit.id, switchJob(unit.job, JOB_NONE));
        });
    },
    check(openContract) {
      const issues: string[] = [];
      for (const record of records.values())
        if (record.buildingId !== null && openContract(record.unitId))
          issues.push(
            `unit ${record.unitId}: assigned to building ${record.buildingId} and has an open labor contract`,
          );
      return issues;
    },
  };
}

/**
 * 임금형·직무 배치 산출이 가는 곳: 그 건물 창고(사업장 창고 — 주인 몫). 바뀜 (기획 D-569 1784 "거래소 반입은 실제 운반만 — 우회 길 없음",
 * D-555 1505 "운영 자금·재료는 건물마다의 창고·금고"): 예전에는 채집소 고리가 없으면(DB 없는 세계·채집 세계 준비 전) 그 도시의 도시 창고로 바로
 * 갔다. 이제 늘 그 건물 창고로 가고, 거기서 판매(business_buy)·운반꾼으로만 나간다
 */
export function businessReceiver(ownerId: number): (site: GatherSite) => GoodsReceiver {
  return (site) => ({ ownerId, location: buildingLocation(site.buildingId) });
}

/** 임대형 임차인 몫이 가는 곳: 그 건물 창고(창고·직무 줄기 규칙, 유예 뒤 시설 주인 것이 된다) */
export function buildingReceiver(ownerId: number): (site: GatherSite) => GoodsReceiver {
  return (site) => ({ ownerId, location: buildingLocation(site.buildingId) });
}
