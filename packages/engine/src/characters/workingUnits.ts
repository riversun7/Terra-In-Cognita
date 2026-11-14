// 일하는 유닛(채집 등) 표시 — 사용자 요청 2026-11-14 "채집 모션추가". 화면이 유닛 ID 목록을 주면(setWorkingUnits) 프레임마다 칸 표시로 바꿔
// 캐릭터 층(characterLayer.ts)에 넘긴다. 서 있는 일하는 유닛은 휘두르기 자세로 그린다(걷는 중이면 걷기). 엔진 파일 크기 때문에 따로 둔다.
export class WorkingUnits {
  private ids = new Set<number>();
  private readonly flags: Uint8Array;

  constructor(capacity: number) {
    this.flags = new Uint8Array(capacity);
  }

  /** 일하는 유닛 ID 목록을 통째로 바꾼다 */
  set(ids: Iterable<number>): void {
    this.ids = new Set(ids);
  }

  /** 이번 프레임 칸 표시(아무도 없으면 undefined). slotOf = 유닛 ID → 칸(없으면 음수) */
  slots(count: number, slotOf: (id: number) => number): Uint8Array | undefined {
    if (this.ids.size === 0) return undefined;
    this.flags.fill(0, 0, Math.min(count, this.flags.length));
    for (const id of this.ids) {
      const slot = slotOf(id);
      if (slot >= 0 && slot < count && slot < this.flags.length) this.flags[slot] = 1;
    }
    return this.flags;
  }
}
