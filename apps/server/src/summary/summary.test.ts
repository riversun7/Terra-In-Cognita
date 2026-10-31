// 복귀 요약 시험(summary.get, ADR 2026-10-29-app-shell 8절, D-6014·D-266)
import { describe, expect, it } from "vitest";
import type { InboxAccount } from "../inbox/types.ts";
import { EMPTY_SUMMARY_BACKEND, type SummaryBackend, type SummarySource, collectSummary } from "./summary.ts";

const withSources = (sources: SummarySource[], lastAck: number | null = null): SummaryBackend => ({
  ...EMPTY_SUMMARY_BACKEND,
  sources,
  lastAck: () => Promise.resolve(lastAck),
});

const NOW = 1_761_700_000_000;
const ACCOUNT: InboxAccount = { userId: "user_1", roles: ["player"] };

describe("복귀 요약", () => {
  it("사건 출처가 없으면 늘 건너뛴다: show false, 확인한 적 없음, 칸 없음", async () => {
    expect(await collectSummary(EMPTY_SUMMARY_BACKEND, ACCOUNT, NOW, false)).toEqual({
      show: false,
      since: null,
      until: NOW,
      sections: [],
    });
  });

  it("시안 자료: 8시간 전부터 지금까지, 칸 4종, 보인다", async () => {
    const summary = await collectSummary(EMPTY_SUMMARY_BACKEND, ACCOUNT, NOW, true);
    expect(summary.show).toBe(true);
    expect(summary.since).toBe(NOW - 8 * 3_600_000);
    expect(summary.until).toBe(NOW);
    expect(summary.sections.map((section) => [section.kind, section.count, section.preview])).toEqual([
      ["production", 3, true],
      ["raid", 1, true],
      ["injury", 2, true],
      ["world_news", 4, true],
    ]);
  });

  it("출처가 낸 칸 중 사건이 0개인 칸은 빼고, 남은 칸이 없으면 건너뛴다(처음 기준: 사건 0개면 건너뜀)", async () => {
    const calls: [number | null, number][] = [];
    const source = (kind: string, count: number): SummarySource => ({
      kind,
      collect: async (_account, since, until) => {
        calls.push([since, until]);
        return { kind, count, params: {}, target: null };
      },
    });
    const empty = await collectSummary(withSources([source("production", 0)]), ACCOUNT, NOW, false);
    expect(empty).toEqual({ show: false, since: null, until: NOW, sections: [] });
    const some = await collectSummary(
      withSources([source("production", 0), source("raid", 2)]),
      ACCOUNT,
      NOW,
      false,
    );
    expect(some.show).toBe(true);
    expect(some.sections).toEqual([{ kind: "raid", count: 2, params: {}, target: null }]);
    // 확인한 적이 없으면 since는 null이다
    expect(calls.every(([since, until]) => since === null && until === NOW)).toBe(true);
    // 확인한 적이 있으면 그 시각부터 센다
    const after = await collectSummary(withSources([source("raid", 1)], NOW - 5_000), ACCOUNT, NOW, false);
    expect(after.since).toBe(NOW - 5_000);
    expect(calls.at(-1)).toEqual([NOW - 5_000, NOW]);
  });
});
