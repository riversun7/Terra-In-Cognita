// 판 줄의 전투력·자산 칸(house-9, 기획 D-576 "전투력, 자산, 등") — 값 표 ranking_worth를 읽은 줄(worth_power·worth_assets 글자)에서 만든다.
// 경로 판(reads.ts)과 가문 판(houseBoard.ts)이 같이 쓴다. 집계에 값이 없으면 칸을 싣지 않는다.
import type { RankingRow } from "@terra/shared/ranking";

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

export function worthOf(row: Record<string, unknown>): Pick<RankingRow, "worth"> {
  const power = text(row.worth_power);
  const assets = text(row.worth_assets);
  return power === null && assets === null ? {} : { worth: { power: power ?? "0", assets: assets ?? "0" } };
}
