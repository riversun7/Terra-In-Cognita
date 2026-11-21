// 물류센터 자동 맡기기 계정 설정 — 기획 D-576(사용자 답 2213 "다": "설정으로 자동 맡기기를 켤 수 있다"), 기획 대조 2272(D-6012 계정별 설정 선례 — 기기마다
// 다르지 않게), docs/adr/2026-11-16-logistics-center.md "바뀜 (haul-2)". 예전에는 그 기기 브라우저 저장소(autoHaul)에만 두고 화면이 via auto를 보냈다.
// - 저장: 계정 설정 표 user_settings.auto_haul(열 더하기 — 직전 판 서버는 이 열을 모른 채 그대로 읽고 쓴다). 줄이 없으면 만든다(다른 칸은 정하지 않음).
// - 서버 판정(gather/station.ts carry)은 동기라 켠 계정을 메모리에 들고 있다: 켤 때 한 번 읽고(load), 쓰기(set)가 DB 다음에 메모리를 바꾼다. 같은 서버
//   프로세스의 tRPC(facilities.autoHaul·setAutoHaul)만 쓰므로 메모리와 DB가 어긋나지 않는다(설정 표는 다른 길로 이 열을 쓰지 않는다 — settings/store.ts는
//   보낸 칸만 바꾼다).
// - 읽기(on): 그 소유 주체의 계정이 켰나. 계정이 없는 주체(NPC 세력)는 늘 끔.
import type { QueryPool } from "../world/persist/load.ts";
import type { HaulPrefs } from "./haulService.ts";

export interface AutoHaulPrefs extends HaulPrefs {
  /** 켤 때 한 번: 켠 계정을 DB에서 읽는다 */
  load(): Promise<void>;
}

export function createAutoHaulPrefs(deps: {
  readonly pool: QueryPool;
  /** 소유 주체 → 계정(사용자 id). 계정이 없으면(NPC) null·undefined */
  readonly userOf: (ownerId: number) => string | null | undefined;
}): AutoHaulPrefs {
  const enabled = new Set<string>();
  let loaded = false;
  return {
    async load() {
      const found = await deps.pool.query(`select user_id from user_settings where auto_haul`);
      enabled.clear();
      for (const row of found.rows) enabled.add(String(row.user_id));
      loaded = true;
    },
    on(ownerId) {
      const userId = deps.userOf(ownerId);
      return userId !== null && userId !== undefined && enabled.has(userId);
    },
    async get(userId) {
      if (loaded) return enabled.has(userId);
      const found = await deps.pool.query(`select auto_haul from user_settings where user_id = $1`, [userId]);
      return found.rows[0]?.auto_haul === true;
    },
    async set(userId, on) {
      await deps.pool.query(
        `insert into user_settings (user_id, auto_haul) values ($1, $2)
           on conflict (user_id) do update set auto_haul = excluded.auto_haul, updated_at = now()`,
        [userId, on],
      );
      if (on) enabled.add(userId);
      else enabled.delete(userId);
      return on;
    },
  };
}
