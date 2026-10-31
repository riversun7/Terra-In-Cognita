// 복귀 요약(D-6014·D-266) — summary.get. 없는 동안 일어난 일(생산·습격과 방어·부상·세계 소식)을 칸마다 센다.
// ADR 2026-10-29-app-shell 8절
// - 보일지(show)는 서버가 정한다. 처음 기준: 마지막 확인 뒤 사건이 0개면 건너뛴다(기준 수치는 Step 5).
// - 사건 출처: S3 오프라인 정산의 생산(src/world/summarySources.ts, DB·월드가 있을 때). 마지막 확인 시각은 summary_acks
//   (summary.ack, src/summary/acks.ts). 확인한 적이 없으면 since는 null(처음부터)이다.
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

/** 복귀 요약 자료(사건 출처 + 마지막 확인 시각). DB·월드가 없으면 출처 0개, 확인 시각 없음 */
export interface SummaryBackend {
  readonly sources: readonly SummarySource[];
  /** 마지막으로 확인한 시각(없으면 null) */
  lastAck(userId: string): Promise<number | null>;
  /** 확인: until(그 요약이 덮은 끝)까지 본 것으로 적는다. 지금보다 뒤는 지금으로, 앞서 적은 것보다 앞이면 그대로 */
  ack(userId: string, untilMs: number, nowMs: number): Promise<void>;
}

export const EMPTY_SUMMARY_BACKEND: SummaryBackend = {
  sources: [],
  lastAck: () => Promise.resolve(null),
  ack: () => Promise.resolve(),
};

/** summary.get 응답. 사건이 0개인 칸은 빼고, 남은 칸이 있으면 보인다 */
export async function collectSummary(
  backend: SummaryBackend,
  account: InboxAccount,
  now: number,
  preview: boolean,
): Promise<SummaryGetResponse> {
  // 시안 자료는 8시간 전에 확인한 것으로 보인다
  const since = preview ? now - PREVIEW_SUMMARY_SPAN_MS : await backend.lastAck(account.userId);
  const found = await Promise.all(backend.sources.map((source) => source.collect(account, since, now)));
  const sections = found.filter((section) => section.count > 0);
  if (preview) sections.push(...previewSummarySections());
  return { show: sections.length > 0, since, until: now, sections };
}
