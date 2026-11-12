// 세계 전투의 건물 목표 — 질문 381(기획 D-516 "다음 줄기: 전투 결과 → 건물 상태"), D-175(건물은 공격으로만 부순다)·D-5043(내구도로
// 물리 피해만)·기획 336 ③(영토 비콘 부수기 = 다른 건물 공격과 같다)·366·380 답("지금 코드대로"). docs/adr/2026-11-07-buildings-runtime.md
// "바뀜 (전투·건물)".
// - 시작 자료(BattleInit)에 targets 칸을 더해 전투 건물 ID → 세계 시설(2차맵 건물)·영토 비콘을 잇는다. 판정(@terra/sim)은 이 칸을 읽지
//   않는다(시뮬 출력·전투 결과는 그대로). 전투 서비스가 시작 자료를 그대로 저장하므로 다시 켜도 남는다.
// - 결과 적용(battleApply.ts, 결과 기록과 같은 동기 처리 = 같은 커밋): 잃은 내구도 = 시작 내구도 − 끝 내구도(0 아래는 0). 세계 쪽 상태(ppm)를
//   잃은 점 × 가득 ÷ 최대 내구도만큼 줄인다(올림, 건물 서비스·영토 서비스). 끝 내구도가 0이면 상태 0 = 폐허(기능 정지와 같다, 칸은 그대로,
//   수리로 되돌린다 — 366). 비콘은 30% 미만이면 꼭짓점이 아니고 0이어도 지우지 않는다(380). 한 전투는 한 번만 적용된다(결과 기록).
// - 바뀜 (2026-11-12, 기획 D-535 — 질문 1114 가): 공성 전투맵(도시 실제 배치)의 성벽·둘레 건물도 목표다(siegeFacilityTargets — 건물 공격·정원사
//   웨이브). 전투에서 깎이거나 부서진 만큼 세계 시설 상태가 줄고, 수리(플레이어·NPC 증축 수리)로 되돌린다 — 수리 재료가 성벽을 지키는 값이다.
import type { BattleInit } from "@terra/sim";
import type { BattleOutcome } from "./battles.ts";

export type BattleTargetKind = "facility" | "beacon";

/** 전투 건물 하나가 가리키는 세계 건물 */
export interface BattleTarget {
  /** 전투 건물 ID(시작 자료 map.buildings) */
  readonly building: number;
  readonly kind: BattleTargetKind;
  /** 세계 건물 ID(시설 = 2차맵 건물 ID, 비콘 = 영토 비콘 ID) */
  readonly id: number;
}

/** 세계 건물 목표를 단 시작 자료 */
export type WorldBattleInit = BattleInit & { readonly targets?: readonly BattleTarget[] | undefined };

const isTarget = (value: unknown): value is BattleTarget => {
  if (typeof value !== "object" || value === null) return false;
  const building: unknown = Reflect.get(value, "building");
  const kind: unknown = Reflect.get(value, "kind");
  const id: unknown = Reflect.get(value, "id");
  return (
    Number.isSafeInteger(building) && Number.isSafeInteger(id) && (kind === "facility" || kind === "beacon")
  );
};

/** 시작 자료의 세계 건물 목표(없거나 모양이 틀린 줄은 뺀다 — 다시 켤 때 DB에서 읽은 자료도 같다) */
export function targetsOf(init: object): BattleTarget[] {
  const raw: unknown = Reflect.get(init, "targets");
  return Array.isArray(raw) ? raw.filter(isTarget) : [];
}

/** 세계 건물 하나의 피해 */
export interface BuildingDamage {
  readonly kind: BattleTargetKind;
  readonly id: number;
  /** 잃은 내구도 점 */
  readonly lost: number;
  /** 끝 내구도가 0(폐허) */
  readonly destroyed: boolean;
}

/** 전투 결과의 세계 건물 피해(잃은 것이 없으면 뺀다). 끝 내구도가 없는 옛 결과는 피해 없음 */
export function buildingDamageOf(init: BattleInit, outcome: BattleOutcome): BuildingDamage[] {
  const end = new Map((outcome.buildings ?? []).map((building) => [building.id, building.durability]));
  const out: BuildingDamage[] = [];
  for (const target of targetsOf(init)) {
    const start = init.map.buildings.find((building) => building.id === target.building)?.durability;
    const after = end.get(target.building);
    if (start === undefined || after === undefined) continue;
    const left = Math.max(0, after);
    const lost = Math.max(0, start - left);
    if (lost > 0) out.push({ kind: target.kind, id: target.id, lost, destroyed: left <= 0 });
  }
  return out;
}

/** 세계 건물 상태를 줄이는 곳(건물 서비스·영토 서비스). 없는 건물이면 false */
export interface BuildingDamageSink {
  damageFacility(buildingId: number, lost: number, destroyed: boolean, atMs: number): boolean;
  damageBeacon(beaconId: number, lost: number, destroyed: boolean, atMs: number): boolean;
}

export interface AppliedBuildingDamage {
  readonly damaged: number;
  /** 0이 된(폐허) 건물·비콘 수 */
  readonly ruined: number;
  /** 세계에서 사라진 목표(건너뜀) */
  readonly missing: number;
}

/** 전투 결과의 건물 피해를 세계에 적용한다(동기, 쓰기 대기열에만 쓴다) */
export function applyBuildingDamage(
  sink: BuildingDamageSink,
  init: BattleInit,
  outcome: BattleOutcome,
  atMs: number,
): AppliedBuildingDamage {
  let damaged = 0;
  let ruined = 0;
  let missing = 0;
  for (const hit of buildingDamageOf(init, outcome)) {
    const done =
      hit.kind === "facility"
        ? sink.damageFacility(hit.id, hit.lost, hit.destroyed, atMs)
        : sink.damageBeacon(hit.id, hit.lost, hit.destroyed, atMs);
    if (!done) missing += 1;
    else {
      damaged += 1;
      if (hit.destroyed) ruined += 1;
    }
  }
  return { damaged, ruined, missing };
}

/**
 * 공성 전투맵의 시설 목표(질문 1114 가): 전투 건물 ID → 2차맵 건물 ID(siegeArena sources) 가운데 세계 시설인 것. skip = 따로 다루는 전투 건물
 * (넥서스 — 건물 공격은 대상 목표를 이미 달고, 웨이브는 정원사 결과 규칙이 정한다). 전투 건물 ID 차례
 */
export function siegeFacilityTargets(
  sources: ReadonlyMap<number, number>,
  isFacility: (buildingId: number) => boolean,
  skip: number,
): BattleTarget[] {
  const out: BattleTarget[] = [];
  for (const [building, id] of [...sources].toSorted((a, b) => a[0] - b[0]))
    if (building !== skip && isFacility(id)) out.push({ building, kind: "facility", id });
  return out;
}
