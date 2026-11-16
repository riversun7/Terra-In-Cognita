// 2차맵 건설 땅 규칙 — 사용자 결정 2026-11-14(docs/adr/2026-11-14-second-map-build.md):
// "1차맵에 보이는 세력범위안에 포함된 2차맵들. 정부건물이 있으면 도시이고 해당 2차맵에 적대세력은 아예 건설불가, 동맹 연합세력은 정책에따라
// 건설가능여부 설정가능. 세력범위에는 포함되나 정부건물이 없는 땅에는 다른세력이 건설가능". 이어진 답: 중립은 못 지음, 동맹 정책 기본값은 금지.
// 기획 D-572(2026-11-16, 그 원문을 결정 로그에 올림 — 질문 1927 기획 정리와 부딪쳐 **알박기 우선**, 1982·1983):
// - 2차맵에 내 세력 도시가 있으면 짓는다(1982 "자기세력인경우 건설가능" — 가장자리가 지도에서 이웃 도시 땅이어도).
// - 내 도시가 없고 다른 세력의 도시(정부 건물 = world_cities 줄)가 있으면 못 짓는다(foreign_city, 전쟁·중립·동맹 모두 — 동맹 정책 칸은 3단계).
// - 도시가 없는 2차맵(정부 건물 없음)은 1차맵 세력 범위 안이어도 누구나 짓는다(알박기 땅 — "건설되면 해당 정부가 영토소유 알박기처럼 가능.
//   물론 군사력이 약하여 뺐기고 자원과 시간만 날릴수있음"). territory-3이 넣은 "남의 지도 영토면 foreign_territory로 막음"·"세력 없는
//   플레이어는 영토 밖에서만"을 걷었다. 짓는 자리의 지도 주인이 남이면 막지 않고 알린다(territoryFaction — 화면이 "빼앗길 수 있음" 안내).
// - 내 세력 = 건물 주인 세력(world_owners·가문 줄 ownerFactionsOf) + 나라(D-565·D-569 "가문 없는 플레이어도 소속 도시가 있어 자기 나라 영토는
//   내 땅": 사용자 주체는 사이보그의 나라 cyborgs.faction_id — 가문원은 가문 소속 도시의 나라로 맞춰져 있다, houseTies.ts — 봉신 가문은 위
//   세력 factions.parent_id). 이 가운데 하나라도 그 도시 세력이면 내 도시다.
// - 정부 건물을 다 지으면 그 세력이 차지(알박기): 폐허 자리는 폐허 복원(ruins/service.ts), 도시·폐허 없는 빈 2차맵은 다 지으면 그 편의 새
//   도시(ruins/landClaim.ts, 질문 2122 가 — 가문 없는 플레이어는 묻는 중이라 막음, 2192). 도시가 서면 아래 foreign_city가 남의 새 짓기를 막는다.
// - 도시 주인은 NPC 사회 런타임이 쓰기 대기열로 바꾸므로 대기열을 비운 뒤 DB에서 읽는다(건물 공격의 전쟁 판정과 같은 방식).
// - 기존 세계: 이미 지은 건물은 그대로 둔다(판정은 새 짓기부터, 리셋 없음).
// 바뀜(D-574 2124 — 사용자 답 "나. 그 도시 가문의 정책으로", docs/adr/2026-11-11-faction-identity.md "바뀜 (house-8, D-574)"):
// - 가문 도시(world_cities.faction_id = 플레이어 가문 행)에서: 자기 가문 도시는 늘 짓는다(봉신 가문원의 시민권은 위 나라라 옛 판정이 막던 경우도).
//   같은 나라의 다른 가문(그 가문 행이 내 세력이거나 그 위 세력이 내 세력)은 그 도시 정책(city_policies.house_build, null = 설정 칸
//   house_city_build_default)대로 — 막으면 house_policy. 그 밖(다른 나라)은 foreign_city 그대로.
// - NPC 나라 도시(가문 행이 아닌 세력)는 그 나라 시민이면 짓는다(NPC 도시 가문은 정책을 정하지 않는다 — 옛 판정 그대로).
import type { OwnerRow, QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { ownerFactionsOf } from "./targets.ts";

export type LandVerdict =
  /** 지을 수 있다. territoryFaction = 짓는 자리가 다른 세력의 1차맵 영토면 그 세력(알박기 땅 — 막지 않고 알림, D-572) */
  | { readonly allowed: true; readonly territoryFaction?: number }
  /**
   * 못 짓는다: foreign_city = 다른 세력의 도시 2차맵, house_policy = 같은 나라 다른 가문의 도시가 짓기를 막았다(D-574 2124). cityFaction = 그 도시
   * 세력(여럿이면 작은 ID)
   */
  | {
      readonly allowed: false;
      readonly reason: "foreign_city" | "house_policy";
      readonly cityFaction: number;
    };

/** 판정에 쓰는 도시 하나: 세력과(가문 도시면) 같은 나라인가·그 도시 정책이 남의 가문 짓기를 허용하나 */
export interface LandCity {
  readonly faction: number;
  readonly house?: { readonly sameNation: boolean; readonly allow: boolean } | undefined;
}

/**
 * 판정: 그 2차맵에 내 도시(자기 가문 도시 ownHouse·내 세력 mine의 NPC 도시·같은 나라 가문 도시 가운데 정책이 허용한 것)가 있으면 짓는다. 없고 같은
 * 나라 가문 도시가 막았으면 house_policy, 다른 세력 도시만 있으면 foreign_city. 도시가 없으면 짓는다 — 짓는 자리의 영토 주인(territoryFaction,
 * 영토 밖·모름이면 null)이 내 세력이 아니면 알림만 단다(D-572 알박기 우선). 한 2차맵에 여러 세력 도시가 있는 경우(옛 세계·시험 2차맵 줄)는 내
 * 도시가 있는 쪽으로 친다. cities의 수는 세력만 아는 도시(가문 도시 정보 없음 — 옛 판정)
 */
export function landVerdict(
  mine: readonly number[],
  cities: readonly (number | LandCity)[],
  territoryFaction: number | null = null,
  ownHouse: number | null = null,
): LandVerdict {
  const list = cities.map((city): LandCity => (typeof city === "number" ? { faction: city } : city));
  let policyBlocked: number | undefined;
  for (const city of list) {
    if (ownHouse !== null && city.faction === ownHouse) return { allowed: true };
    if (city.house) {
      if (!city.house.sameNation) continue;
      if (city.house.allow) return { allowed: true };
      policyBlocked = policyBlocked === undefined ? city.faction : Math.min(policyBlocked, city.faction);
      continue;
    }
    if (mine.includes(city.faction)) return { allowed: true };
  }
  if (policyBlocked !== undefined)
    return { allowed: false, reason: "house_policy", cityFaction: policyBlocked };
  const first = list.map((city) => city.faction).toSorted((a, b) => a - b)[0];
  if (first !== undefined) return { allowed: false, reason: "foreign_city", cityFaction: first };
  if (territoryFaction !== null && !mine.includes(territoryFaction))
    return { allowed: true, territoryFaction };
  return { allowed: true };
}

/**
 * 소유 주체의 내 세력 목록(위 머리 주석): 주인 세력(ownerFactionsOf) + 봉신이면 위 세력 + 사용자 주체면 사이보그의 나라. 작은 ID 차례, 겹침 없음
 */
export async function myFactionsOf(
  pool: QueryPool,
  owners: ReadonlyMap<number, OwnerRow>,
  ownerId: number,
): Promise<number[]> {
  const out = new Set<number>();
  const base = (await ownerFactionsOf(pool, owners, [ownerId])).get(ownerId) ?? null;
  if (base !== null) out.add(base);
  const userId = owners.get(ownerId)?.userId ?? null;
  const found = await pool.query(
    `select f.parent_id as faction_id from factions f where f.id = $1 and f.parent_id is not null
     union all select c.faction_id from cyborgs c where $2::text is not null and c.user_id::text = $2 and c.faction_id is not null`,
    [base, userId],
  );
  for (const row of found.rows) out.add(Number(row.faction_id));
  return [...out].toSorted((a, b) => a - b);
}

/**
 * 소유 주체의 가문(세력 행): 세력 주체면 그 세력, 사용자 주체면 든 가문(house_members, 해산하지 않은 것). 없으면 null — 자기 가문 도시 판정(D-574 2124)
 */
export async function ownHouseOf(
  pool: QueryPool,
  owners: ReadonlyMap<number, OwnerRow>,
  ownerId: number,
): Promise<number | null> {
  const owner = owners.get(ownerId);
  if (!owner) return null;
  if (owner.factionId !== null) return owner.factionId;
  if (owner.userId === null) return null;
  const { rows } = await pool.query(
    `select m.faction_id from house_members m join factions f on f.id = m.faction_id
      where m.user_id::text = $1 and f.dissolved_at_ms is null`,
    [owner.userId],
  );
  const row = rows[0];
  return row ? Number(row.faction_id) : null;
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
  /** 배치 칸의 1차맵 영토 주인 세력(영토 밖이면 null, 영토를 셈하지 않으면 undefined) — 알박기 땅 알림(D-572). 없으면 알리지 않는다 */
  readonly territoryFaction?:
    | ((mapKey: number, x: number, y: number) => Promise<number | null | undefined>)
    | undefined;
  /** 가문 도시가 남의 가문 짓기를 정하지 않았을 때 허용하나(설정 칸 house_city_build_default, D-574 2124). 없으면 허용 */
  readonly buildDefault?: (() => boolean) | undefined;
}): LandCheck {
  return async (ownerId, mapKey, at) => {
    await deps.writer.durable();
    const [found, holder] = await Promise.all([
      deps.pool.query(
        `select c.faction_id, f.kind, f.parent_id, p.house_build from world_cities c
           left join factions f on f.id = c.faction_id left join city_policies p on p.city_id = c.id
          where c.map_key = $1 and c.faction_id is not null`,
        [mapKey],
      ),
      deps.territoryFaction?.(mapKey, at?.x ?? LAND_CENTER, at?.y ?? LAND_CENTER) ??
        Promise.resolve(undefined),
    ]);
    const territoryFaction = holder ?? null;
    if (found.rows.length === 0 && territoryFaction === null) return { allowed: true };
    const [mine, ownHouse] = await Promise.all([
      myFactionsOf(deps.pool, deps.owners, ownerId),
      ownHouseOf(deps.pool, deps.owners, ownerId),
    ]);
    const fallback = deps.buildDefault?.() ?? true;
    const cities = found.rows.map((row): LandCity => {
      const faction = Number(row.faction_id);
      if (row.kind !== "player") return { faction };
      // 가문 도시(D-574 2124): 같은 나라 = 그 가문 행이나 그 위 세력이 내 세력
      const parent = row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id);
      const sameNation = mine.includes(faction) || (parent !== null && mine.includes(parent));
      const allow = typeof row.house_build === "boolean" ? row.house_build : fallback;
      return { faction, house: { sameNation, allow } };
    });
    return landVerdict(mine, cities, territoryFaction, ownHouse);
  };
}
