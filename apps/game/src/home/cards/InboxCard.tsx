// 처리할 일 카드(격자 템플릿의 첫 카드) — 앞 몇 줄과 바로 처리, 나머지는 처리함에서. 2×1은 3줄, 2×2는 6줄
import type { CardSize } from "@terra/shared/dashboard";
import type { HomeData } from "../homeData.ts";
import type { CardBodyProps } from "../homeTypes.ts";
import { pendingCount } from "../homeView.ts";
import { InboxBody } from "../InboxBody.tsx";
import { formatCount } from "../numbers.ts";

/** 카드 크기마다 보이는 줄 수 */
const ROWS: { readonly [S in CardSize]: number } = { "1x1": 2, "2x1": 3, "2x2": 6 };

/** 처리할 일 수(완료 뺌, 종 배지와 같은 수). 제목 바로 뒤에 두어 "처리할 일 7"로 읽힌다. 받기 전이거나 0이면 그리지 않는다 */
export function PendingCount({ data }: { data: HomeData }) {
  const counts = data.inbox.value?.counts;
  const count = counts === undefined ? 0 : pendingCount(counts);
  if (count === 0) return null;
  return <span className="home-count">{formatCount(count)}</span>;
}

export function InboxCardBody({ data, size, onQuickAction }: CardBodyProps) {
  return <InboxBody data={data} limit={ROWS[size]} onQuickAction={onQuickAction} />;
}
