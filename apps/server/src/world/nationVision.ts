// 같은 나라 시야 공유의 "나라"(기획 정리 질문 746 나, S3-Q1 기본안 "같은 국가 전체", D-250, docs/adr/2026-11-08-citizenship.md).
// 소유 주체 → 나라(세력 행 ID): NPC 국가 주체(world_owners.faction_id) = 그 나라(그 나라 휴먼·지도자·시설), 유저 주체 = 가문원이면 가문 나라
// (가문 소속 도시의 나라 — 기획 D-565 "D-250 시야 공유는 이 소속 도시의 국가 기준", houseTies.ts), 무소속이면 그 사용자 사이보그가 든
// 나라(cyborgs.faction_id — 귀화하면 바로 바뀐다). 사이보그가 없는 유저·모르는 주체는 나라가 없다(공유 없음).
// 부를 때마다 월드 저장 층을 읽는다(국적 바꾸기 뒤 다음 시야 틱부터 새 나라). 시야(vision.ts)는 소유 주체마다 한 번만 묻는다.
import { houseTiesOf } from "./houseTies.ts";
import type { NationLookup, VisionViewer } from "./vision.ts";
import type { WorldPersistence } from "./world.ts";

/** 월드 저장 층(소유 주체·사이보그)이 있는 곳 */
export interface NationSource {
  readonly persistence?: Pick<WorldPersistence, "owners" | "cyborgs"> | undefined;
}

/** 소유 주체 → 나라 */
export function nationOfOwner(source: NationSource, ownerId: number): number | undefined {
  const p = source.persistence;
  const owner = p?.owners.get(ownerId);
  if (!p || !owner) return undefined;
  // 도시를 가진 플레이어 가문(houseTies.ts, D-250): 봉신 가문 주체 → 위 나라, 독립 가문 주체·가문원 → 그 가문.
  // 그 밖의 가문원 → 가문 나라(소속 도시의 나라, D-565), 무소속 → 시민권
  const ties = houseTiesOf(p);
  if (owner.factionId !== null) return ties?.nationOfHouse(owner.factionId) ?? owner.factionId;
  if (owner.userId === null) return undefined;
  return ties?.memberNationOf(owner.userId) ?? p.cyborgs.record(owner.userId)?.factionId;
}

/** 시야에 넘기는 나라 찾기(월드를 잡아 두고 부를 때마다 읽는다) */
export function nationLookupOf(source: NationSource): NationLookup {
  return (ownerId) => nationOfOwner(source, ownerId);
}

/** 사용자 한 명의 시야 보는 사람(소유 주체 + 같은 나라 공유) */
export function visionViewerOf(
  world: NationSource & { ownerOfUser?(userId: string): number | undefined },
  userId: string,
): VisionViewer {
  return { userId, ownerId: world.ownerOfUser?.(userId), nations: nationLookupOf(world) };
}
