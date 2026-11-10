// 올린 국가 마크 저장·읽기(표 nation_emblems)와 그림 길(GET /api/nation-emblems/<sha256>.png) — docs/adr/2026-11-10-nation-editor.md 4절.
// - 국가 프리셋 하나에 한 장(다시 올리면 바꾼다). 감사 기록 nation.emblem_upload·nation.emblem_remove(그림 바이트는 싣지 않고 해시·크기만).
// - 그림 길은 로그인 없이 읽는다: 주소가 그림 해시(64자)이고 게임 화면의 국가 이름 곁에 누구에게나 보이는 그림이다. 해시가 주소라
//   바뀌지 않으므로 오래 캐시한다(immutable). content-type은 image/png로 고정, nosniff.
import { createHash } from "node:crypto";
import type { NationEmblemUploadView } from "@terra/shared/nationEditor";
import type { FastifyInstance } from "fastify";

/** pg 풀·클라이언트에서 쓰는 것만 */
export interface EmblemQueryable {
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- 부르는 쪽이 줄 모양을 적는다(pg Pool.query와 같은 모양)
  query<R extends object = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

export const sha256Hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

interface EmblemRow {
  preset_id: string;
  sha256: string;
  bytes: number;
  uploaded_at_ms: string;
  uploaded_by_name: string | null;
}

/** 올린 마크 정보(프리셋 ID → 해시·크기·누가·언제). 그림 바이트는 읽지 않는다 */
export async function loadEmblemInfo(pool: EmblemQueryable): Promise<Map<string, NationEmblemUploadView>> {
  const { rows } = await pool.query<EmblemRow>(
    `select e.preset_id, e.sha256, e.bytes, (extract(epoch from e.uploaded_at) * 1000)::bigint as uploaded_at_ms,
            u.name as uploaded_by_name
       from nation_emblems e left join users u on u.id = e.uploaded_by order by e.preset_id`,
  );
  return new Map(
    rows.map((row) => [
      row.preset_id,
      {
        hash: row.sha256,
        bytes: row.bytes,
        uploadedAt: Number(row.uploaded_at_ms),
        uploadedBy: row.uploaded_by_name,
      },
    ]),
  );
}

/** 프리셋 ID → 올린 마크 해시(게임 화면 조회용) */
export async function loadEmblemHashes(pool: EmblemQueryable): Promise<Map<string, string>> {
  const { rows } = await pool.query<{ preset_id: string; sha256: string }>(
    "select preset_id, sha256 from nation_emblems",
  );
  return new Map(rows.map((row) => [row.preset_id, row.sha256]));
}

/** 마크를 넣거나 바꾼다. 앞 해시(없었으면 null)를 돌려준다 */
export async function saveEmblem(
  pool: EmblemQueryable,
  input: { presetId: string; png: Uint8Array; sha256: string; userId: string },
): Promise<string | null> {
  const before = await pool.query<{ sha256: string }>(
    "select sha256 from nation_emblems where preset_id = $1",
    [input.presetId],
  );
  await pool.query(
    `insert into nation_emblems (preset_id, png, sha256, bytes, uploaded_by, uploaded_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (preset_id) do update set png = excluded.png, sha256 = excluded.sha256, bytes = excluded.bytes,
       uploaded_by = excluded.uploaded_by, uploaded_at = excluded.uploaded_at`,
    [input.presetId, Buffer.from(input.png), input.sha256, input.png.length, input.userId],
  );
  return before.rows[0]?.sha256 ?? null;
}

/** 마크를 지운다(만든 마크로 돌아간다). 지운 해시(없었으면 null) */
export async function removeEmblem(pool: EmblemQueryable, presetId: string): Promise<string | null> {
  const { rows } = await pool.query<{ sha256: string }>(
    "delete from nation_emblems where preset_id = $1 returning sha256",
    [presetId],
  );
  return rows[0]?.sha256 ?? null;
}

const HASH_FILE = /^([0-9a-f]{64})\.png$/;
/** 한 해(해시가 주소라 내용이 바뀌지 않는다) */
const CACHE = "public, max-age=31536000, immutable";

/** 그림 길을 붙인다(DB가 있는 서버만). 없는 해시·모양이 틀린 주소는 404 */
export function registerNationEmblemRoute(app: FastifyInstance, pool: EmblemQueryable | undefined): void {
  if (!pool) return;
  app.get<{ Params: { file: string } }>("/api/nation-emblems/:file", async (request, reply) => {
    const hash = HASH_FILE.exec(request.params.file)?.[1];
    if (hash === undefined) return reply.code(404).send();
    const { rows } = await pool.query<{ png: Buffer }>(
      "select png from nation_emblems where sha256 = $1 limit 1",
      [hash],
    );
    const png = rows[0]?.png;
    if (!png) return reply.code(404).send();
    return reply
      .header("content-type", "image/png")
      .header("x-content-type-options", "nosniff")
      .header("cache-control", CACHE)
      .send(png);
  });
}
