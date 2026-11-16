// NPC 운반꾼의 실제 화물 — 기획 D-555 1505(사용자 원문 "자동운반이란 어떤 유닛이든 실제로 옮겨야한다"), D-564 1626("보이는게 원칙"), 기획 대조 2052·2088
// (D-573 기술 전달), docs/adr/2026-11-15-business-ledger.md "바뀜 (D-573)". 운반 일 하나 = 어느 자리(from)의 물건을 다른 자리(to)로 [fromMs, untilMs)에 나르는 것.
// - 보는 사람이 있는 2차맵(humanPlaces.ts가 운반꾼을 정해 알려 준다 — load): 그 휴먼이 물건을 실제로 진다(원장 from → 유닛 화물 위치, 주인 = 그 세력). 화물은
//   조우·전투에서 약탈 대상이다(world/battleResults.ts — 진 유닛의 화물). 닿으면(finish) 화물에 남은 만큼 to로 내려놓는다(빼앗긴 만큼은 닿지 않는다).
// - 보지 않는 2차맵(운반꾼을 정하지 않음): 시간 셈 — 물건은 from에 있다가 닿는 시각에 남은 만큼 to로 옮긴다(D-564 1626 "부하가 크면 시간 계산").
// - 일꾼 운반(worker = 도시 경제 시설 ID): 그 시설 첫 일꾼이 나른다(시설 산출 → 창고, npcDelivery). 빈 일꾼 운반(worker 없음): 일 없는 휴먼이 나른다(도시 창고 →
//   거래소 건물, market/npcHaul.ts).
// - 일은 메모리다. 다시 켜면 잊는다: 시설 창고에 남은 NPC 물건은 켤 때 훑어 그 도시 창고로 보낸다(npcDelivery.ts sweep). 화물에 실린 채 다시 켜면 그 화물은
//   운반꾼에게 남는다(잃지 않는다 — 미검증·TODO: 켤 때 NPC 휴먼 화물 돌려놓기).
// 정수·BigInt만 쓴다.
import { cargoLocation } from "@terra/shared/goodsPlaces";
import type { LedgerBook } from "@terra/sim";

/** 물건 줄(자산 → 기본 단위 수) */
export interface CarryStack {
  readonly asset: string;
  readonly qty: bigint;
}

/** 운반 일 하나 */
export interface CarryJob {
  /** 열쇠(일꾼 운반 f:<번호>, 빈 일꾼 운반 x:<번호>) */
  readonly key: string;
  readonly cityId: number;
  /** 물건 주인(NPC 세력 주체) */
  readonly owner: number;
  readonly stacks: readonly CarryStack[];
  /** 출발 자리(원장 위치) */
  readonly from: number;
  /** 도착 자리(원장 위치) */
  readonly to: number;
  /** 내려놓는 곳(2차맵 칸 — 창고·거래소 건물 가운데) */
  readonly x: number;
  readonly y: number;
  readonly fromMs: number;
  readonly untilMs: number;
  /** 일꾼 운반이면 도시 경제 시설 ID(그 시설 첫 일꾼이 나른다). 없으면 일 없는 휴먼 */
  readonly worker?: number | undefined;
}

export interface CarryBoard {
  /** 일을 건다(열쇠가 겹치면 바꾼다) */
  post(job: CarryJob): void;
  /** 운반꾼을 정했다(humanPlaces.ts — 보는 2차맵만): 아직 싣지 않았고 일하는 때면 from의 물건을 그 유닛 화물로 싣는다. 실었으면 true */
  load(key: string, unitId: number, nowMs: number): boolean;
  /** 닿았다: 화물(실었으면)·from(아니면)에 남은 만큼 to로 옮기고 일을 지운다. 옮긴 물건 */
  finish(key: string, nowMs: number): CarryStack[];
  /** 그 시설의 지금 일꾼 운반(없으면 undefined) */
  ofWorker(facilityId: number, nowMs: number): CarryJob | undefined;
  /** 그 도시의 빈 일꾼 운반(아직 닿지 않은 것, 열쇠 차례) */
  idle(cityId: number, nowMs: number): CarryJob[];
  /** 실은 운반꾼(없으면 undefined) */
  carrierOf(key: string): number | undefined;
  /** 아직 싣지 않은 일을 옮기지 않고 지운다(실었으면 그대로 두고 false — 끝까지 간다) */
  drop(key: string): boolean;
  readonly pending: () => number;
}

export function createCarryBoard(ledger: LedgerBook): CarryBoard {
  const jobs = new Map<string, CarryJob>();
  const carriers = new Map<string, number>();
  const busy = new Set<number>();
  /** 원장 옮기기(있는 만큼). 옮긴 양 */
  const move = (
    owner: number,
    asset: string,
    from: number,
    to: number,
    want: bigint,
    atMs: number,
  ): bigint => {
    const have = ledger.balanceOf(owner, asset, from);
    const qty = want < have ? want : have;
    if (qty <= 0n) return 0n;
    ledger.post({
      kind: "npc_carry",
      atMs,
      entries: [
        { account: ledger.ownerAccount(owner, asset, from), amount: -qty },
        { account: ledger.ownerAccount(owner, asset, to), amount: qty },
      ],
    });
    return qty;
  };
  return {
    post(job) {
      jobs.set(job.key, job);
    },
    load(key, unitId, nowMs) {
      const job = jobs.get(key);
      if (!job || carriers.has(key) || busy.has(unitId) || nowMs >= job.untilMs) return false;
      const at = cargoLocation(unitId);
      let any = false;
      for (const stack of job.stacks)
        if (move(job.owner, stack.asset, job.from, at, stack.qty, nowMs) > 0n) any = true;
      // 실을 것이 없어도(그새 팔림) 운반꾼으로 적어 빈손으로 걷는다
      carriers.set(key, unitId);
      busy.add(unitId);
      return any;
    },
    finish(key, nowMs) {
      const job = jobs.get(key);
      if (!job) return [];
      jobs.delete(key);
      const unitId = carriers.get(key);
      carriers.delete(key);
      if (unitId !== undefined) busy.delete(unitId);
      const from = unitId === undefined ? job.from : cargoLocation(unitId);
      const out: CarryStack[] = [];
      for (const stack of job.stacks) {
        const qty = move(job.owner, stack.asset, from, job.to, stack.qty, nowMs);
        if (qty > 0n) out.push({ asset: stack.asset, qty });
      }
      return out;
    },
    ofWorker(facilityId, nowMs) {
      for (const job of jobs.values())
        if (job.worker === facilityId && nowMs < job.untilMs && nowMs >= job.fromMs) return job;
      return undefined;
    },
    idle(cityId, nowMs) {
      return [...jobs.values()]
        .filter((job) => job.cityId === cityId && job.worker === undefined && nowMs < job.untilMs)
        .toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    },
    carrierOf: (key) => carriers.get(key),
    drop(key) {
      if (carriers.has(key)) return false;
      return jobs.delete(key);
    },
    pending: () => jobs.size,
  };
}
