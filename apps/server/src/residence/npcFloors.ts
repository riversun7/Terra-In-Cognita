// NPC 집주인의 층 올리기 — 기획 검토 2762(fixes-1117k, D-555 1509 "똑같이 한다니까 … NPC만으로도 그대로 똑같이 시스템이 돌아간다"). fixes-1117j의 "NPC는 층을
// 올리지 않는다"[임시 2762 가]를 바꾼다. docs/adr/2026-11-15-business-ledger.md "바뀜 (fixes-1117k)".
// - 같은 길: 플레이어 층 올리기 공사(facilities/floors.ts — residence-3, D-591 1)와 같은 재료·시간 표·작업 줄(facility_jobs kind floor)·재료 자리(그 도시 창고·그 도시의
//   NPC 창고 시설 — 건물 서비스 npcJob, NPC 레벨 올리기와 같다). 끝나면 층 + 1(service.ts finish). 견적은 사는 곳 조회와 같은 함수(floorQuote.ts floorQuoteOf).
// - 판단(NPC 투자 판단 틀 — @terra/sim npc/invest.ts, D-587 8 "재료나 소모비용, 기대 수익, 수요 등 경제적 이점이 있을 때", D-323 성향 규칙식) — 서버만(시뮬에는 사는 곳이
//   없다 — SIM 판정 그대로):
//   1) 수요: 그 숙소에 사는 유닛(고른 집 + 숙소 배정 — book.occupants)이 정원(층 × 설정 칸) × npc_floor_demand_pm ÷ 1000 이상. 수요가 없으면 올리지 않는다.
//   2) 비용 몫·성향: 수요가 있으면 도전 굴림 — 확률 = (국고 ÷ 재료 값 − 1배) × npc_invest_challenge_step_pm, 상한 npc_invest_challenge_max_pm, × 상업 성향 배율(500~1500‰,
//      investTemperedChallengePm). 재료 값 = 그 도시 시장 기준값(@terra/sim materialsValue — NPC 레벨 올리기와 같은 값), 국고 = 그 나라 화폐 잔고.
//      층은 산출이 없는 투자라 기대 수익 문(investPays)은 거치지 않는다. 훑기마다(1분) 다시 굴린다 — 국고가 재료 값보다 넉넉할수록·상업 성향이 높을수록 빨리 올린다.
//   [임시] 모양·수치는 기술 기본값(질문 2772). 끄기: npc_floor_mode 0.
// - 한 건물에 작업이 걸려 있으면(짓기·레벨 올리기·수리·층) 건너뛴다(견적 block — job_running). 최고 층·다 짓지 않음도 견적 block으로 건너뛴다.
// 정수·BigInt만 쓴다.
import type { ResidenceFloorQuote } from "@terra/shared/residence";

/** NPC 층 올리기 규칙(설정 칸 — @terra/sim BusinessCoefficients의 같은 이름 칸) */
export interface NpcFloorRules {
  readonly npcFloorMode?: number | undefined;
  readonly npcFloorDemandPm?: number | undefined;
}

/** 설정 칸이 없을 때(옛 팩) 값 — [임시] 기술 기본값 */
export const NPC_FLOOR_DEFAULTS = { mode: 1, demandPm: 1000 } as const;

const int = (value: number | undefined, fallback: number): number =>
  value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, Math.trunc(value));

/** 수요가 있나: 사는 유닛 × 1000 ≥ 정원 × 문턱(정원 0이면 없음) */
export function npcFloorDemand(occupants: number, capacity: number, rules: NpcFloorRules): boolean {
  if (capacity <= 0) return false;
  const pm = int(rules.npcFloorDemandPm, NPC_FLOOR_DEFAULTS.demandPm);
  return Math.max(0, Math.trunc(occupants)) * 1000 >= capacity * pm;
}

/** NPC 세계 몫(npcRentWorld.ts가 NPC 런타임으로 만든다) */
export interface NpcFloorWorld {
  /** NPC 세력인가(플레이어 가문 세력이면 false — 가문 건물 층은 가문장이 올린다) */
  isNpcOwner(owner: number): boolean;
  /** 그 세력 국고(나라 화폐 잔고) */
  capitalOf(owner: number): bigint;
  /** 재료 값(그 도시 시장 기준값 — @terra/sim materialsValue) */
  materialsValue(
    cityId: number,
    materials: readonly { readonly item: string; readonly qty: number }[],
  ): bigint;
  /** 도전 확률(‰ — 재료 값·국고·그 세력 상업 성향, @terra/sim investTemperedChallengePm) */
  challengePm(owner: number, cost: bigint, capital: bigint): number;
}

/** 건물 하나의 사실(사는 곳 세계 — book.ts ResidenceWorld.building) */
export interface NpcFloorBuilding {
  readonly ownerId: number | null;
  readonly cityId: number | null;
  readonly living: boolean;
  readonly level: number;
  readonly capacity: number;
}

/** 훑기 한 번 결과 */
export interface NpcFloorSweep {
  /** 수요가 있던 숙소 수 */
  readonly demand: number;
  /** 층 공사를 건 수 */
  readonly started: number;
}

export function createNpcFloors(o: {
  buildingIds(): Iterable<number>;
  building(buildingId: number): NpcFloorBuilding | undefined;
  occupants(buildingId: number): number;
  /** 그 주인의 층 올리기 견적(floorQuote.ts — 남의 건물·주거 건물 아님이면 null) */
  quote(buildingId: number, ownerId: number): ResidenceFloorQuote | null;
  /** 층 공사를 건다(건물 서비스 npcJob kind floor). 걸었으면 true */
  start(input: {
    readonly ownerId: number;
    readonly buildingId: number;
    readonly materials: readonly { readonly item: string; readonly qty: number }[];
    readonly ms: number;
  }): boolean;
  npc(): NpcFloorWorld | undefined;
  rules(): NpcFloorRules;
  /** 0 이상 정수 굴림(서버 난수 — 시험은 고정 값) */
  roll(): number;
}): { sweep(nowMs: number): NpcFloorSweep } {
  return {
    sweep() {
      const npc = o.npc();
      const rules = o.rules();
      if (!npc || int(rules.npcFloorMode, NPC_FLOOR_DEFAULTS.mode) !== 1) return { demand: 0, started: 0 };
      let demand = 0;
      let started = 0;
      for (const buildingId of [...o.buildingIds()].toSorted((a, b) => a - b)) {
        const facts = o.building(buildingId);
        if (!facts?.living || facts.ownerId === null || facts.cityId === null || facts.level < 1) continue;
        if (!npc.isNpcOwner(facts.ownerId)) continue;
        if (!npcFloorDemand(o.occupants(buildingId), facts.capacity, rules)) continue;
        const quote = o.quote(buildingId, facts.ownerId);
        if (!quote || quote.block !== null) continue;
        demand += 1;
        const materials = quote.materials.map((stack) => ({ item: stack.item, qty: stack.qty }));
        const cost = npc.materialsValue(facts.cityId, materials);
        const chance = npc.challengePm(facts.ownerId, cost, npc.capitalOf(facts.ownerId));
        if (Math.abs(Math.trunc(o.roll())) % 1000 >= chance) continue;
        if (o.start({ ownerId: facts.ownerId, buildingId, materials, ms: quote.timeMs })) started += 1;
      }
      return { demand, started };
    },
  };
}
