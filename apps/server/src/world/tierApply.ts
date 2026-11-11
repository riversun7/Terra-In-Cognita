// 국력 등급 분포를 이미 선 세계에 반영(DB·부팅) — 사용자 답(2026-11-11, 원문) "현재 테스트 맵에 실제 강대국 분포처럼 알아서 배치해달라",
// docs/adr/2026-11-07-world-layout.md "바뀜 (2026-11-11)". 화면·조회는 placementService.ts(tRPC worldLayout.tierPlan·requestTierApply·
// cancelTierApply), 표는 db/worldPlacementSchema.ts world_tier_requests.
// - 새 세계(시작 도시가 없는 국가)는 요청 없이 처음부터 등급대로 선다(npc/nations.ts ensureTestNations).
// - 이미 선 국가는 배포만으로 바뀌지 않는다. 운영자가 세계 배치 화면에서 미리 보기(tierPlanOf — DB 읽기만)를 보고 [반영 예약]을 눌러야
//   요청 줄이 생기고, 서버가 다음에 켤 때 한 번 든다:
//   1. 세계 씨앗(worldBoot.ts): 등급 시작 도시 수에 모자란 도시를 그 국가 수도 둘레(등급 도시 간격)에 더 세우고, 기술 단계를 등급 값까지 올린다.
//   2. NPC 사회 런타임(npc/runtime.ts tierApply): 고정 국가의 시작 도시마다 주거를 등급 값까지 올리고, 처음 인구·경비대를 모자란 만큼 세운다.
//   3. 다 들면 든 시각·결과를 적고 감사 기록 world.tier_apply를 남긴다(markTierApplied).
// - 하지 않는 것: 도시·유닛·건물을 지우거나 옮기지 않는다(등급보다 많은 도시·인구는 그대로 둔다 — 미리 보기에 "남는 것"으로 보인다),
//   국고를 고치지 않는다(이미 굴러가는 잔고), 반란·점령으로 주인이 바뀐 도시와 플레이어 것은 건드리지 않는다. 국가 자리를 옮기는 것은
//   따로다(같은 화면의 자리 놓기 — nationPlacement.ts, 플레이어 것이 걸리면 그 국가는 그대로).
import type { QueryPool } from "./persist/load.ts";

/** 요청 한 줄 */
export interface TierRequest {
  readonly planetId: string;
  readonly requestedBy: string | null;
  readonly requestedAtMs: number;
  readonly appliedAtMs: number | null;
  readonly report: Readonly<Record<string, unknown>> | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function loadTierRequest(pool: QueryPool, planetId: string): Promise<TierRequest | undefined> {
  const result = await pool.query(
    `select planet_id, requested_by, requested_at_ms, applied_at_ms, report from world_tier_requests where planet_id = $1`,
    [planetId],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    planetId: String(row.planet_id),
    requestedBy: typeof row.requested_by === "string" ? row.requested_by : null,
    requestedAtMs: Number(row.requested_at_ms),
    appliedAtMs: row.applied_at_ms === null ? null : Number(row.applied_at_ms),
    report: isRecord(row.report) ? row.report : null,
  };
}

/** 아직 들지 않은 요청이 있나(다음 켤 때 들 차례) */
export async function tierApplyPending(pool: QueryPool, planetId: string): Promise<boolean> {
  const request = await loadTierRequest(pool, planetId);
  return request !== undefined && request.appliedAtMs === null;
}

/** 요청을 적는다(같은 행성의 옛 줄을 덮어쓴다 — 든 시각·결과를 비운다) */
export async function requestTierApply(
  pool: QueryPool,
  input: { planetId: string; userId: string; nowMs: number },
): Promise<void> {
  await pool.query(
    `insert into world_tier_requests (planet_id, requested_by, requested_at_ms, applied_at_ms, report)
     values ($1, $2, $3, null, null)
     on conflict (planet_id) do update set requested_by = excluded.requested_by,
       requested_at_ms = excluded.requested_at_ms, applied_at_ms = null, report = null`,
    [input.planetId, input.userId, input.nowMs],
  );
}

/** 아직 들지 않은 요청을 지운다(든 요청은 기록으로 남긴다). 지웠으면 true */
export async function cancelTierApply(pool: QueryPool, planetId: string): Promise<boolean> {
  const result = await pool.query(
    `delete from world_tier_requests where planet_id = $1 and applied_at_ms is null returning planet_id`,
    [planetId],
  );
  return result.rows.length > 0;
}

/** 켤 때 든 결과 */
export interface TierApplyReport {
  /** 더 세운 시작 도시 수 */
  readonly citiesAdded: number;
  /** 주거를 올린 도시 수 */
  readonly housingRaised: number;
  /** 더 세운 휴먼(경비대 빼고)·경비대 */
  readonly humans: number;
  readonly guards: number;
}

/** 요청이 들었다: 든 시각·결과를 적고 감사 기록(system, world.tier_apply)을 남긴다. 들 요청이 없으면 아무것도 하지 않는다 */
export async function markTierApplied(
  pool: QueryPool,
  planetId: string,
  nowMs: number,
  report: TierApplyReport,
): Promise<boolean> {
  const result = await pool.query(
    `update world_tier_requests set applied_at_ms = $2, report = $3
     where planet_id = $1 and applied_at_ms is null returning requested_by, requested_at_ms`,
    [planetId, nowMs, JSON.stringify(report)],
  );
  const row = result.rows[0];
  if (!row) return false;
  await pool.query(
    `insert into audit_log (actor_kind, action, before, after, meta) values ('system', 'world.tier_apply', $1, $2, $3)`,
    [
      null,
      JSON.stringify(report),
      JSON.stringify({
        planetId,
        requestedBy: typeof row.requested_by === "string" ? row.requested_by : null,
        requestedAtMs: Number(row.requested_at_ms),
        atMs: nowMs,
      }),
    ],
  );
  return true;
}
