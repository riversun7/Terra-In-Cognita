// 지도에서 짓기 자리 고르기(연결점) — docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산" 4번.
// 경제 화면 짓기 폼이 [지도에서 고르기]를 누르면 고를 시설을 적고 2차맵으로 간다. 2차맵 화면은 땅을 누를 때 고르는 중이면 그 칸을 돌려주고
// 생산 칸으로 돌아온다(map/SecondaryMapScreen.tsx onGroundTap의 두 줄). 짓기 폼은 열릴 때 받은 칸으로 X·Y를 채운다.
// 기기 안 메모리 상태만이다(서버에 보내지 않는다, 판정은 지을 때 서버가 한다 — D-483). 경제·지도 두 지연 조각이 같이 쓴다.

/** 짓기 칸 범위(배치 칸 0~255, @terra/sim PLACEMENT_SIZE) */
const CELL_MAX = 255;

export interface BuildPickRequest {
  /** 지을 시설 ID */
  readonly facility: string;
}

export interface BuildPickResult {
  readonly facility: string;
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

let request: BuildPickRequest | null = null;
let result: BuildPickResult | null = null;

/** 고르기 시작(앞에 고른 칸은 버린다) */
export function requestBuildPick(next: BuildPickRequest): void {
  request = next;
  result = null;
}

/** 지금 고르는 중인 시설(없으면 null) — 2차맵 안내 글 */
export function pendingBuildPick(): BuildPickRequest | null {
  return request;
}

/** 2차맵이 누른 칸을 돌려준다(배치 칸 단위, 소수는 내림). 고르는 중이 아니거나 칸 밖이면 false(원래 누르기 처리) */
export function offerBuildPick(mapKey: number, cell: { readonly x: number; readonly y: number }): boolean {
  if (!request) return false;
  const x = Math.floor(cell.x);
  const y = Math.floor(cell.y);
  if (!(x >= 0 && x <= CELL_MAX && y >= 0 && y <= CELL_MAX)) return false;
  result = { facility: request.facility, mapKey, x, y };
  request = null;
  return true;
}

/** 고른 칸(지우지 않는다 — 폼이 처음 그릴 때 읽는다) */
export function peekBuildPick(): BuildPickResult | null {
  return result;
}

/** 고른 칸·고르는 중을 지운다(폼이 받은 뒤) */
export function clearBuildPick(): void {
  result = null;
  request = null;
}
