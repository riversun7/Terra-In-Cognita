// 사업장 주인·주주 이름(건물 판 머리·장부 주주 목록) — 사용자 요청 2026-11-15 "남의 건물이 아니라 소유 유닛이름이나 대주주 이름",
// docs/adr/2026-11-15-building-screen.md.
// - 유저 = 사이보그 이름(다른 사람에게 보이는 이름은 이것뿐 — D-134, 랭킹과 같다. 로그인 아이디는 보이지 않는다). 사이보그가 없으면 null.
// - NPC 세력 = 나라 이름(팩 국가 프리셋, 세력 코드 → 이름 — 영토 서비스 factionName과 같은 함수). 모르면 세력 코드.
// - 화면이 이름표를 그릴 때마다 묻지 않게 짧게 기억한다(NAME_TTL_MS). 사이보그 이름은 바꾸기 드물다.
import type { LocalizedName } from "@terra/shared/roster";
import type { QueryPool } from "../world/persist/load.ts";

/** 이름을 기억하는 시간(ms) */
const NAME_TTL_MS = 60_000;
/** 기억하는 이름 수 상한(넘으면 비운다) */
const NAME_CACHE_MAX = 4_096;

export type FactionNameOf = (code: string) => LocalizedName | undefined;

export interface OwnerNames {
  /** 주체 ID → 이름(모르면 null) */
  names(ownerIds: readonly number[]): Promise<Map<number, LocalizedName | null>>;
}

export function createOwnerNames(options: {
  readonly pool: QueryPool;
  readonly factionName?: FactionNameOf | undefined;
  readonly now: () => number;
}): OwnerNames {
  const cache = new Map<number, { atMs: number; name: LocalizedName | null }>();
  return {
    async names(ownerIds) {
      const nowMs = options.now();
      const out = new Map<number, LocalizedName | null>();
      const missing: number[] = [];
      for (const id of new Set(ownerIds)) {
        const hit = cache.get(id);
        if (hit && nowMs - hit.atMs < NAME_TTL_MS && nowMs >= hit.atMs) out.set(id, hit.name);
        else missing.push(id);
      }
      if (missing.length === 0) return out;
      const { rows } = await options.pool.query(
        `select o.id, o.faction_id, c.name as cyborg_name, f.code
           from world_owners o
           left join cyborgs c on c.user_id = o.user_id
           left join factions f on f.id = o.faction_id
          where o.id = any($1::bigint[])`,
        [missing],
      );
      if (cache.size > NAME_CACHE_MAX) cache.clear();
      for (const row of rows) {
        const id = Number(row.id);
        const cyborg = typeof row.cyborg_name === "string" && row.cyborg_name !== "" ? row.cyborg_name : null;
        const code = typeof row.code === "string" ? row.code : null;
        const name: LocalizedName | null =
          row.faction_id !== null && row.faction_id !== undefined
            ? code === null
              ? null
              : (options.factionName?.(code) ?? { ko: code, en: code })
            : cyborg === null
              ? null
              : { ko: cyborg, en: cyborg };
        cache.set(id, { atMs: nowMs, name });
        out.set(id, name);
      }
      for (const id of missing) if (!out.has(id)) out.set(id, null);
      return out;
    },
  };
}
