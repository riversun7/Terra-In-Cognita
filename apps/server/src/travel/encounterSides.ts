// 조우 한 편의 판단 값 — 질문 2021·2023 답(encounter-4: 판단 입력 = AI 작전 D-5039·D-5040), D-144(오프라인·직무 중 유닛은 먼저 치지 않는다),
// D-573(회피 편 빠르기 비교). 판단 자체는 clashDecide.ts(순수), 이 파일은 편 유닛 → ClashSideView.
// - 판단 유닛마다 작전: 플레이어 유닛 = 저장한 작전(tactics/store.ts, 없으면 균형), NPC 유닛 = 그 세력 공격 성향 → 프리셋(npcPresetOf).
//   [임시] 세계에 파티 묶음이 없어 편 = 한 파티로 보고 판단 유닛 값을 평균한다(내림, 질문 2131).
// - starters = NPC 판단 유닛 + 주인이 접속 중인 플레이어 판단 유닛(D-144). 플레이어 가문 주체 유닛은 접속 판단을 할 수 없어 먼저 걸지 않는다.
// - 전투 몸이 있으면(띄운 2차맵) 전력·남은 HP %를 몸으로, 아니면 유닛 수(한 명 = 1,000)로 센다.
// - 빠르기 = 편에서 가장 느린 유닛의 걷기 빠르기(실효 AGI·이동 버프, world/walkSpeed.ts — 2차맵이 마지막 이동 때 잰 값·좌표 유닛 행 값).
import { type AiTactics, DEFAULT_PLAYER_PRESET, npcPresetOf, presetTactics } from "@terra/shared/aiTactics";
import type { ClashSideView } from "./clashDecide.ts";

/** 판단 앞의 한 편 유닛 */
export interface SideUnit {
  readonly unitId: number;
  readonly ownerId: number;
  readonly kind: number;
  readonly decider: boolean;
  /** 걷기 빠르기(단위/초, 모르면 0) */
  readonly speed: number;
}

/** 전투 몸으로 센 값 */
export interface SideBody {
  readonly power: number;
  readonly hp: number;
  readonly maxHp: number;
}

export interface SideSources {
  /** 플레이어(사용자 주체·플레이어 가문) 주체인가 */
  playerOwned(ownerId: number): boolean;
  /** 사용자 주체이고 지금 접속 중인가(아니면 false) */
  online(ownerId: number): boolean;
  /** NPC 주체의 공격 성향(0~1000) */
  aggressionOf(ownerId: number, nation: number): number;
  /** 저장한 작전(없으면 undefined) */
  tacticsOf(unitId: number): AiTactics | undefined;
}

/** 판단 유닛 하나의 작전 */
export function unitTactics(unit: SideUnit, nation: number, sources: SideSources): AiTactics {
  if (sources.playerOwned(unit.ownerId))
    return sources.tacticsOf(unit.unitId) ?? presetTactics(DEFAULT_PLAYER_PRESET);
  return presetTactics(npcPresetOf(sources.aggressionOf(unit.ownerId, nation)));
}

/** 편 하나의 판단 값. bodies = 유닛 ID → 몸 값(없으면 유닛 수로 센다) */
export function sideView(
  side: readonly SideUnit[],
  nation: number,
  sources: SideSources,
  bodies: ReadonlyMap<number, SideBody> | undefined,
  carriers: ReadonlySet<number>,
): ClashSideView {
  const deciders = side.filter((unit) => unit.decider);
  let engage = 0;
  let retreat = 0;
  let players = 0;
  let starters = 0;
  for (const unit of deciders) {
    const tactics = unitTactics(unit, nation, sources);
    engage += tactics.engage;
    retreat += tactics.retreatPct;
    const player = sources.playerOwned(unit.ownerId);
    if (player) players += 1;
    if (!player || sources.online(unit.ownerId)) starters += 1;
  }
  let power = 0;
  let hp = 0;
  let maxHp = 0;
  let speed = Number.MAX_SAFE_INTEGER;
  for (const unit of side) {
    const body = bodies?.get(unit.unitId);
    power += body?.power ?? 1000;
    hp += body?.hp ?? 0;
    maxHp += body?.maxHp ?? 0;
    speed = Math.min(speed, Math.max(0, unit.speed));
  }
  const count = deciders.length;
  return {
    deciders: count,
    starters,
    player: count > 0 && players === count,
    engage: count > 0 ? Math.floor(engage / count) : 0,
    retreatPct: count > 0 ? Math.floor(retreat / count) : 0,
    hpPct: bodies && maxHp > 0 ? Math.floor((hp * 100) / maxHp) : undefined,
    power,
    carries: side.some((unit) => carriers.has(unit.unitId)),
    speed: side.length > 0 ? speed : 0,
  };
}
