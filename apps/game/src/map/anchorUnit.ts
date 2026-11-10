// 카메라가 붙는 유닛(기준 유닛) 고르기 — 순수 함수(시험 대상). docs/adr/2026-11-08-seamless-second-map.md WP-1(사용자 답 2026-11-08
// "항상 유닛이 선택된 상태여야하고 기본은 사이보그 본체위치 기본이다. 항상 선택된 유닛 기준 or 사이보그 기준 거리다. 자유시점부터 고쳐 없애야한다.").
// - 플레이어 카메라는 늘 내 유닛 하나를 따라간다(자유 시점 없음). 근처 목록의 거리도 이 유닛에서 잰다.
// - 차례: 고른 유닛이 다룰 수 있는 유닛(내 유닛, 운영자 모드면 아무 유닛)이면 그 유닛 → 마지막으로 고른 내 유닛(아직 이 맵에 있으면) →
//   이 맵의 내 사이보그 → 이 맵 내 유닛 목록의 첫 유닛(유닛 화면 차례) → 없음.
// - 남의 유닛을 고르면(정보만) 카메라는 그대로 앞의 기준 유닛에 둔다.
// - 운영자 자유 시점(운영자만, 사용자 답 Q2)이면 없음(따라가지 않고 끌어서 옮긴다).
import type { MapUnit } from "@terra/shared/mapUnits";

export interface AnchorInput {
  /** 운영자 모드(아무 유닛이나 기준이 될 수 있다) */
  readonly operator: boolean;
  /** 운영자 자유 시점(켜면 기준 유닛 없음) */
  readonly freeView: boolean;
  /** 지금 고른 유닛(엔진·화면) */
  readonly selected: number | null;
  /** 고른 유닛을 다룰 수 있나(내 유닛·운영자 모드) */
  readonly selectedFollowable: boolean;
  /** 마지막으로 목록·지도에서 고른 유닛(없으면 null) */
  readonly lastPicked: number | null;
  /** 이 2차맵의 내 유닛(받기 전 null) */
  readonly units: readonly Pick<MapUnit, "unitId">[] | null;
  /** 이 2차맵에 있는 내 사이보그 유닛(없으면 null) */
  readonly cyborgUnitId: number | null;
}

/** 카메라가 따라갈 유닛(없으면 null) */
export function chooseAnchor(input: AnchorInput): number | null {
  if (input.operator && input.freeView) return null;
  if (input.selected !== null && input.selectedFollowable) return input.selected;
  const units = input.units ?? [];
  const here = (id: number | null): id is number => id !== null && units.some((unit) => unit.unitId === id);
  // 운영자는 내 목록에 없는 유닛도 기준으로 둔다(남의 유닛을 골랐다가 다른 곳을 눌러 고르기가 풀린 경우)
  if (input.lastPicked !== null && (input.operator || here(input.lastPicked))) return input.lastPicked;
  if (input.cyborgUnitId !== null && (input.units === null || here(input.cyborgUnitId)))
    return input.cyborgUnitId;
  return units[0]?.unitId ?? null;
}

/** 이 2차맵에 들어갈 수 없나: 플레이어인데 이 맵에 내 유닛이 하나도 없다(받은 뒤에만, 사용자 답 Q3 "선택된 유닛이 기본 고정이라 못들어감") */
export function blockedWithoutUnits(input: {
  readonly operator: boolean;
  readonly units: readonly unknown[] | null;
}): boolean {
  return !input.operator && input.units !== null && input.units.length === 0;
}

/**
 * 명령을 받을 유닛 하나(사용자 지적 2026-11-09 문제3 "사이보그선택상태이나 건물 누르면 고른 유닛1001이라는 이상한 상태"): 아래 안내 줄의 고른 유닛을
 * 다룰 수 있으면(내 유닛·운영자 모드) 그 유닛, 남의 유닛을 살펴보는 중이면 기준 유닛(내 유닛), 없으면 이 맵의 내 사이보그. 건물 판의 "보낼 유닛"·
 * 채집이 이것 하나를 쓴다(옛: 건물 판은 기준 유닛만 봐서 운영자 자유 시점에 고른 유닛과 달랐다)
 */
export function commandUnit(input: {
  /** 아래 안내 줄의 고른 유닛(늘 하나 — 엔진이 고르기 전이면 기준 유닛) */
  readonly shown: number | null;
  /** 그 유닛을 다룰 수 있나(남의 유닛이 아님) */
  readonly shownCommandable: boolean;
  readonly anchor: number | null;
  readonly cyborgUnitId: number | null;
}): number | null {
  if (input.shown !== null && input.shownCommandable) return input.shown;
  return input.anchor ?? input.cyborgUnitId;
}

/**
 * 지도에서 누른 유닛을 어떻게 다루나(사용자 지적 2026-11-09 "이동하려는데 다른 유닛이 선택되는문제 … 다른 유닛 눌려지면 상호작용 메뉴가 나오거나
 * 다른곳을 눌러 저절로 닫히게 해야함", 2026-11-10 "다른 유닛 클릭 후 이동지역 클릭시 무시하고 본인 유닛이 이동하게 하라"): 내 유닛이면 고른다(명령
 * 유닛이 된다). 남의 유닛이면 누구든(운영자 모드도) 명령 유닛은 그대로 두고 그 유닛의 작은 창만 연다(peek) — 누르기만으로 명령 유닛이 바뀌지 않는다.
 * 운영자는 작은 창의 [이 유닛 조종]으로만 남의 유닛을 명령 유닛으로 삼는다. 이미 명령 유닛인 유닛(운영자가 조종 중)을 다시 누르면 그대로 고른다
 */
export function unitTapOf(input: {
  /** 내 유닛인가(시야 전송의 내 유닛 표시·이 2차맵 내 유닛 목록) */
  readonly own: boolean;
  /** 지금 명령 유닛(고른 유닛)인가 */
  readonly commanding: boolean;
}): "select" | "peek" {
  return input.own || input.commanding ? "select" : "peek";
}

/**
 * 땅을 눌렀을 때 보낼 유닛(사용자 지적 2026-11-10 "다른 유닛 클릭 후 이동지역 클릭시 무시하고 본인 유닛이 이동"): 고른 유닛을 다룰 수 있으면
 * (내 유닛·운영자 모드) 그 유닛. 고른 유닛이 남의 유닛이면(운영자 모드를 끈 직후처럼 남은 고르기) 무시하고 기준 유닛(내 유닛)을 보낸다.
 * 둘 다 없으면 null
 */
export function groundTapUnit(input: {
  readonly selected: number | null;
  readonly anchor: number | null;
  /** 그 유닛을 다룰 수 있나(남의 유닛이 아님 — 지금 못 움직이는 내 유닛은 참: 까닭을 알린다) */
  readonly commandable: (unitId: number) => boolean;
}): number | null {
  if (input.selected !== null && input.commandable(input.selected)) return input.selected;
  return input.anchor ?? input.selected;
}

/**
 * 아래 판 자리에 보일 판 하나 — 누른 건물·오브젝트 판 > 남의 유닛 정보 판 > 내 유닛 목록 > 근처 판(사용자 지적 2026-11-09 문제4 "하나의 건물
 * 클릭시 여러개가 다 뜬다"). 정보 판을 열면 건물 판을 닫으므로 둘이 함께 열려 있을 때는 나중에 연 건물 판이다
 */
export type BottomSheet = "gather" | "peek" | "units" | "nearby";

export function bottomSheetOf(input: {
  readonly gatherOpen: boolean;
  readonly peekOpen: boolean;
  readonly unitsOpen: boolean;
}): BottomSheet {
  if (input.gatherOpen) return "gather";
  if (input.peekOpen) return "peek";
  return input.unitsOpen ? "units" : "nearby";
}

/** 움직임이 끊겨 보여도 "움직이는 중"으로 남겨 두는 시간(ms). 엔진 값은 1초마다 읽으니 한두 번 놓친 정도는 덮는다 */
export const STOP_HOLD_MS = 2_000;

/** 엔진의 움직임 값을 잠깐 붙잡는다: 지금 움직이거나, 같은 유닛이 방금(STOP_HOLD_MS 안) 움직였으면 참 */
export function heldMoving(moving: boolean, lastMovingAt: number | null, now: number): boolean {
  return moving || (lastMovingAt !== null && now - lastMovingAt < STOP_HOLD_MS);
}

/**
 * [멈추기]를 보일까(사용자 지적 2026-11-09: 2차맵 사이를 가는 중에 단추가 나타났다 사라졌다 해서 누르기 어렵다).
 * 엔진의 움직임만 보면 경로 구간 사이나 경계를 넘는 순간에 꺼진다 → 2차맵 사이를 가는 중(서버 travel 상태)이면 늘 보인다.
 * moving은 heldMoving으로 붙잡은 값이다
 */
export function showStop(input: {
  /** 고른 유닛을 명령할 수 있나(내 유닛·운영자 모드) */
  readonly commandable: boolean;
  readonly moving: boolean;
  /** 고른 유닛이 2차맵 사이를 가는 중인가(구간 사이에도 참) */
  readonly travelling: boolean;
}): boolean {
  return input.commandable && (input.moving || input.travelling);
}
