// 세계 배치 화면 "도시 건물 배치" 판의 그림 셈 — docs/adr/2026-11-11-city-building-layout.md 5절. 서버가 준 도시 하나(지금 자리·다시 놓은 뒤
// 자리)를 2차맵 배치 칸 좌표의 네모·선으로 바꾼다(그림 자료라 판정에 쓰지 않는다).
// - 길(출퇴근): 채집소 → 가장 가까운 숙소 → 행정 건물. 옮김: 채집소 → 가장 가까운 창고.
import type {
  WorldCityLayoutBuilding,
  WorldCityLayoutCity,
  WorldCityLayoutRect,
  WorldCityLayoutRole,
} from "@terra/shared/worldPlacementApi";

/** 지금 자리 | 다시 놓은 뒤 */
export type CityLayoutMode = "now" | "planned";

export interface LayoutRectView extends WorldCityLayoutRect {
  readonly id: number;
  readonly role: WorldCityLayoutRole;
  readonly pinned: boolean;
  /** 다시 놓으면 옮겨지는 건물 */
  readonly moves: boolean;
}

export interface LayoutLine {
  readonly id: string;
  readonly kind: "route" | "haul";
  /** 점들 "x,y x,y …"(칸 가운데) */
  readonly points: string;
}

const PLACEMENT_SIZE = 256;
/** 그림 창 한 변의 반(칸) 아래 끝 */
const MIN_HALF = 40;

const moved = (building: WorldCityLayoutBuilding) =>
  building.to !== null && (building.to.x !== building.x || building.to.y !== building.y);

/** 그 모드의 건물 자리 */
export function layoutRects(city: WorldCityLayoutCity, mode: CityLayoutMode): LayoutRectView[] {
  return city.buildings.map((building) => {
    const at = mode === "planned" && building.to ? building.to : building;
    return {
      id: building.id,
      role: building.role,
      pinned: building.pinned,
      moves: moved(building),
      x: at.x,
      y: at.y,
      width: at.width,
      height: at.height,
    };
  });
}

/** 네모 가운데(칸 가운데 좌표) */
export function middle(rect: WorldCityLayoutRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

const distance2 = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

function nearest(
  from: { x: number; y: number },
  rects: readonly LayoutRectView[],
): { x: number; y: number } | undefined {
  let best: { at: { x: number; y: number }; d: number } | undefined;
  for (const rect of rects) {
    const at = middle(rect);
    const d = distance2(from, at);
    if (!best || d < best.d) best = { at, d };
  }
  return best?.at;
}

const pointsOf = (list: readonly { x: number; y: number }[]) => list.map((p) => `${p.x},${p.y}`).join(" ");

/** 출퇴근 길·옮김 선 */
export function layoutLines(rects: readonly LayoutRectView[]): LayoutLine[] {
  const hall = rects.find((rect) => rect.role === "core");
  const lodgings = rects.filter((rect) => rect.role === "living");
  const storages = rects.filter((rect) => rect.role === "storage");
  const out: LayoutLine[] = [];
  for (const station of rects.filter((rect) => rect.role === "gather")) {
    const from = middle(station);
    const lodge = nearest(from, lodgings);
    if (lodge)
      out.push({
        id: `r${station.id}`,
        kind: "route",
        points: pointsOf([from, lodge, ...(hall ? [middle(hall)] : [])]),
      });
    const store = nearest(from, storages);
    if (store) out.push({ id: `h${station.id}`, kind: "haul", points: pointsOf([from, store]) });
  }
  return out;
}

/** 그림 창(배치 칸): 도시 칸 둘레, 두 모드의 건물이 모두 들게(2차맵 안으로 자름) */
export function layoutWindow(city: WorldCityLayoutCity): { x: number; y: number; size: number } {
  let half = MIN_HALF;
  for (const building of city.buildings)
    for (const rect of building.to ? [building, building.to] : [building]) {
      half = Math.max(
        half,
        Math.abs(rect.x - city.center.x) + 4,
        Math.abs(rect.x + rect.width - city.center.x) + 4,
        Math.abs(rect.y - city.center.y) + 4,
        Math.abs(rect.y + rect.height - city.center.y) + 4,
      );
    }
  const size = Math.min(PLACEMENT_SIZE, 2 * half);
  const clamp = (value: number) => Math.min(PLACEMENT_SIZE - size, Math.max(0, value));
  return { x: clamp(city.center.x - half), y: clamp(city.center.y - half), size };
}

/** 지금 → 다시 놓은 뒤 글("a → b", 값이 없으면 "-") */
const text = (value: number | null) => (value === null ? "-" : String(value));

export function shift(now: number | null, planned: number | null): string {
  return `${text(now)} → ${text(planned)}`;
}
