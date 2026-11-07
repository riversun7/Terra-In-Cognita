// 원자재 오브젝트 상태(남은 번수·다시 자라는 시각) — docs/adr/2026-11-07-gather-objects.md 4절, 기획 D-112(채집 지점마다 다시 자라는 시각).
// 메모리가 캐시이고 바뀜은 월드 쓰기 대기열로(gather_object_states, 채집 거래와 같은 커밋). 부팅 때 그 행성 줄을 한 번 읽는다.
// - 줄이 없으면 가득(종류의 uses). 다시 자라는 시각이 지났으면 가득으로 본다(읽을 때 판단 — 타이머가 없다).
// - 캐면 남은 번수 −1, 0이 되면 다시 자라는 시각 = 지금 + 다시 자람(오염·시설 반경을 부르는 쪽이 셈해 넘긴다).
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

export interface ObjectState {
  usesLeft: number;
  /** 0 = 자라는 중이 아니다 */
  regrowAtMs: number;
}

/** 오브젝트의 지금 상태(가득·남음·떨어짐) */
export interface ObjectNow {
  readonly usesLeft: number;
  /** 떨어졌으면 다시 자라는 시각, 아니면 0 */
  readonly regrowAtMs: number;
}

export interface ObjectStore {
  /** 지금 남은 번수(떨어졌으면 0과 다시 자라는 시각) */
  read(mapKey: number, objectId: number, uses: number, nowMs: number): ObjectNow;
  /** 한 번 캔다. 떨어져 있으면 false. 0이 되면 regrowMs 뒤 다시 자란다 */
  take(mapKey: number, objectId: number, uses: number, nowMs: number, regrowMs: () => number): boolean;
  /** 그 2차맵의 손댄 오브젝트(번호 → 상태, 화면 자료) */
  touched(mapKey: number): ReadonlyMap<number, ObjectState>;
}

const keyOf = (mapKey: number, objectId: number): string => `${mapKey}:${objectId}`;

/** 저장된 줄(그 행성) */
export interface ObjectRow {
  readonly mapKey: number;
  readonly objectId: number;
  readonly usesLeft: number;
  readonly regrowAtMs: number;
}

export async function loadObjectStates(pool: QueryPool, planetId: string): Promise<ObjectRow[]> {
  const result = await pool.query(
    `select map_key, object_id, uses_left, regrow_at_ms from gather_object_states where planet_id = $1
     order by map_key, object_id`,
    [planetId],
  );
  return result.rows.map((row) => ({
    mapKey: Number(row.map_key),
    objectId: Number(row.object_id),
    usesLeft: Number(row.uses_left),
    regrowAtMs: Number(row.regrow_at_ms),
  }));
}

export function createObjectStore(options: {
  readonly planetId: string;
  readonly rows?: readonly ObjectRow[] | undefined;
  readonly writer?: WorldWriter | undefined;
}): ObjectStore {
  const states = new Map<string, ObjectState>();
  const byMap = new Map<number, Map<number, ObjectState>>();
  const put = (mapKey: number, objectId: number, state: ObjectState): void => {
    states.set(keyOf(mapKey, objectId), state);
    let map = byMap.get(mapKey);
    if (!map) {
      map = new Map();
      byMap.set(mapKey, map);
    }
    map.set(objectId, state);
  };
  for (const row of options.rows ?? [])
    put(row.mapKey, row.objectId, { usesLeft: row.usesLeft, regrowAtMs: row.regrowAtMs });

  const save = (mapKey: number, objectId: number, state: ObjectState): void => {
    options.writer?.upsert("gatherObjects", {
      planet_id: options.planetId,
      map_key: mapKey,
      object_id: objectId,
      uses_left: state.usesLeft,
      regrow_at_ms: state.regrowAtMs,
    });
  };

  const read = (mapKey: number, objectId: number, uses: number, nowMs: number): ObjectNow => {
    const state = states.get(keyOf(mapKey, objectId));
    if (!state) return { usesLeft: uses, regrowAtMs: 0 };
    if (state.regrowAtMs > 0) {
      if (nowMs >= state.regrowAtMs) return { usesLeft: uses, regrowAtMs: 0 };
      return { usesLeft: 0, regrowAtMs: state.regrowAtMs };
    }
    return { usesLeft: Math.min(uses, state.usesLeft), regrowAtMs: 0 };
  };

  return {
    read,
    take(mapKey, objectId, uses, nowMs, regrow) {
      const now = read(mapKey, objectId, uses, nowMs);
      if (now.usesLeft <= 0) return false;
      const left = now.usesLeft - 1;
      const state: ObjectState = {
        usesLeft: left,
        regrowAtMs: left === 0 ? nowMs + Math.max(1, regrow()) : 0,
      };
      put(mapKey, objectId, state);
      save(mapKey, objectId, state);
      return true;
    },
    touched: (mapKey) => byMap.get(mapKey) ?? new Map(),
  };
}
