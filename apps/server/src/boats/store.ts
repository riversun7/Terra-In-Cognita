// 배 만들기 작업 저장(boat_jobs, src/db/boatSchema.ts) — docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)", 기획 D-541 1271 나.
// 쓰기는 월드 쓰기 대기열(재료 빼기와 같은 묶음), 읽기는 배 서비스를 만들 때(부팅 복구 뒤) 한 번.
import type { TakenMaterial } from "../facilities/materials.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 배 만들기 작업 한 줄 */
export interface BoatJob {
  readonly id: number;
  readonly ownerId: number;
  /** 부두(2차맵 건물 ID) */
  readonly buildingId: number;
  /** 뺀 재료와 뺀 자리(원장 위치 — 부두가 없어지면 그 자리로 돌려준다, 기획 D-542 1321 나). 옛 줄(B2)은 자리가 없어 null */
  readonly materials: readonly TakenMaterial[];
  readonly startedAtMs: number;
  readonly doneAtMs: number;
}

/** jsonb 재료 목록(모양이 틀린 줄은 버린다). 자리(location)가 없거나 틀리면 null(B2 옛 줄) */
export function materialsOf(value: unknown): TakenMaterial[] {
  const raw: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(raw)) return [];
  const out: TakenMaterial[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const item: unknown = Reflect.get(entry, "item");
    const qty: unknown = Reflect.get(entry, "qty");
    const location: unknown = Reflect.get(entry, "location");
    if (typeof item === "string" && typeof qty === "number" && Number.isSafeInteger(qty))
      out.push({
        item,
        qty,
        location: typeof location === "number" && Number.isSafeInteger(location) ? location : null,
      });
  }
  return out;
}

/** 그 행성의 배 만들기 작업(ID 차례) */
export async function loadBoatJobs(pool: QueryPool, planetId: string): Promise<BoatJob[]> {
  const found = await pool.query(
    `select id, owner_id, building_id, materials, started_at_ms, done_at_ms
     from boat_jobs where planet_id = $1 order by id`,
    [planetId],
  );
  return found.rows.map((row) => ({
    id: Number(row.id),
    ownerId: Number(row.owner_id),
    buildingId: Number(row.building_id),
    materials: materialsOf(row.materials),
    startedAtMs: Number(row.started_at_ms),
    doneAtMs: Number(row.done_at_ms),
  }));
}

/** 쓰기 대기열 고리(없으면 메모리에만) */
export function boatJobWriter(writer: Pick<WorldWriter, "upsert" | "remove"> | undefined, planetId: string) {
  return {
    save(job: BoatJob): void {
      writer?.upsert("boatJobs", {
        id: job.id,
        owner_id: job.ownerId,
        building_id: job.buildingId,
        planet_id: planetId,
        // pg가 배열을 Postgres 배열로 바꾸지 않게 JSON 글자로 넣는다(건물 작업 재료와 같다)
        materials: JSON.stringify(job.materials),
        started_at_ms: job.startedAtMs,
        done_at_ms: job.doneAtMs,
      });
    },
    remove(id: number): void {
      writer?.remove("boatJobs", { id });
    },
  };
}
