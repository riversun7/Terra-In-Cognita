// 레벨 0(맨손 채집) 건축 재료는 목재·석재의 T0~T1을 모두 받는다 — 기획 D-562 1563·1564(사용자 "레벨 0은 T0~T1 인정"), D-566 1723
// (사용자 "나무와 석재만 재료로 받아라"), D-551("필수 건물은 레벨 0 수준으로, 맨손 채집한 원자재만으로 짓는다"), D-552(표 하나 — 기본 건축 재료가
// 줄지 않게).
// - 건축 재료 묶음(BARE_HAND_GROUPS) = 목재(중분류 wood 전부)와 석재(광석 중분류의 석재·잡석만). 재료 줄의 아이템이 원자재(대분류 raw)이고 티어가
//   BARE_HAND_TIER_MAX(1) 이하이며 이 묶음에 들면, 같은 묶음의 켜진 T0~T1 아이템을 모두 그 줄의 재료로 센다(소나무 원목 줄 = 소나무·자작나무,
//   석재·잡석 줄 = 잡석·석재). 소금·이탄·화석 같은 광석 중분류의 다른 원자재는 건축 재료가 아니다(D-566 1723 — 그 아이템 줄이면 그 아이템만).
//   그 밖의 줄(가공 재료·높은 티어)도 그 아이템만. 지금 팩은 모든 시설의 레벨 1 짓기가 목재·석재 줄이다.
// - 나누기(allocateMaterials): 받는 아이템 묶음이 같은 줄끼리 합쳐(묶음은 같거나 겹치지 않는다) 묶음 재고 합 ≥ 줄 합이면 된다. 꺼내는 차례 =
//   줄마다 그 줄 아이템 먼저, 모자라면 묶음의 다른 아이템을 티어·팩 차례로.
// 서버 건물 짓기·레벨 올리기·수리(플레이어·NPC)와 시뮬 NPC 짓기가 같은 함수를 쓴다. 정수(BigInt)만 쓴다. 다른 내부 패키지를 가져오지 않는다.

/** 레벨 0 재료로 받는 가장 높은 티어 */
export const BARE_HAND_TIER_MAX = 1;

/**
 * 건축 재료 묶음(기획 D-566 1723 "나무와 석재만"): 중분류와 그 안에서 받는 아이템(없으면 중분류 전부). 묶음 키 = 중분류 [임시 — 아이템 편집기에
 * "건축 재료" 표시 칸이 생기면 그것으로 바꾼다, 질문 1764]
 */
export const BARE_HAND_GROUPS: readonly {
  readonly subcategory: string;
  readonly items?: readonly string[];
}[] = [{ subcategory: "wood" }, { subcategory: "ore", items: ["rubble", "stone"] }];

/** 레벨 0 건축 재료 묶음에 드는 원자재인가(원자재·T0~T1·묶음 안). 켜짐은 보지 않는다 */
export function isBareHandMaterial(item: BareHandItem): boolean {
  if (item.category !== "raw" || item.subcategory === undefined || item.tier > BARE_HAND_TIER_MAX)
    return false;
  const group = BARE_HAND_GROUPS.find((row) => row.subcategory === item.subcategory);
  return group !== undefined && (group.items === undefined || group.items.includes(item.id));
}

/** 받는 아이템을 고를 때 보는 아이템 요약 */
export interface BareHandItem {
  readonly id: string;
  /** 대분류(raw = 원자재) */
  readonly category: string;
  readonly subcategory?: string | undefined;
  readonly tier: number;
  readonly enabled?: boolean | undefined;
}

/**
 * 아이템 → 받는 아이템들(첫째 = 그 아이템, 그다음 같은 건축 재료 묶음의 켜진 T0~T1을 티어·목록 차례로). 건축 재료 묶음 밖이면 그 아이템 하나.
 * 목록에 없는 아이템도 그 아이템 하나
 */
export function bareHandAcceptsOf(items: readonly BareHandItem[]): (item: string) => readonly string[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const groups = new Map<string, string[]>();
  items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isBareHandMaterial(item) && item.enabled !== false)
    .toSorted((a, b) => a.item.tier - b.item.tier || a.index - b.index)
    .forEach(({ item }) => {
      const key = item.subcategory ?? "";
      const list = groups.get(key) ?? [];
      list.push(item.id);
      groups.set(key, list);
    });
  const cache = new Map<string, readonly string[]>();
  return (id) => {
    const known = cache.get(id);
    if (known) return known;
    const item = byId.get(id);
    const group =
      item && isBareHandMaterial(item) && item.subcategory !== undefined
        ? (groups.get(item.subcategory) ?? [])
        : [];
    const out = [id, ...group.filter((other) => other !== id)];
    cache.set(id, out);
    return out;
  };
}

/** 재료 한 줄(아이템 + 수량) */
export interface MaterialLine {
  readonly item: string;
  readonly qty: number | bigint;
}

/**
 * 재료 줄들을 실제로 꺼낼 아이템별 수량으로 나눈다(머리 주석). stockOf = 그 아이템 재고. 모자라면 undefined. 수량 0 이하 줄은 빠진다
 */
export function allocateMaterials(
  lines: readonly MaterialLine[],
  acceptsOf: (item: string) => readonly string[],
  stockOf: (item: string) => bigint,
): Map<string, bigint> | undefined {
  // 받는 묶음(첫째 빼고 정렬한 열쇠)마다 줄을 모은다
  const groups = new Map<string, { members: readonly string[]; lines: { item: string; qty: bigint }[] }>();
  for (const line of lines) {
    const qty = BigInt(line.qty);
    if (qty <= 0n) continue;
    const accepts = acceptsOf(line.item);
    const members = accepts.length > 0 ? accepts : [line.item];
    const key = [...members].toSorted().join("\u0000");
    const group = groups.get(key) ?? { members, lines: [] };
    group.lines.push({ item: line.item, qty });
    groups.set(key, group);
  }
  const left = new Map<string, bigint>();
  const stock = (item: string): bigint => {
    let have = left.get(item);
    if (have === undefined) {
      have = stockOf(item);
      left.set(item, have);
    }
    return have;
  };
  const take = new Map<string, bigint>();
  const use = (item: string, qty: bigint) => {
    left.set(item, stock(item) - qty);
    take.set(item, (take.get(item) ?? 0n) + qty);
  };
  // 묶음 하나짜리(받는 아이템이 그 아이템뿐)를 먼저 — 넓은 묶음이 그 아이템을 먼저 가져가지 않게
  const ordered = [...groups.values()].toSorted((a, b) => a.members.length - b.members.length);
  for (const group of ordered) {
    let need = 0n;
    for (const line of group.lines) need += line.qty;
    let have = 0n;
    for (const item of group.members) have += stock(item) > 0n ? stock(item) : 0n;
    if (have < need) return undefined;
    // 줄마다 그 줄 아이템 먼저
    const rest: bigint[] = [];
    for (const line of group.lines) {
      const own = stock(line.item);
      const first = own > 0n ? (own < line.qty ? own : line.qty) : 0n;
      if (first > 0n) use(line.item, first);
      rest.push(line.qty - first);
    }
    // 남은 양은 묶음 차례(티어·목록 차례)로
    let remain = 0n;
    for (const value of rest) remain += value;
    for (const item of group.members) {
      if (remain === 0n) break;
      const have2 = stock(item);
      if (have2 <= 0n) continue;
      const amount = have2 < remain ? have2 : remain;
      use(item, amount);
      remain -= amount;
    }
    if (remain > 0n) return undefined;
  }
  return take;
}
