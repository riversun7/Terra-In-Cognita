// 운영자 빠르기 — 사용자 지적(2026-11-09) "운영자모드에서 이동속도를 훨씬빠르게", (2026-11-12) "운영자모드에서 이동시 맵을클릭할때는 빠른속도가
// 적용되나 작업이나 다른 명령시엔 원래느린속도다".
// - 운영자 모드 = 같은 연결이 2차맵을 전체 보기(observe)로 구독 중 + 모든 유닛을 부릴 수 있는 역할(canCommandAnyUnit — 권한 표 move-unit, dev·admin).
// - 운영자 모드 연결이 유닛 명령(이동·멈추기·2차맵 사이 이동·채집·들어가기·직무 배치 등)을 보내면 그 유닛에 운영자 빠르기 표시를 단다
//   (그 유닛이 선 2차맵의 SecondMap.setPace). 그 뒤 그 유닛을 걷게 하는 길(SecondMap.moveUnit에 빠르기를 따로 주지 않은 것 — 채집 줄 왕복,
//   들어가기, 운반꾼 걸음 등)은 모두 표시를 읽어 OPERATOR_SPEED_FACTOR배로 걷는다. 운영자 모드가 아닌 연결의 명령이 오면 표시를 지운다.
//   명령이 거절되면 표시를 되돌린다(남의 거절된 명령이 표시를 바꾸지 않게).
// - 서버 권위: 표시는 서버만 단다(기기는 빠르기를 보내지 않는다). 유닛 속도와 종류 판정(unitKinds.ts wireKindOf)은 그대로 — 그 이동의 빠르기만.
// - 표시(paces)와 배율은 메모리에만 둔다(다시 켜면 운영자 연결이 끊긴 것과 같아 보통). 다만 이미 걷던 한 움직임은 저장한 움직임 속도
//   (world_units.motion_speed, secondMapRows.ts motionOfRow)로 다시 켜도 같은 자리·같은 도착 시각으로 끝나고, 다음 걸음부터 보통이다.
//   2차맵을 넘으면 표시는 따라가지 않는다(2차맵 사이 이동은 길마다 자기 빠르기를 든다 — travel/service.ts. 다시 켜면 보통 빠르기로 잇는다).
// - 배율(기획 D-560 1246~1248, 2026-11-15): 운영자 유닛은 배율을 고를 수 있지만 기본은 1(보통 유닛과 같다). 배율은 연결마다(createOperatorPace —
//   session.ts가 연결 하나에 하나 만들고 2차맵·채집·직무·이동·배 게이트웨이가 같이 본다), 기기가 operator_pace로 바꾼다(1 ~ OPERATOR_PACE_MAX).
//   운영자 모드를 끄면(그 연결의 전체 보기 구독이 모두 풀리면) 배율을 1로 돌리고, 그 연결이 빠른 표시를 단 유닛의 표시를 바로 지우고 가는 길의
//   빠르기도 1로 돌린다(onRelease — 이동 서비스). 이미 걷기 시작한 한 구간은 그 빠르기로 끝난다(다음 걸음부터 보통, Assumed: 그 구간은 짧다).
import { OPERATOR_PACE_MAX } from "@terra/protocol";
import type { Role } from "@terra/shared";
import { canCommandAnyUnit } from "./unitControl.ts";

/**
 * 운영자 배율로 고를 수 있는 가장 큰 값(유닛 속도 × 이 값). 그 이동 하나에만 — 유닛 속도는 그대로. 사용자 지적 2026-11-09 "10배 더 빠르게"로
 * 10 → 100(걷기 437 × 100 = 43,700, 프로토콜 상한 1,048,576 안). 기본은 1이다(D-560 1246 — operator_pace로 고른다)
 */
export const OPERATOR_SPEED_FACTOR = OPERATOR_PACE_MAX;

/**
 * 유닛마다 가장 나중에 표시를 단 명령의 번호. 명령 하나가 늦게 거절되어도(예: 다른 연결의 새 명령에 밀린 superseded) 그 뒤 명령이 단
 * 표시를 되돌리지 않게 한다. 명령이 끝나면 지운다
 */
const latestMark = new Map<number, number>();
let markCounter = 0;

/** 연결 하나의 운영자 배율(게이트웨이들이 본다) */
export interface OperatorPaceLink {
  /** 지금 배율: 운영자 모드(전체 보기 구독 중)면 고른 값, 아니면 1 */
  factor(): number;
  /** 이 연결이 빠른 표시(배율 > 1)를 단 유닛 — 운영자 모드를 끄면 푼다 */
  note(unitId: number): void;
  /** 운영자 모드를 끌 때 풀린 유닛 목록을 받는다(이동 서비스가 가는 길의 빠르기를 1로). 해제 함수를 돌려준다 */
  onRelease(listener: (unitIds: readonly number[]) => void): () => void;
}

/** 연결 하나의 운영자 배율 상태(2차맵 게이트웨이가 바꾼다) */
export interface OperatorPace extends OperatorPaceLink {
  /** 배율을 고른다(1 ~ OPERATOR_PACE_MAX로 자른다) */
  set(factor: number): void;
  /**
   * 운영자 모드(전체 보기 구독)가 켜졌는지 알린다. 꺼지면 배율을 1로 돌리고, 표시를 단 유닛의 표시를 지우고(maps) 듣는 쪽에 알린다.
   * 풀린 유닛 목록을 돌려준다
   */
  setObserving(on: boolean, maps: Iterable<PaceMap>): readonly number[];
}

/** 연결 하나의 운영자 배율(기본 1) */
export function createOperatorPace(): OperatorPace {
  let observing = false;
  let chosen = 1;
  const noted = new Set<number>();
  const listeners = new Set<(unitIds: readonly number[]) => void>();
  return {
    factor: () => (observing ? chosen : 1),
    note(unitId) {
      noted.add(unitId);
    },
    onRelease(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(factor) {
      chosen = Math.min(OPERATOR_PACE_MAX, Math.max(1, Math.trunc(factor)));
    },
    setObserving(on, maps) {
      if (on) {
        observing = true;
        return [];
      }
      if (!observing) return [];
      observing = false;
      chosen = 1;
      const released = [...noted];
      noted.clear();
      if (released.length === 0) return released;
      const list = [...maps];
      for (const unitId of released) {
        latestMark.delete(unitId);
        for (const map of list) {
          if (map.unitInfo(unitId) === undefined) continue;
          if (map.paceOf(unitId) > 1) map.setPace(unitId, 1);
          break;
        }
      }
      for (const listener of listeners) listener(released);
      return released;
    },
  };
}

/** 시험·고정 배율 연결(늘 그 배율) */
export function fixedOperatorPace(factor: number): OperatorPaceLink {
  return { factor: () => factor, note: () => {}, onRelease: () => () => {} };
}

/** 운영자 빠르기 표시를 다는 2차맵(SecondMap의 일부) */
export interface PaceMap {
  unitInfo(unitId: number): unknown;
  /** 표시를 바꾼다(1이면 지운다). 앞 값(유닛이 없으면 undefined) */
  setPace(unitId: number, factor: number): number | undefined;
  paceOf(unitId: number): number;
}

/** 이 연결·사용자가 보내는 유닛 명령이 운영자 모드인가(전체 보기 구독 + 모든 유닛 명령 권한) */
export function isOperatorMode(observing: boolean, roles: readonly Role[]): boolean {
  return observing && canCommandAnyUnit(roles);
}

/** 이 연결의 유닛 명령 걷기 배율: 운영자 모드면 고른 배율(없으면 1), 아니면 1 */
export function operatorFactor(
  link: { observing?(): boolean; operatorPace?: OperatorPaceLink | undefined },
  roles: readonly Role[],
): number {
  if (!isOperatorMode(link.observing?.() === true, roles)) return 1;
  return link.operatorPace?.factor() ?? 1;
}

/** 단 표시 하나: 되돌리기(거절된 명령)·놓기(끝난 명령) */
export interface PaceMark {
  undo(): void;
  release(): void;
}

/**
 * 유닛 하나의 표시를 단다(배율 factor, 1이면 지움). 그 뒤 다른 명령이 표시를 달았으면 되돌리지 않는다.
 * 유닛을 띄운 2차맵이 없으면 아무것도 하지 않는다
 */
export function markPace(maps: Iterable<PaceMap>, unitId: number, factor: number): PaceMark {
  markCounter += 1;
  const token = markCounter;
  latestMark.set(unitId, token);
  const release = (): void => {
    if (latestMark.get(unitId) === token) latestMark.delete(unitId);
  };
  for (const map of maps) {
    if (map.unitInfo(unitId) === undefined) continue;
    const previous = map.setPace(unitId, factor);
    return {
      undo: () => {
        if (previous !== undefined && latestMark.get(unitId) === token) map.setPace(unitId, previous);
        release();
      },
      release,
    };
  }
  return { undo: release, release };
}

/**
 * 유닛 명령 하나를 돌린다: 먼저 표시를 달고(명령이 시작하는 걸음이 읽는다), 결과가 실패면 되돌린다. 된 명령이 빠른 표시(factor > 1)를 달았으면
 * 그 연결(pace)에 적어 둔다(운영자 모드를 끄면 푼다)
 */
export async function withPace<R extends { readonly ok: boolean }>(
  maps: Iterable<PaceMap>,
  unitId: number,
  factor: number,
  run: () => Promise<R>,
  pace?: OperatorPaceLink,
): Promise<R> {
  const mark = markPace(maps, unitId, factor);
  try {
    const result = await run();
    if (result.ok) {
      mark.release();
      if (factor > 1) pace?.note(unitId);
    } else mark.undo();
    return result;
  } catch (error) {
    mark.undo();
    throw error;
  }
}
