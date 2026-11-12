// 전투맵 자료 — docs/adr/2026-10-31-combat-core.md "전투맵", ADR 35 "전투맵 만들기"·"엄폐 값", ADR 46(엄폐 층 형식)
// 2차맵 구역을 복사한 정적 자료다(전투 중 바뀌는 건물 내구도는 전투 상태가 든다).
// - 한 변 = 배치 칸 수(일반 64, 공성 128, 기술 범위 32~128 짝수, 49 C3·X16). 칸 번호 = y × size + x.
// - 통과(지상 층): 1 = 지나감. 차폐 칸(빽빽한 숲·큰 바위)은 만들 때 이미 막힘이다(ADR 35·46).
// - 엄폐 값(ADR 46: 배치 칸 u8): 0 없음, 1 은폐(수풀), 2 차폐. 시야에만 쓴다.
// - 바닥 높이: 16배 cm 정수(ADR 35 "칸 높이"). 구역 최저점을 0으로 둔다.
// - 건물: 장애물·차폐. 성문(gateSide)은 그 편만 지나가고(질문 97), 부서지면 누구나 지나가며 시선도 막지 않는다.
//   성벽(wall, 질문 1048 가)은 아무도 못 지나가고, 부서지면 성문처럼 누구나 지나가며 시선도 막지 않는다(breach.ts가 뚫는다).
//   부술 수 있는 보통 건물(breakable, 질문 1073 — 공성 전투맵의 넥서스 아닌 건물)은 부서지면 누구나 지나가지만 시선은 계속 막는다(무너진 자리
//   차폐, ADR 35). 그 밖의 건물은 부서져도 전투가 끝날 때까지 막힘·차폐로 남는다(ADR 35 "무너진 건물 자리도 차폐").
// - 물(수상 층)은 아직 없다: 물 칸은 지상 통과에서 막힘으로만 둔다(R3 범위, ADR combat-core).

export const COVER_NONE = 0;
export const COVER_BUSH = 1;
export const COVER_BLOCK = 2;
export const MIN_BATTLE_SIZE = 32;
export const MAX_BATTLE_SIZE = 128;

export interface BattleBuildingInput {
  readonly id: number;
  readonly cells: readonly number[];
  readonly durability: number;
  /** 공성 수비 쪽 넥서스(D-176) */
  readonly nexus: boolean;
  /** 성문이면 지나갈 수 있는 편 ID */
  readonly gateSide?: number | undefined;
  /** 성벽(부서지면 뚫린다, 질문 1048 가). 없으면 보통 건물 */
  readonly wall?: boolean | undefined;
  /** 부술 수 있는 보통 건물(부서지면 지나갈 수 있고 시선은 계속 막는다, 질문 1073). 공성 공격 편이 길을 낼 때 친다(breach.ts) */
  readonly breakable?: boolean | undefined;
}

export interface BattleMapInput {
  readonly size: number;
  readonly passable: Uint8Array;
  readonly cover: Uint8Array;
  readonly height: Int32Array;
  buildings: readonly BattleBuildingInput[];
}

export interface BattleMap {
  readonly size: number;
  readonly cover: Uint8Array;
  readonly height: Int32Array;
  readonly buildings: readonly BattleBuildingInput[];
  /** 칸 → 건물 ID(없으면 0) */
  readonly buildingAt: Int32Array;
  /** 편 side가 칸을 지나갈 수 있나(destroyed: 부서진 건물 ID) */
  passableFor(cell: number, side: number, destroyed: ReadonlySet<number>): boolean;
  /** 시선을 막는 칸인가(차폐 엄폐 또는 서 있는 건물·부서진 성문 아닌 건물) */
  blocksSight(cell: number, destroyed: ReadonlySet<number>): boolean;
  /** 가장자리 퇴각 구역(폭 band) 안인가 */
  inEdgeBand(cell: number, band: number): boolean;
}

export function createBattleMap(input: BattleMapInput): BattleMap {
  const { size } = input;
  if (!Number.isInteger(size) || size < MIN_BATTLE_SIZE || size > MAX_BATTLE_SIZE || size % 2 !== 0)
    throw new RangeError(`battle map size must be an even number in [32, 128]: ${size}`);
  const cells = size * size;
  if (input.passable.length !== cells || input.cover.length !== cells || input.height.length !== cells)
    throw new RangeError("battle map layers must be size × size");
  const buildingAt = new Int32Array(cells);
  const byId = new Map<number, BattleBuildingInput>();
  for (const building of input.buildings) {
    if (building.id <= 0 || byId.has(building.id)) throw new RangeError(`bad building id ${building.id}`);
    byId.set(building.id, building);
    for (const cell of building.cells) {
      if (cell < 0 || cell >= cells || buildingAt[cell] !== 0)
        throw new RangeError(`bad building cell ${cell}`);
      buildingAt[cell] = building.id;
    }
  }
  const passable = input.passable;
  return {
    size,
    cover: input.cover,
    height: input.height,
    buildings: input.buildings,
    buildingAt,
    passableFor(cell, side, destroyed) {
      if (passable[cell] !== 1) return false;
      const id = buildingAt[cell] ?? 0;
      if (id === 0) return true;
      const building = byId.get(id);
      if (building?.wall === true || building?.breakable === true) return destroyed.has(id);
      if (building?.gateSide === undefined) return false;
      return building.gateSide === side || destroyed.has(id);
    },
    blocksSight(cell, destroyed) {
      if (input.cover[cell] === COVER_BLOCK) return true;
      const id = buildingAt[cell] ?? 0;
      if (id === 0) return false;
      const building = byId.get(id);
      return !((building?.gateSide !== undefined || building?.wall === true) && destroyed.has(id));
    },
    inEdgeBand(cell, band) {
      const x = cell % size;
      const y = (cell - x) / size;
      return x < band || y < band || x >= size - band || y >= size - band;
    },
  };
}
