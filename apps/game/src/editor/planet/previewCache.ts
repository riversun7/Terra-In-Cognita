// 미리보기 결과 기억(순수) — ADR 38 3절 "바이트 상한(처음 32MiB)을 두고 오래된 것부터 버린다. 공개본 결과는 남긴다"
// - 열쇠 = 미리보기 열쇠(면 레벨 + 키를 정렬한 생성기 입력 JSON, previewJobs.ts previewKey).
// - 크기 = 결과가 화면 스레드에 남기는 바이트(워커가 넘긴 배열 크기, outputBytes).
// - 오래 안 쓴 것부터 버린다(LRU). 고정한 열쇠(공개본 빠른 결과·공개본 본 결과)는 버리지 않는다. 방금 넣은 것도 버리지 않는다.
//   그래서 고정한 것과 방금 넣은 것만으로 상한을 넘으면 상한을 넘은 채로 둔다(설계 D.3).
// - 큰 결과(F9, 약 22MiB)는 다음 본 결과가 들어오면 버린다(dropLevelsExcept).
export const DEFAULT_CACHE_BYTES = 32 * 1024 * 1024;

interface CacheSlot<T> {
  readonly value: T;
  readonly bytes: number;
  readonly level: number;
}

export interface PreviewCache<T> {
  get(key: string): T | undefined;
  /** 쓴 것으로 치지 않고 본다 */
  peek(key: string): T | undefined;
  has(key: string): boolean;
  /** 넣고(같은 열쇠면 바꾼다) 상한을 넘으면 오래된 것부터 버린다. 버린 열쇠를 돌려준다 */
  set(key: string, value: T, bytes: number, level: number): string[];
  /** 고정할 열쇠를 바꾼다(이전 고정은 풀린다). 상한을 다시 맞춘다 */
  pin(keys: Iterable<string>): string[];
  /** 레벨이 min 이상인 결과 중 keep이 아닌 것(고정 제외)을 버린다 */
  dropLevelsExcept(minLevel: number, keep: string): string[];
  delete(key: string): void;
  clear(): void;
  /** 기억한 바이트 합 */
  bytes(): number;
  /** 열쇠 목록(오래 안 쓴 것부터) */
  keys(): string[];
  readonly capacity: number;
}

export function createPreviewCache<T>(capacity = DEFAULT_CACHE_BYTES): PreviewCache<T> {
  // Map은 넣은 차례를 지킨다: 쓸 때마다 지우고 다시 넣어 맨 뒤(가장 최근)로 보낸다
  const slots = new Map<string, CacheSlot<T>>();
  let pinned = new Set<string>();
  let total = 0;

  const remove = (key: string): void => {
    const slot = slots.get(key);
    if (!slot) return;
    total -= slot.bytes;
    slots.delete(key);
  };

  /** 상한을 넘으면 오래된 것부터 버린다(고정·except 제외) */
  const trim = (except: string | null): string[] => {
    const dropped: string[] = [];
    let left = total;
    for (const [key, slot] of slots) {
      if (left <= capacity) break;
      if (key === except || pinned.has(key)) continue;
      dropped.push(key);
      left -= slot.bytes;
    }
    for (const key of dropped) remove(key);
    return dropped;
  };

  return {
    capacity,
    get(key) {
      const slot = slots.get(key);
      if (!slot) return undefined;
      slots.delete(key);
      slots.set(key, slot);
      return slot.value;
    },
    peek: (key) => slots.get(key)?.value,
    has: (key) => slots.has(key),
    set(key, value, bytes, level) {
      remove(key);
      slots.set(key, { value, bytes, level });
      total += bytes;
      return trim(key);
    },
    pin(keys) {
      pinned = new Set(keys);
      return trim(null);
    },
    dropLevelsExcept(minLevel, keep) {
      const dropped = [...slots.entries()]
        .filter(([key, slot]) => slot.level >= minLevel && key !== keep && !pinned.has(key))
        .map(([key]) => key);
      for (const key of dropped) remove(key);
      return dropped;
    },
    delete: remove,
    clear() {
      slots.clear();
      total = 0;
    },
    bytes: () => total,
    keys: () => [...slots.keys()],
  };
}
