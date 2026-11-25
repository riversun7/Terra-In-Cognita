// NPC 시설 일자리 — 사용자 지시 2026-11-25 "NPC 시설에 일하는 기능을 구현해야한다. 시급한 문제. 해당 채집소 자원의 가치를 고려하여 손해보지 않는
// 임금 제공.", docs/adr/2026-11-25-npc-facility-jobs.md. 구인·계약·임금·산출 규칙은 플레이어 시설과 같은 한 벌이다(labor/jobBoard.ts·service.ts,
// 기획 D-212 "NPC도 같은 시스템"). 여기는 NPC 나라가 자기 채집 시설에 일자리를 내는 판단과 그 돈·물건의 뒤처리만 한다.
// - 대상: 도시 주인 나라가 가진 다 지은 채집 시설(농장·벌목장·광산 등 — 도시 경제가 쓰는 건물 그대로). 휴먼 일꾼(도시 경제)과 따로, 시설의 노동
//   자리(레벨 × 레벨당 자리)에 플레이어 유닛·사이보그 본체가 임금형 계약으로 든다.
// - 임금(손해 보지 않게): 기준 유닛(임금 식의 효율점수와 같은 스탯)이 그 시설에서 한 시간에 캐는 물건의 기대 금액(roster/gatherSheet.ts — 그 도시 거래소
//   마지막 체결가, 없으면 시작 시세)을 임금 주기로 나눈 값에서 NPC 몫(NPC_JOB_MARGIN_PM)을 뺀 것이 임금 상한이다. 임금 식은 효율 × 단가 × 고용주 조정(N28)
//   이라 NPC가 고를 수 있는 것은 조정 ‰ 하나다 → 상한을 넘지 않는 가장 큰 조정(10‰ 단위 내림). 가장 낮은 조정으로도 상한을 넘으면(자원이 싸다) 일자리를
//   내지 않고 낸 것은 거둔다(맺은 계약은 그대로 — 계약 임금은 맺을 때 값).
// - 보증금·임금 = 그 시설 사업장 금고(플레이어 사업장과 같다). 일자리를 낼 때 금고가 계약 하나의 보증금에 모자라면 NPC 주인이 국고에서 운영 자금을 넣는다
//   (business invest — NPC 휴먼 임금과 같은 길, npc/npcWages.ts). 국고도 모자라면 넣지 않는다(받을 때 employer_insufficient_funds).
// - 산출: 임금형 몫은 그 건물 창고(고용주 = 나라 것)에 쌓인다. 플레이어가 일하는 시설은 점검마다 시설 창고 물건을 그 도시 창고로 보내고 나라가 시세에
//   사들인다(국고 → 시설 금고 — npcDelivery.ts sweep, NPC 산출의 매출과 같은 길). 그 매출이 다음 임금이 된다.
// - 점검 주기 NPC_JOB_CHECK_MS(세계 심장 박동 작업에서 부른다). 저장하는 것은 구인 게시 줄뿐이다(다시 켜면 게시가 그대로 있고 첫 점검이 다시 맞춘다).
// 정수·BigInt만 쓴다.

/** NPC가 남기는 몫(‰): 임금 상한 = 기대 금액 × (1000 − 이 값) ÷ 1000 [임시 — 설정 칸으로 옮길 값] */
export const NPC_JOB_MARGIN_PM = 200;
/** 점검 주기(ms) [임시] */
export const NPC_JOB_CHECK_MS = 300_000;
/** 고용주 조정을 이 단위(‰)로 내림한다(시세가 조금 움직일 때마다 게시를 다시 내지 않게) */
export const NPC_JOB_ADJUST_STEP_PM = 10;

const HOUR_MS = 3_600_000n;

/**
 * 임금 상한(budget)을 넘지 않는 가장 큰 고용주 조정 ‰(NPC_JOB_ADJUST_STEP_PM 단위 내림, 범위 minPm~maxPm). 가장 낮은 조정의 임금도 상한을 넘거나
 * 임금이 0이면 null(일자리를 내지 않는다). wageOf는 조정에 대해 줄지 않는 함수여야 한다(임금 식 N27·N28)
 */
export function npcJobAdjust(input: {
  readonly budget: bigint;
  readonly wageOf: (adjustPm: number) => bigint;
  readonly minPm: number;
  readonly maxPm: number;
}): number | null {
  const { budget, wageOf, minPm, maxPm } = input;
  if (maxPm < minPm) return null;
  const low = wageOf(minPm);
  if (low <= 0n || low > budget) return null;
  let lo = minPm;
  let hi = maxPm;
  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    if (wageOf(mid) <= budget) lo = mid;
    else hi = mid - 1;
  }
  const stepped = lo - (lo % NPC_JOB_ADJUST_STEP_PM);
  return stepped >= minPm ? stepped : lo;
}

/** 기대 금액의 배율(npc/npcJobValue.ts NPC_JOB_VALUE_SCALE와 같다 — 시간당 값이 작아 밀리 단위로 받는다) */
const VALUE_SCALE = 1000n;

/**
 * 임금 주기 하나의 임금 상한 = 시간당 기대 금액(밀리 단위) × 주기 ÷ 1시간 × (1000 − NPC 몫) ÷ 1000(내림, 화폐 최소 단위)
 */
export function npcJobBudget(
  valueMilliPerHour: bigint,
  cycleMs: number,
  marginPm: number = NPC_JOB_MARGIN_PM,
): bigint {
  if (valueMilliPerHour <= 0n) return 0n;
  const keep = BigInt(Math.max(0, 1000 - marginPm));
  return (valueMilliPerHour * BigInt(Math.max(1, cycleMs)) * keep) / (HOUR_MS * 1000n * VALUE_SCALE);
}

/** NPC 채집 시설 하나(도시 주인 나라 것) */
export interface NpcJobSite {
  readonly buildingId: number;
  readonly cityId: number;
  /** 도시 주인(NPC 세력 주체 — 국고) */
  readonly owner: number;
  /** 시설 ID(팩 facilities)·레벨·면적 모듈 수 */
  readonly facility: string;
  readonly level: number;
  readonly plots?: number | undefined;
}

/** 노동 서비스 몫(labor/service.ts NpcJobDesk) */
export interface NpcJobLabor {
  post(
    ownerId: number,
    input: { readonly buildingId: number; readonly adjustPm: number; readonly slots: number },
    atMs: number,
  ): { readonly ok: boolean };
  withdraw(buildingId: number, atMs: number): void;
  openAt(
    buildingId: number,
  ):
    | { readonly ownerId: number; readonly adjustPm: number; readonly slots: number; readonly filled: number }
    | undefined;
  terms(adjustPm: number): { readonly wage: bigint; readonly cycleMs: number; readonly deposit: bigint };
  range(): { readonly minPm: number; readonly maxPm: number };
  freeSlots(buildingId: number): number;
  hired(buildingId: number): number;
}

export interface NpcJobsDeps {
  /** 지금 NPC 채집 시설(도시 주인 나라 것, 다 지은 것) */
  sites(): readonly NpcJobSite[];
  /** 기준 유닛이 그 시설에서 한 시간에 캐는 물건의 기대 금액(그 도시 화폐 밀리 단위 = 최소 단위 × 1000). 모르면 undefined(일자리를 내지 않는다) */
  valuePerHour(site: NpcJobSite): bigint | undefined;
  readonly labor: NpcJobLabor;
  /** 그 시설 금고를 target까지 채운다(국고 → 금고, 국고가 모자라면 넣지 않는다). 없으면 채우지 않는다 */
  fund?: ((site: NpcJobSite, target: bigint, nowMs: number) => void) | undefined;
  /** 그 시설들의 창고 물건(나라 것)을 도시 창고로 보내고 나라가 사들인다. 옮긴 줄 수. 없으면 두지 않는다 */
  collect?: ((sites: readonly NpcJobSite[], nowMs: number) => number) | undefined;
  /** NPC 몫 ‰(없으면 NPC_JOB_MARGIN_PM) */
  marginPm?: (() => number) | undefined;
}

/** 점검 한 번의 결과(지표·시험) */
export interface NpcJobsTick {
  /** 열려 있는 NPC 일자리(시설 수)와 빈 자리 합 */
  readonly open: number;
  readonly slots: number;
  /** 이번에 새로 냈거나 바꾼 게시·거둔 게시 */
  readonly posted: number;
  readonly withdrawn: number;
  /** 값이 싸서(가장 낮은 조정도 상한을 넘음) 내지 않은 시설 */
  readonly unprofitable: number;
  /** 시설 창고에서 도시 창고로 보낸 물건 줄 */
  readonly collected: number;
}

export interface NpcJobs {
  /** 모든 NPC 채집 시설의 일자리를 지금 값에 맞춘다 */
  tick(nowMs: number): NpcJobsTick;
  /** 점검 주기가 지났으면 tick(아니면 undefined) */
  due(nowMs: number): NpcJobsTick | undefined;
  /** 마지막 점검 결과 */
  last(): NpcJobsTick | undefined;
}

/** 세계 조립(world.ts): NPC 도시 경제 + 노동 서비스 + 임금 기준 값으로 묶는다. 경제나 기준 값이 없으면 undefined(일자리 없음) */
export function npcJobsOf(
  economy:
    | {
        shops(): NpcJobSite[];
        lastPrice(cityId: number, asset: string): bigint | undefined;
        fundShop(site: NpcJobSite, target: bigint, nowMs: number): bigint;
        collectShops(sites: readonly NpcJobSite[], nowMs: number): number;
      }
    | undefined,
  labor: { readonly npcJobs: NpcJobLabor },
  valueOf:
    | ((
        site: { readonly facility: string; readonly level: number; readonly plots?: number | undefined },
        lastPrice: (item: string) => bigint | undefined,
      ) => bigint | undefined)
    | undefined,
): NpcJobs | undefined {
  if (!economy || !valueOf) return undefined;
  return createNpcJobs({
    sites: () => economy.shops(),
    valuePerHour: (site) => valueOf(site, (item) => economy.lastPrice(site.cityId, `item:${item}`)),
    labor: labor.npcJobs,
    fund: (site, target, nowMs) => void economy.fundShop(site, target, nowMs),
    collect: (sites, nowMs) => economy.collectShops(sites, nowMs),
  });
}

export function createNpcJobs(deps: NpcJobsDeps): NpcJobs {
  const { labor } = deps;
  let lastTick: NpcJobsTick | undefined;
  let lastAt: number | undefined;

  const tick = (nowMs: number): NpcJobsTick => {
    const range = labor.range();
    const margin = deps.marginPm?.() ?? NPC_JOB_MARGIN_PM;
    let open = 0;
    let slots = 0;
    let posted = 0;
    let withdrawn = 0;
    let unprofitable = 0;
    const worked: NpcJobSite[] = [];
    for (const site of deps.sites()) {
      if (labor.hired(site.buildingId) > 0) worked.push(site);
      const now = labor.openAt(site.buildingId);
      const mine = now !== undefined && now.ownerId === site.owner;
      const free = labor.freeSlots(site.buildingId);
      const value = deps.valuePerHour(site);
      const cycleMs = labor.terms(range.minPm).cycleMs;
      const adjust =
        value === undefined
          ? null
          : npcJobAdjust({
              budget: npcJobBudget(value, cycleMs, margin),
              wageOf: (adjustPm) => labor.terms(adjustPm).wage,
              minPm: range.minPm,
              maxPm: range.maxPm,
            });
      if (adjust === null || free <= 0) {
        // 값을 셀 수 없는 건물(채집 시설이 아님)은 세지 않는다
        if (adjust === null && value !== undefined && free > 0) unprofitable += 1;
        if (mine) {
          labor.withdraw(site.buildingId, nowMs);
          withdrawn += 1;
        }
        continue;
      }
      if (!mine || now.adjustPm !== adjust || now.slots - now.filled !== free) {
        if (!labor.post(site.owner, { buildingId: site.buildingId, adjustPm: adjust, slots: free }, nowMs).ok)
          continue;
        posted += 1;
      }
      open += 1;
      slots += free;
      // 다음 한 사람을 받을 보증금(N48 전부)이 금고에 있게 한다
      deps.fund?.(site, labor.terms(adjust).deposit, nowMs);
    }
    const collected = worked.length > 0 ? (deps.collect?.(worked, nowMs) ?? 0) : 0;
    lastAt = nowMs;
    lastTick = { open, slots, posted, withdrawn, unprofitable, collected };
    return lastTick;
  };

  return {
    tick,
    due: (nowMs) => (lastAt === undefined || nowMs - lastAt >= NPC_JOB_CHECK_MS ? tick(nowMs) : undefined),
    last: () => lastTick,
  };
}
