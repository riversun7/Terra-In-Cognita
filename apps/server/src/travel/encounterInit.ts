// 조우 전투 시작 자료 — 기획 D-564 1641·D-570(1902 실제 지형, 1904 판단 — 공격 편/수비 편), docs/adr/2026-11-15-unloaded-second-maps.md
// "바뀜 (D-570, 좌표 이동 3)". 전투맵·자리는 encounterArena.ts, 몸은 부르는 쪽(place — 세계 전투와 같은 battleBodies.build).
// - 편 1 = 공격 편(먼저 건 편, defender false), 편 2 = 수비 편(습격당한 쪽 — 시간이 다 되면 이긴다, D-210). 편의 faction = 그 편 첫 유닛의 소유 주체
//   (세계 전투 결과 적용이 이긴 편 주체를 탈취·포로를 잡는 쪽으로 쓴다).
// - 파티 = 편마다 6명씩(시뮬·웨이브·건물 공격과 같은 [임시] 크기). 퇴각 HP = 그 편 AI 작전 ⑦ 퇴각 기준(encounter-4 — D-5039·D-5040, 편 판단 유닛
//   평균, 판단 유닛이 없는 편은 0).
// - 바뀜(fixes-1116l, 질문 2131 — 기획 D-558 1547 "파티도 없으면 유닛들 개별 참전"): 세계(2차맵)에 파티 묶음이 없어 유닛마다 제 파티(한 명)로 든다
//   (웨이브 수비의 세계 휴먼과 같다). 퇴각 HP = 그 유닛의 AI 작전 ⑦(unitRetreat — 판단 유닛만), 판단 유닛이 아니면 그 편 평균(옛 값). 세계에 분대가
//   생기면 분대 = 파티로 바꾼다.
import {
  type BattleInit,
  type BattleMapInput,
  type BattlePartySpec,
  type CombatUnitSpec,
  type Edge,
} from "@terra/sim";
import { type ArenaUnit, encounterEdges, placeEncounterUnits } from "./encounterArena.ts";

/** 파티 크기 — 세계에 파티 묶음이 없어 유닛 개별(D-558 1547, 질문 2131). 편마다 유닛 상한(설정 칸 최대 96)이 파티 ID 칸(편 × 100)을 넘지 않는다 */
const PARTY_SIZE = 1;

export interface EncounterInitInput {
  /** [공격 편, 수비 편] 유닛(2차맵 배치 칸) */
  readonly sides: readonly [readonly ArenaUnit[], readonly ArenaUnit[]];
  readonly map: BattleMapInput;
  /** 전투맵 (0, 0)이 놓인 2차맵 배치 칸 */
  readonly origin: { readonly x: number; readonly y: number };
  readonly ownerOf: (unitId: number) => number;
  /** 몸(자리·편·파티를 받아 전투 사양). 없으면 그 유닛은 뺀다 */
  readonly place: (
    unitId: number,
    spot: { side: number; party: number; x: number; y: number },
  ) => CombatUnitSpec | undefined;
  readonly seed: number;
  /** [공격 편, 수비 편] 파티 퇴각 기준(파티 HP %, AI 작전 ⑦ 편 평균). 없으면 0 */
  readonly retreatPct?: readonly [number, number] | undefined;
  /** 유닛마다 퇴각 기준(그 유닛 AI 작전 ⑦ — 판단 유닛만). 없는 유닛은 편 값(retreatPct) */
  readonly unitRetreat?: ReadonlyMap<number, number> | undefined;
}

/** 편(1·2)의 파티 퇴각 기준(0~100) */
function retreatOf(retreat: readonly [number, number] | undefined, side: number): number {
  const value = retreat?.[side === 1 ? 0 : 1] ?? 0;
  return Math.min(100, Math.max(0, Math.floor(value)));
}

/** 조우 전투 시작 자료. 한 편이라도 비면 null */
export function buildEncounterInit(input: EncounterInitInput): BattleInit | null {
  const { map, origin } = input;
  const spots = placeEncounterUnits(map, origin, input.sides);
  const edges: [Edge, Edge] = encounterEdges(origin, map.size, input.sides);
  const units: CombatUnitSpec[] = [];
  const factions: number[] = [];
  for (const [index, side] of input.sides.entries()) {
    const sideId = index + 1;
    let placed = 0;
    for (const unit of side) {
      const spot = spots.get(unit.unitId);
      if (!spot) continue;
      const spec = input.place(unit.unitId, {
        side: sideId,
        party: sideId * 100 + 1 + Math.floor(placed / PARTY_SIZE),
        x: spot.x,
        y: spot.y,
      });
      if (!spec) continue;
      if (placed === 0) factions.push(input.ownerOf(unit.unitId));
      units.push(spec);
      placed += 1;
    }
    if (placed === 0) return null;
  }
  const parties: BattlePartySpec[] = [...new Set(units.map((unit) => unit.party))].map((id) => {
    const first = units.find((unit) => unit.party === id);
    const side = first?.side ?? 1;
    const own = first === undefined ? undefined : input.unitRetreat?.get(first.id);
    return {
      id,
      side,
      retreatHpPct:
        own === undefined ? retreatOf(input.retreatPct, side) : Math.min(100, Math.max(0, Math.floor(own))),
    };
  });
  return {
    id: 0,
    kind: "normal",
    seed: input.seed >>> 0,
    map,
    sides: [
      { id: 1, faction: factions[0] ?? 0, defender: false, edge: edges[0] },
      { id: 2, faction: factions[1] ?? 0, defender: true, edge: edges[1] },
    ],
    parties,
    units,
  };
}
