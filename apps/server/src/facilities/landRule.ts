// 2차맵 건설 땅 규칙 — 사용자 결정 2026-11-14(docs/adr/2026-11-14-second-map-build.md):
// "1차맵에 보이는 세력범위안에 포함된 2차맵들. 정부건물이 있으면 도시이고 해당 2차맵에 적대세력은 아예 건설불가, 동맹 연합세력은 정책에따라
// 건설가능여부 설정가능. 세력범위에는 포함되나 정부건물이 없는 땅에는 다른세력이 건설가능". 이어진 답: 중립은 못 지음, 동맹 정책 기본값은 금지.
// 기획 D-568 "판정도 지도대로"(질문 1927 나, 2026-11-16): 짓는 자리가 다른 세력의 1차맵 영토 안이면 못 짓는다.
// - 2차맵에 내 세력 도시가 있으면 짓는다(내 도시 2차맵 — 가장자리가 지도에서 이웃 도시 땅이어도).
// - 내 도시가 없고 다른 세력의 도시(정부 건물 = world_cities 줄)가 있으면 못 짓는다(foreign_city, 전쟁·중립·동맹 모두 — 동맹 정책 칸은 3단계).
// - 도시가 없는 2차맵은 짓는 자리(배치 칸)의 1차맵 영토 주인(영토 서비스 claimsAt — 비콘 놓기·지방과 같은 지도)이 다른 세력이면 못 짓는다
//   (foreign_territory). 영토 밖·내 세력 영토는 짓는다. 세력이 없으면 모든 영토가 남의 것이다. 영토를 셈하지 않은 세계(시험·DB 없음)는 옛
//   규칙대로 짓는다.
// - 도시 주인은 NPC 사회 런타임이 쓰기 대기열로 바꾸므로 대기열을 비운 뒤 DB에서 읽는다(건물 공격의 전쟁 판정과 같은 방식).
// - 기존 세계: 이미 지은 건물은 그대로 둔다(판정은 새 짓기부터, 리셋 없음).
import type { OwnerRow, QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { ownerFactionsOf } from "./targets.ts";

export type LandVerdict =
  | { readonly allowed: true }
  /** 다른 세력의 도시 2차맵(cityFaction = 그 도시 세력, 여럿이면 작은 ID) */
  | { readonly allowed: false; readonly reason: "foreign_city"; readonly cityFaction: number }
  /** 다른 세력의 1차맵 영토 안(cityFaction = 그 영토 주인 세력, D-568) */
  | { readonly allowed: false; readonly reason: "foreign_territory"; readonly cityFaction: number };

/**
 * 판정: 그 2차맵에 내 세력 도시가 있으면 짓는다(내 땅). 없고 다른 세력 도시만 있으면 못 짓는다(세력이 없으면 모든 도시가 남의 것).
 * 도시가 없으면 짓는 자리의 영토 주인(territoryFaction, 영토 밖·모름이면 null)이 다른 세력일 때만 막는다. 한 2차맵에 여러 세력 도시가 있는
 * 경우(옛 세계·시험 2차맵 줄)는 내 도시가 있는 쪽으로 친다
 */
export function landVerdict(
  myFaction: number | null,
  cityFactions: readonly number[],
  territoryFaction: number | null = null,
): LandVerdict {
  if (myFaction !== null && cityFactions.includes(myFaction)) return { allowed: true };
  const foreign = cityFactions.filter((faction) => faction !== myFaction).toSorted((a, b) => a - b);
  const first = foreign[0];
  if (first !== undefined) return { allowed: false, reason: "foreign_city", cityFaction: first };
  if (territoryFaction !== null && territoryFaction !== myFaction)
    return { allowed: false, reason: "foreign_territory", cityFaction: territoryFaction };
  return { allowed: true };
}

/** 2차맵 가운데 배치 칸(자리를 모를 때 — 화면 목록 단계의 미리 묻기) */
export const LAND_CENTER = 128;

/**
 * 소유 주체가 그 2차맵(의 그 배치 칸)에 지을 수 있나(서버 권위 — 짓기 명령과 화면 미리 묻기가 같은 함수). at이 없으면 2차맵 가운데
 */
export type LandCheck = (
  ownerId: number,
  mapKey: number,
  at?: { readonly x: number; readonly y: number },
) => Promise<LandVerdict>;

export function createLandCheck(deps: {
  readonly pool: QueryPool;
  readonly owners: ReadonlyMap<number, OwnerRow>;
  readonly writer: Pick<WorldWriter, "durable">;
  /** 배치 칸의 1차맵 영토 주인 세력(영토 밖이면 null, 영토를 셈하지 않으면 undefined). 없으면 영토를 보지 않는다(옛 규칙) */
  readonly territoryFaction?:
    | ((mapKey: number, x: number, y: number) => Promise<number | null | undefined>)
    | undefined;
}): LandCheck {
  return async (ownerId, mapKey, at) => {
    await deps.writer.durable();
    const [found, holder] = await Promise.all([
      deps.pool.query(
        `select distinct faction_id from world_cities where map_key = $1 and faction_id is not null`,
        [mapKey],
      ),
      deps.territoryFaction?.(mapKey, at?.x ?? LAND_CENTER, at?.y ?? LAND_CENTER) ??
        Promise.resolve(undefined),
    ]);
    const cityFactions = found.rows.map((row) => Number(row.faction_id));
    const territoryFaction = holder ?? null;
    if (cityFactions.length === 0 && territoryFaction === null) return { allowed: true };
    const mine = (await ownerFactionsOf(deps.pool, deps.owners, [ownerId])).get(ownerId) ?? null;
    return landVerdict(mine, cityFactions, territoryFaction);
  };
}
