// NPC 운반꾼의 실제 화물 — 기획 D-555 1505(사용자 원문 "자동운반이란 어떤 유닛이든 실제로 옮겨야한다"), D-564 1626("보이는게 원칙"), 기획 대조 2052·2088
// (D-573 기술 전달), docs/adr/2026-11-15-business-ledger.md "바뀜 (D-573)". 운반 일 하나 = 어느 자리(from)의 물건을 다른 자리(to)로 나르는 것.
// - 보는 사람이 있는 2차맵(humanPlaces.ts가 운반꾼을 정해 알려 준다 — load): 그 휴먼이 물건을 실제로 진다(원장 from → 유닛 화물 위치, 주인 = 그 세력). 화물은
//   조우·전투에서 약탈 대상이다(world/battleResults.ts — 진 유닛의 화물). 닿으면(finish) 화물에 남은 만큼 to로 내려놓는다(빼앗긴 만큼은 닿지 않는다).
// - 보지 않는 2차맵(운반꾼을 정하지 않음): 시간 셈 — 물건은 from에 있다가 닿는 시각에 남은 만큼 to로 옮긴다(D-564 1626 "부하가 크면 시간 계산").
// - 일꾼 운반(worker = 도시 경제 시설 ID): 그 시설 첫 일꾼이 나른다(시설 산출 → 창고, npcDelivery). 빈 일꾼 운반(worker 없음): 일 없는 휴먼이 나른다(도시 창고 →
//   거래소 건물·거래소 건물 → 도시 창고, market/npcHaul.ts).
// - 바뀜 (기획 대조 2155 — D-555 1505 "자동운반이란 어떤 유닛이든 실제로 옮겨야한다" → 보기 나): 운반꾼이 없으면 기다린다. 운반꾼 수(한꺼번에 나를 수 있는 일
//   수)는 보는지와 상관없이 같다 — 일꾼 운반은 시설마다 하나(앞 운반이 닿아야 다음이 떠난다), 빈 일꾼 운반은 그 도시 휴먼(경비대 빼고, peopleOf) 가운데 지금
//   다른 운반을 지지 않은 수만큼(그 도시의 떠난 일 수를 뺀다). [임시] 일 없는 휴먼만 세면 도시 일꾼 나누기(@terra/sim assignCityWorkers)가 휴먼을 자리 수까지
//   다 쓰는 도시(보통 — 1116m 시험 세계 도시마다 휴먼 30 = 일꾼 30)는 거래소 운반이 영영 서지 않아, 시설 일꾼도 짬을 내 나르는 것으로 셌다(보는 2차맵은 일
//   없는 휴먼 먼저, 모자라면 시설 일꾼이 화물을 진다 — humanPlaces.ts). 기다리는 일은 아직 떠나지 않았다(물건은 출발 자리에 그대로 — 그 동안 누구나 산다).
//   앞 일이 닿으면 그 닿은 시각에 다음 일이 떠나고, 휴먼이 늘면 pump가 띄운다. 그래서 닿는 시각은 보는 2차맵이든 아니든 같다(시간 셈은 "운반꾼이 걸었다면
//   걸렸을 시간"으로만 쓴다). 휴먼이 없는 도시는 짐이 남는다. 예전: 운반꾼이 모자라면 남은 일은 운반꾼 없이 시간 셈으로 바로 떠났다.
// - 떠난 일은 끝까지 간다(판 주문을 거두어도 — 보는지와 상관없이 같은 판정). 기다리는 일만 옮기지 않고 지운다(drop).
// - 일은 메모리다. 다시 켜면 잊는다: 시설 창고에 남은 NPC 물건은 켤 때 훑어 그 도시 창고로 보낸다(npcDelivery.ts sweep). 화물에 실린 채 다시 켜면 그 화물은
//   운반꾼에게 남는다(잃지 않는다 — 미검증·TODO: 켤 때 NPC 휴먼 화물 돌려놓기, 질문 2156).
// 정수·BigInt만 쓴다.
import { cargoLocation } from "@terra/shared/goodsPlaces";
import type { LedgerBook } from "@terra/sim";

/** 물건 줄(자산 → 기본 단위 수) */
export interface CarryStack {
  readonly asset: string;
  readonly qty: bigint;
}

/** 운반 요청(아직 떠나지 않았을 수 있다) */
export interface CarryRequest {
  /** 열쇠(일꾼 운반 f:<번호>, 빈 일꾼 운반 x:<번호>, 돌려보내기 r:<번호>) */
  readonly key: string;
  readonly cityId: number;
  /** 물건 주인(NPC 세력 주체) */
  readonly owner: number;
  readonly stacks: readonly CarryStack[];
  /** 출발 자리(원장 위치) */
  readonly from: number;
  /** 도착 자리(원장 위치) */
  readonly to: number;
  /** 내려놓는 곳(2차맵 칸 — 창고·거래소 건물 가운데·도시 칸) */
  readonly x: number;
  readonly y: number;
  /** 요청 시각(운반꾼이 있으면 이때 떠난다) */
  readonly atMs: number;
  /** 운반꾼이 걸어 나르는 시간(ms, 0 이상) */
  readonly durMs: number;
  /** 일꾼 운반이면 도시 경제 시설 ID(그 시설 첫 일꾼이 나른다). 없으면 일 없는 휴먼 */
  readonly worker?: number | undefined;
  /** 떠날 때 한 번(닿는 시각 예약 — npcDelivery). 기다렸다 떠나면 앞 일이 닿은 때 불린다 */
  readonly onStart?: ((job: CarryJob) => void) | undefined;
}

/** 떠난 운반 일 하나 */
export interface CarryJob extends CarryRequest {
  readonly fromMs: number;
  readonly untilMs: number;
}

export interface CarryBoardOptions {
  /** 그 도시 휴먼 수(경비대 빼고 — 운반꾼이 될 수 있는 사람, 보는지와 상관없는 셈). 없으면 빈 일꾼 운반은 하나씩 */
  readonly peopleOf?: ((cityId: number) => number) | undefined;
}

export interface CarryBoard {
  /** 일을 건다: 운반꾼이 있으면 바로 떠나 닿는 시각, 없으면 undefined(기다림). 열쇠가 겹치면 옛 일을 지운다 */
  post(request: CarryRequest): number | undefined;
  /** 운반꾼을 정했다(humanPlaces.ts — 보는 2차맵만): 떠났고 아직 싣지 않았고 닿기 전이면 from의 물건을 그 유닛 화물로 싣는다. 실었으면 true */
  load(key: string, unitId: number, nowMs: number): boolean;
  /** 닿았다: 화물(실었으면)·from(아니면)에 남은 만큼 to로 옮기고 일을 지운다. 그 줄에서 기다리던 일이 떠난다. 옮긴 물건 */
  finish(key: string, nowMs: number): CarryStack[];
  /** 그 시설의 지금 일꾼 운반(떠난 것, 없으면 undefined) */
  ofWorker(facilityId: number, nowMs: number): CarryJob | undefined;
  /** 그 도시의 빈 일꾼 운반(떠났고 아직 닿지 않은 것, 열쇠 차례) */
  idle(cityId: number, nowMs: number): CarryJob[];
  /** 실은 운반꾼(없으면 undefined) */
  carrierOf(key: string): number | undefined;
  /** 그 일의 닿는 시각(떠난 일), "waiting"(기다림), 없는 일이면 undefined */
  stateOf(key: string): number | "waiting" | undefined;
  /** 기다리는 일을 옮기지 않고 지운다. 떠난 일은 그대로 두고 false(끝까지 간다) */
  drop(key: string): boolean;
  /** 운반꾼이 늘었을 수 있다: 빈 자리만큼 기다리던 빈 일꾼 운반을 지금 띄운다. 띄운 수 */
  pump(nowMs: number): number;
  /** 떠난 일 + 기다리는 일 수 */
  readonly pending: () => number;
  /** 기다리는 일 수(지표·시험) */
  readonly waiting: () => number;
}

/** 운반꾼 줄: 일꾼 운반은 시설마다, 빈 일꾼 운반은 도시마다 */
const laneOf = (request: CarryRequest): string =>
  request.worker === undefined ? `c:${String(request.cityId)}` : `w:${String(request.worker)}`;

export function createCarryBoard(ledger: LedgerBook, options: CarryBoardOptions = {}): CarryBoard {
  const jobs = new Map<string, CarryJob>();
  /** 기다리는 일(건 차례) */
  const queue: CarryRequest[] = [];
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
  /** 그 줄의 자리 수(일꾼 운반 1, 빈 일꾼 운반 = 그 도시 휴먼 − 그 도시 일꾼 운반 중인 사람) */
  const capacity = (request: CarryRequest): number => {
    if (request.worker !== undefined) return 1;
    if (!options.peopleOf) return 1;
    let hauling = 0;
    for (const job of jobs.values())
      if (job.worker !== undefined && job.cityId === request.cityId) hauling += 1;
    return Math.max(0, Math.trunc(options.peopleOf(request.cityId)) - hauling);
  };
  const used = (lane: string): number => {
    let count = 0;
    for (const job of jobs.values()) if (laneOf(job) === lane) count += 1;
    return count;
  };
  const start = (request: CarryRequest, atMs: number): CarryJob => {
    const fromMs = Math.max(atMs, request.atMs);
    const job: CarryJob = { ...request, fromMs, untilMs: fromMs + Math.max(0, request.durMs) };
    jobs.set(job.key, job);
    job.onStart?.(job);
    return job;
  };
  /** 그 줄에 빈 자리가 있는 만큼 기다리던 일을 freedMs에 띄운다 */
  const promote = (lane: string, freedMs: number): number => {
    let started = 0;
    for (let i = 0; i < queue.length; ) {
      const request = queue[i];
      if (!request || laneOf(request) !== lane) {
        i += 1;
        continue;
      }
      if (used(lane) >= capacity(request)) break;
      queue.splice(i, 1);
      start(request, freedMs);
      started += 1;
    }
    return started;
  };
  const unqueue = (key: string): boolean => {
    const at = queue.findIndex((request) => request.key === key);
    if (at < 0) return false;
    queue.splice(at, 1);
    return true;
  };
  return {
    post(request) {
      jobs.delete(request.key);
      unqueue(request.key);
      const lane = laneOf(request);
      // 앞에 기다리는 일이 있으면 그 뒤에(차례를 지킨다)
      const ahead = queue.some((entry) => laneOf(entry) === lane);
      if (!ahead && used(lane) < capacity(request)) return start(request, request.atMs).untilMs;
      queue.push(request);
      return undefined;
    },
    load(key, unitId, nowMs) {
      const job = jobs.get(key);
      if (!job || carriers.has(key) || busy.has(unitId) || nowMs >= job.untilMs || nowMs < job.fromMs)
        return false;
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
      // 운반꾼이 풀렸다: 그 줄의 다음 일은 이 일이 닿은 시각에 떠난다(늦게 불려도 판정은 같다)
      promote(laneOf(job), Math.min(nowMs, job.untilMs));
      return out;
    },
    ofWorker(facilityId, nowMs) {
      for (const job of jobs.values())
        if (job.worker === facilityId && nowMs < job.untilMs && nowMs >= job.fromMs) return job;
      return undefined;
    },
    idle(cityId, nowMs) {
      return [...jobs.values()]
        .filter(
          (job) =>
            job.cityId === cityId && job.worker === undefined && nowMs < job.untilMs && nowMs >= job.fromMs,
        )
        .toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    },
    carrierOf: (key) => carriers.get(key),
    stateOf(key) {
      const job = jobs.get(key);
      if (job) return job.untilMs;
      return queue.some((request) => request.key === key) ? "waiting" : undefined;
    },
    drop: (key) => unqueue(key),
    pump(nowMs) {
      let started = 0;
      const lanes = new Set(queue.filter((request) => request.worker === undefined).map(laneOf));
      for (const lane of lanes) started += promote(lane, nowMs);
      return started;
    },
    pending: () => jobs.size + queue.length,
    waiting: () => queue.length,
  };
}

/** 도시마다 휴먼 수(경비대 빼고 — 운반꾼이 될 수 있는 사람, 2155). 같은 시각에는 한 번만 센다 */
export function peopleCounter(
  now: () => number,
  units: () => Iterable<{ readonly city: number; readonly guard?: boolean | undefined }>,
): (cityId: number) => number {
  let atMs = Number.NaN;
  const counts = new Map<number, number>();
  return (cityId) => {
    const at = now();
    if (at !== atMs) {
      atMs = at;
      counts.clear();
      for (const unit of units())
        if (unit.guard !== true) counts.set(unit.city, (counts.get(unit.city) ?? 0) + 1);
    }
    return counts.get(cityId) ?? 0;
  };
}
