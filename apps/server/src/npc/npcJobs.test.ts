// NPC 시설 일자리 판단(npc/npcJobs.ts) — 임금 상한·고용주 조정 고르기·게시 맞추기·보증금 채우기·창고 걷기
import { describe, expect, it } from "vitest";
import {
  NPC_JOB_CHECK_MS,
  type NpcJobLabor,
  type NpcJobSite,
  createNpcJobs,
  npcJobAdjust,
  npcJobBudget,
} from "./npcJobs.ts";

/** 조정 1000‰에서 주기당 base인 임금 식(내림) */
const wageOf =
  (base: bigint) =>
  (adjustPm: number): bigint =>
    (base * BigInt(adjustPm)) / 1000n;

describe("NPC 시설 일자리: 임금 상한과 조정", () => {
  it("임금 상한 = 시간당 기대 금액 × 주기 ÷ 1시간에서 NPC 몫을 뺀 값(내림)", () => {
    // 시간당 600(밀리 단위 600,000), 주기 1분 → 주기당 10, NPC 몫 200‰ → 8
    expect(npcJobBudget(600_000n, 60_000, 200)).toBe(8n);
    expect(npcJobBudget(600_000n, 60_000, 0)).toBe(10n);
    // 시간당 1.9(밀리 단위 1,900), 주기 하루 → 45.6, NPC 몫 빼고 36(내림)
    expect(npcJobBudget(1_900n, 86_400_000, 200)).toBe(36n);
    expect(npcJobBudget(0n, 60_000, 200)).toBe(0n);
    expect(npcJobBudget(-5n, 60_000, 200)).toBe(0n);
  });

  it("상한을 넘지 않는 가장 큰 조정을 고른다(10‰ 단위 내림, 범위 안)", () => {
    // 임금 = 20 × 조정 ÷ 1000: 상한 17 → 조정 850~899에서 17, 900부터 18
    const adjust = npcJobAdjust({ budget: 17n, wageOf: wageOf(20n), minPm: 500, maxPm: 1500 });
    expect(adjust).toBe(890);
    expect(wageOf(20n)(adjust ?? 0)).toBeLessThanOrEqual(17n);
    // 상한이 넉넉하면 범위 위 끝
    expect(npcJobAdjust({ budget: 1000n, wageOf: wageOf(20n), minPm: 500, maxPm: 1500 })).toBe(1500);
  });

  it("가장 낮은 조정의 임금도 상한을 넘으면(자원이 싸다) 내지 않는다", () => {
    expect(npcJobAdjust({ budget: 9n, wageOf: wageOf(20n), minPm: 500, maxPm: 1500 })).toBeNull();
    // 임금이 0이면 내지 않는다
    expect(npcJobAdjust({ budget: 9n, wageOf: () => 0n, minPm: 500, maxPm: 1500 })).toBeNull();
  });
});

interface Posted {
  ownerId: number;
  adjustPm: number;
  slots: number;
  filled: number;
}

/** values = 시설마다 시간당 기대 금액(화폐 최소 단위 — 모듈에는 밀리 단위로 넘긴다) */
function setup(values: Record<number, bigint | undefined>, free: Record<number, number>) {
  const jobs = new Map<number, Posted>();
  const hired = new Map<number, number>();
  const funded: [number, bigint][] = [];
  const collected: number[][] = [];
  const labor: NpcJobLabor = {
    post(ownerId, input) {
      jobs.set(input.buildingId, { ownerId, adjustPm: input.adjustPm, slots: input.slots, filled: 0 });
      return { ok: true };
    },
    withdraw: (buildingId) => void jobs.delete(buildingId),
    openAt: (buildingId) => jobs.get(buildingId),
    terms: (adjustPm) => ({
      wage: wageOf(20n)(adjustPm),
      cycleMs: 60_000,
      deposit: wageOf(20n)(adjustPm) * 30n,
    }),
    range: () => ({ minPm: 500, maxPm: 1500 }),
    freeSlots: (buildingId) => free[buildingId] ?? 0,
    hired: (buildingId) => hired.get(buildingId) ?? 0,
  };
  const sites: NpcJobSite[] = Object.keys(free).map((id) => ({
    buildingId: Number(id),
    cityId: 1,
    owner: 7,
    facility: "mine",
    level: 1,
  }));
  const npcJobs = createNpcJobs({
    sites: () => sites,
    valuePerHour: (site) => {
      const value = values[site.buildingId];
      return value === undefined ? undefined : value * 1000n;
    },
    labor,
    fund: (site, target) => void funded.push([site.buildingId, target]),
    collect: (worked) => {
      collected.push(worked.map((site) => site.buildingId));
      return worked.length;
    },
  });
  return { npcJobs, jobs, hired, funded, collected, free, values };
}

describe("NPC 시설 일자리: 게시 맞추기", () => {
  it("값이 되는 시설에만 빈 자리만큼 일자리를 내고, 한 사람 몫 보증금을 금고에 채운다", () => {
    // 시설 11: 시간당 1,500 → 주기당 25, NPC 몫 빼고 20 → 조정 1040‰(임금 20, 내림). 시설 12: 시간당 600 → 상한 8 < 최저 임금 10 → 내지 않음
    const s = setup({ 11: 1500n, 12: 600n, 13: undefined }, { 11: 3, 12: 3, 13: 3 });
    const first = s.npcJobs.tick(1000);
    // 값을 셀 수 없는 건물(13 — 채집 시설이 아님)은 내지도 세지도 않는다
    expect(first).toMatchObject({ open: 1, slots: 3, posted: 1, withdrawn: 0, unprofitable: 1 });
    expect(s.jobs.get(11)).toEqual({ ownerId: 7, adjustPm: 1040, slots: 3, filled: 0 });
    expect(s.jobs.has(12)).toBe(false);
    expect(s.jobs.has(13)).toBe(false);
    expect(s.funded).toEqual([[11, 600n]]);
    // 바뀐 것이 없으면 다시 내지 않는다
    expect(s.npcJobs.tick(2000)).toMatchObject({ open: 1, posted: 0 });
  });

  it("시세가 내리면 임금을 낮춰 다시 내고, 값이 안 되면 거둔다. 자리가 차면 거둔다", () => {
    const s = setup({ 11: 1500n }, { 11: 2 });
    s.npcJobs.tick(1000);
    s.values[11] = 1200n; // 주기당 20 → 상한 16 → 조정 840‰(임금 16, 내림)
    expect(s.npcJobs.tick(2000)).toMatchObject({ posted: 1, open: 1 });
    expect(s.jobs.get(11)?.adjustPm).toBe(840);
    s.values[11] = 300n; // 상한 4 < 최저 임금 10
    expect(s.npcJobs.tick(3000)).toMatchObject({ withdrawn: 1, open: 0, unprofitable: 1 });
    expect(s.jobs.has(11)).toBe(false);
    s.values[11] = 1500n;
    s.npcJobs.tick(4000);
    s.free[11] = 0; // 자리가 다 찼다
    expect(s.npcJobs.tick(5000)).toMatchObject({ withdrawn: 1, open: 0, unprofitable: 0 });
  });

  it("플레이어가 일하는 시설의 창고 물건을 걷는다. 남이 낸 게시는 건드리지 않고 자기 것으로 바꾼다", () => {
    const s = setup({ 11: 1500n, 12: 1500n }, { 11: 2, 12: 2 });
    s.hired.set(12, 1);
    expect(s.npcJobs.tick(1000).collected).toBe(1);
    expect(s.collected).toEqual([[12]]);
    // 점검 주기 전에는 돌지 않는다
    expect(s.npcJobs.due(1000 + NPC_JOB_CHECK_MS - 1)).toBeUndefined();
    expect(s.npcJobs.due(1000 + NPC_JOB_CHECK_MS)).toBeDefined();
  });
});
