// 복귀 요약(D-6014·D-266) — summary.get. 없는 동안 일어난 일(생산·습격과 방어·부상·세계 소식)을 칸마다 센다.
// ADR 2026-10-29-app-shell 8절
// - 보일지(show)는 서버가 정한다. 처음 기준: 마지막 확인 뒤 사건이 0개면 건너뛴다(기준 수치는 Step 5).
// - 지금은 사건 출처가 없다. 그래서 실제 계정은 늘 show: false다. 마지막 확인 시각 표와 summary.ack는 첫 사건 출처
//   (S3 오프라인 정산, 생산)와 함께 만든다. 그때까지 since는 null이다.
// - 시안 자료(preview, dev·admin)는 8시간 동안의 칸 4종을 더한다(inbox/preview.ts).
import type { SummaryGetResponse, SummarySection } from "@terra/shared/inbox";
import { PREVIEW_SUMMARY_SPAN_MS, previewSummarySections } from "../inbox/preview.ts";
import type { InboxAccount } from "../inbox/types.ts";

/**
 * 사건 출처 — 한 칸(생산·습격 등)의 사건을 센다. 그 시스템을 만들 때 시스템 모듈에 두고 createSummarySources에 한 줄 더한다.
 * since = 마지막으로 확인한 시각(없으면 null = 처음부터), until = 이 요약이 덮는 끝(지금).
 */
export interface SummarySource {
  /** 칸 종류(@terra/shared/inbox SUMMARY_SECTION_KINDS) */
  readonly kind: string;
  collect(account: InboxAccount, since: number | null, until: number): Promise<SummarySection>;
}

/** 서버가 쓰는 사건 출처들. 지금은 0개다 */
export function createSummarySources(): readonly SummarySource[] {
  return [];
}

/** summary.get 응답. 사건이 0개인 칸은 빼고, 남은 칸이 있으면 보인다 */
export async function collectSummary(
  sources: readonly SummarySource[],
  account: InboxAccount,
  now: number,
  preview: boolean,
): Promise<SummaryGetResponse> {
  // 확인 시각 표가 없다(첫 사건 출처와 함께 만든다). 시안 자료는 8시간 전에 확인한 것으로 보인다
  const since = preview ? now - PREVIEW_SUMMARY_SPAN_MS : null;
  const found = await Promise.all(sources.map((source) => source.collect(account, null, now)));
  const sections = found.filter((section) => section.count > 0);
  if (preview) sections.push(...previewSummarySections());
  return { show: sections.length > 0, since, until: now, sections };
}
