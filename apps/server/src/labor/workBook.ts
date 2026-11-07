// 유닛 직무 장부(서버) — docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산", 기획 D-506·D-507·60_UX §7.1 ③(첫 유닛 고용·직무 배치)
// 노동 계약 서비스(service.ts)가 들고 쓴다. 하는 일:
// - 직무 배치: 내 유닛을 내 채집 시설(다 지은 farm·lumber_camp·mine 등, 팩 gather가 있는 시설)에 돈 없이 둔다(질문 521). 자리 수 = 시설
//   레벨 × 레벨당 자리(팩 slotsPerLevel, 직무 배치 + 열린 노동 계약을 함께 센다). 산출은 그 건물이 선 도시의 내 도시 창고(도시가 없으면 그
//   건물 창고)로 간다.
// - 채집 산출: 채집 시설에서 일한 주기(직무 배치·노동 계약 work 구간)를 시험 광석 대신 진짜 물건으로 바꾸는 산출 구간(goods)을 만든다
//   (gatherWork.ts, 시뮬과 같은 규칙 함수). 쌓인 진행·묶음 차례는 unit_work 줄에 남긴다(work.ts).
// - 직무 켜기·끄기: 일을 시작하면(배치·계약) 유닛 직무를 채집(JOB_GATHER)으로, 일이 끝나면 직무 없음(JOB_NONE)으로 바꾼다. 피로·단계는
//   그대로 둔다(배치를 다시 해 피로를 지우지 못하게 [임시]). 정산 뒤 고리에서 일이 없는 플레이어 유닛의 직무를 끈다.
// - 사라짐: 유닛·시설이 사라지거나 주인이 바뀌거나 유닛이 일을 멈추면(비활성·수호신) 다음 정산에서 배치를 푼다(그 구간 산출 없음).
import type { Primaries, SocietyCoefficients, OutputSegment, GoodsLine } from "@terra/sim";
import { JOB_GATHER, JOB_NONE, TEST_JOB_RULES } from "@terra/sim";
import { buildingLocation, cityLocation } from "@terra/shared/goodsPlaces";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import {
  UNIT_KIND_CYBORG,
  UNIT_KIND_CYBORG_UNIT,
  UNIT_KIND_HUMAN,
  UNIT_KIND_WORKER,
} from "../world/unitKinds.ts";
import { type GatherSite, gatherLots, gatherSettingsOf } from "./gatherWork.ts";
import { type WorkRecord, workRow } from "./work.ts";

/** 채집 산출 자료(건물 서비스가 잇는다 — facilities/world.ts attachLabor) */
export interface ProductionSource {
  /** 그 건물이 채집 시설이면 그 정의·레벨·도시·자리 수. 아니면(시설 줄 없음·채집 아님) undefined */
  site(buildingId: number): (GatherSite & { readonly slots: number }) | undefined;
  /** 유닛의 1차 스탯(입은 장비·버프 포함, 공방 장인 실력과 같은 셈 — holdings primariesOf) */
  primaries(unitId: number): Primaries;
}

/** 산출을 받는 곳: 그 주체의 그 위치 계정(아이템 자산마다) */
export interface GoodsReceiver {
  readonly ownerId: number;
  readonly location: number;
}

/** 플레이어 유닛 종류(직무를 켜고 끄는 대상). 개발 시험 일꾼·봇·관리자 시험 유닛은 건드리지 않는다 */
const PLAYER_KINDS: ReadonlySet<number> = new Set([UNIT_KIND_CYBORG, UNIT_KIND_HUMAN, UNIT_KIND_CYBORG_UNIT]);

export interface WorkBook {
  attach(source: ProductionSource | undefined): void;
  readonly source: () => ProductionSource | undefined;
  /** 유닛이 직무 배치된 시설(없으면 undefined) */
  assignedTo(unitId: number): number | undefined;
  /** 그 시설에 직무 배치된 유닛(ID 차례) */
  assignedAt(buildingId: number): number[];
  /** 그 주체의 직무 배치 줄(유닛 ID 차례) */
  assignmentsOf(ownerId: number): WorkRecord[];
  /** 개발 시험 일꾼인가(계약 밖 구간에 시험 광석을 내는 유닛) */
  isTestWorker(unitId: number): boolean;
  /** 채집 시설이면 산출이 도시 창고(임금형·배치) 또는 건물 창고(임대형)로 가는 물건 구간 칸(goods). 채집 시설이 아니면 undefined */
  goodsFor(
    unitId: number,
    workerOwnerId: number,
    buildingId: number,
    receiver: (site: GatherSite) => GoodsReceiver,
  ): OutputSegment["goods"];
  /** 직무 배치를 만든다(검사는 부르는 쪽, 정산 뒤에 부른다) */
  assign(unitId: number, ownerId: number, buildingId: number, atMs: number): void;
  /** 직무 배치를 푼다(정산 뒤에 부른다). 풀었으면 true */
  unassign(unitId: number, atMs: number): boolean;
  /** 유닛 직무를 채집으로 켠다(피로·단계 그대로) */
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
    isTestWorker(unitId) {
      for (const map of maps.values()) {
        const info = map.unitInfo(unitId);
        if (info) return info.kind === UNIT_KIND_WORKER;
      }
      return false;
    },
    goodsFor(unitId, workerOwnerId, buildingId, receiver) {
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
        const result = gatherLots({ points: record.gatherPoints, seq: record.gatherSeq }, made, {
          unitId,
          site,
          primaries: source.primaries(unitId),
          settings: gatherSettingsOf(options.rules()),
          cycleMs: TEST_JOB_RULES.cycleMs,
        });
        record.gatherPoints = result.points;
        record.gatherSeq = result.seq;
        record.updatedAtMs = options.now();
        save(record);
        const to = receiver(site);
        return result.outputs.map((stack) => ({
          source: ledger.systemAccount(`source:${stack.asset}`, stack.asset),
          account: ledger.ownerAccount(to.ownerId, stack.asset, to.location),
          qty: stack.qty,
        }));
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
      unit.map.setJob(unitId, { ...unit.job, job: JOB_GATHER });
    },
    stopIdle(ownerId, working) {
      for (const map of maps.values())
        map.forEachUnit((unit) => {
          if (unit.ownerId !== ownerId || unit.job.job === JOB_NONE || !PLAYER_KINDS.has(unit.kind)) return;
          if (working(unit.id)) return;
          map.setJob(unit.id, { ...unit.job, job: JOB_NONE });
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

/** 임금형·직무 배치 산출이 가는 곳: 그 건물이 선 도시의 도시 창고(도시가 없으면 그 건물 창고) */
export function cityReceiver(ownerId: number): (site: GatherSite) => GoodsReceiver {
  return (site) => ({
    ownerId,
    location: site.cityId !== null ? cityLocation(site.cityId) : buildingLocation(site.buildingId),
  });
}

/** 임대형 임차인 몫이 가는 곳: 그 건물 창고(창고·직무 줄기 규칙, 유예 뒤 시설 주인 것이 된다) */
export function buildingReceiver(ownerId: number): (site: GatherSite) => GoodsReceiver {
  return (site) => ({ ownerId, location: buildingLocation(site.buildingId) });
}
