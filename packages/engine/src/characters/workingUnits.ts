// 일하는 유닛(채집 등) 표시 — 사용자 요청 2026-11-14 "채집 모션추가". 화면이 유닛 ID 목록을 주면(setWorkingUnits) 프레임마다 칸 표시로 바꿔
// 캐릭터 층(characterLayer.ts)에 넘긴다. 서 있는 일하는 유닛은 휘두르기 자세로 그린다(걷는 중이면 걷기). 엔진 파일 크기 때문에 따로 둔다.
// 바뀜(사용자 답 2026-11-15 "숨기고 건물에 표시"): 건물 안에 든 유닛(setHiddenUnits)도 같은 칸 표시에 HIDDEN_FLAG로 싣는다 — 캐릭터·캡슐·점·나라
// 고리가 그 칸을 그리지 않는다.

/** 칸 표시 값: 일하는 유닛 */
export const WORKING_FLAG = 1;
/** 칸 표시 값: 건물 안에 들어 숨긴 유닛(일하는 표시보다 앞선다) */
export const HIDDEN_FLAG = 2;

export class WorkingUnits {
  private ids = new Set<number>();
  private hidden = new Set<number>();
  private readonly flags: Uint8Array;

  constructor(capacity: number) {
    this.flags = new Uint8Array(capacity);
  }

  /** 일하는 유닛 ID 목록을 통째로 바꾼다(after = 바뀐 뒤 다시 그리기 요청) */
  set(ids: Iterable<number>, after?: () => void): void {
    this.ids = new Set(ids);
    after?.();
  }

  /** 숨길 유닛(건물 안) ID 목록을 통째로 바꾼다 */
  hide(ids: Iterable<number>, after?: () => void): void {
    this.hidden = new Set(ids);
    after?.();
  }

  /** 이번 프레임 칸 표시(아무도 없으면 undefined). slotOf = 유닛 ID → 칸(없으면 음수) */
  slots(count: number, slotOf: (id: number) => number): Uint8Array | undefined {
    if (this.ids.size === 0 && this.hidden.size === 0) return undefined;
    this.flags.fill(0, 0, Math.min(count, this.flags.length));
    const mark = (id: number, flag: number): void => {
      const slot = slotOf(id);
      if (slot >= 0 && slot < count && slot < this.flags.length) this.flags[slot] = flag;
    };
    for (const id of this.ids) mark(id, WORKING_FLAG);
    for (const id of this.hidden) mark(id, HIDDEN_FLAG);
    return this.flags;
  }
}
