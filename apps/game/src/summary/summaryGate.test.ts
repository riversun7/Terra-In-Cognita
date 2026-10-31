// 복귀 요약을 물을 때 시험 — 로그인한 계정이 정해질 때 한 번, 30분 넘게 숨겼다가 다시 볼 때, 닫으면 지운다,
// 멈춘 묻기는 10초에 그만둔다(ADR 2026-10-29-app-shell 8절, D-6014·D-266)
import type { SummaryGetResponse } from "@terra/shared/inbox";
import { describe, expect, it, vi } from "vitest";
import { SUMMARY_ASK_TIMEOUT_MS, type SummaryLoadResult, createSummaryGate } from "./summaryGate.ts";

const SHOW: SummaryGetResponse = {
  show: true,
  since: 1,
  until: 2,
  sections: [{ kind: "raid", count: 1, params: {}, target: null, preview: true }],
};
const HIDE: SummaryGetResponse = { show: false, since: null, until: 2, sections: [] };

function setup(answer: SummaryGetResponse = SHOW) {
  const asked: boolean[] = [];
  const waiting: ((result: SummaryLoadResult) => void)[] = [];
  let viewer: { userId: string; preview: boolean } | null = { userId: "user_1", preview: false };
  let now = 0;
  let sessionChecks = 0;
  let manual = false;
  const acked: number[] = [];
  const gate = createSummaryGate({
    load: (preview) => {
      asked.push(preview);
      if (manual) return new Promise((resolve) => waiting.push(resolve));
      return Promise.resolve({ ok: true, data: answer });
    },
    viewer: () => viewer,
    now: () => now,
    onSessionEnded: () => {
      sessionChecks += 1;
    },
    ack: (until) => acked.push(until),
  });
  return {
    gate,
    acked,
    asked,
    waiting,
    setViewer: (next: typeof viewer) => {
      viewer = next;
    },
    at: (time: number) => {
      now = time;
    },
    manual: () => {
      manual = true;
    },
    sessionChecks: () => sessionChecks,
  };
}

const MIN = 60_000;
/** 이어진 약속을 모두 끝낼 때까지(다음 타이머 차례) */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("복귀 요약을 물을 때", () => {
  it("로그인한 계정이 정해지면 한 번 묻고, show면 그 계정의 요약을 둔다", async () => {
    const t = setup();
    t.gate.sessionChanged();
    await flush();
    expect(t.asked).toEqual([false]);
    expect(t.gate.getPending()).toEqual({ userId: "user_1", summary: SHOW });
    // 로그인 상태를 다시 확인해 같은 계정이면 다시 묻지 않는다
    t.gate.sessionChanged();
    await flush();
    expect(t.asked).toEqual([false]);
  });

  it("show: false면 띄우지 않는다(플레이어의 지금 상태: 사건 출처 없음)", async () => {
    const t = setup(HIDE);
    t.gate.sessionChanged();
    await flush();
    expect(t.asked).toHaveLength(1);
    expect(t.gate.getPending()).toBeNull();
  });

  it("[확인]·Esc로 닫으면 지우고, 다시 묻지 않는다", async () => {
    const t = setup();
    t.gate.sessionChanged();
    await flush();
    t.gate.dismiss();
    expect(t.gate.getPending()).toBeNull();
    t.gate.sessionChanged();
    await flush();
    expect(t.asked).toHaveLength(1);
  });

  it("닫으면 확인 기록(until)을 보낸다. 시안 자료는 보내지 않는다", async () => {
    const own: SummaryGetResponse = {
      show: true,
      since: null,
      until: 77,
      sections: [{ kind: "production", count: 3, params: {}, target: null }],
    };
    const t = setup(own);
    t.gate.sessionChanged();
    await flush();
    t.gate.dismiss();
    expect(t.acked).toEqual([77]);
    const preview = setup(SHOW);
    preview.gate.sessionChanged();
    await flush();
    preview.gate.dismiss();
    expect(preview.acked).toEqual([]);
  });

  it("30분 넘게 숨겼다가 다시 보이면 또 묻는다. 30분 안이면 묻지 않는다(PWA의 '켤 때'와 같다)", async () => {
    const t = setup(HIDE);
    t.gate.sessionChanged();
    await flush();
    t.at(0);
    t.gate.hidden();
    t.at(29 * MIN);
    t.gate.visible();
    await flush();
    expect(t.asked).toHaveLength(1);
    t.gate.hidden();
    t.at(29 * MIN + 30 * MIN);
    t.gate.visible();
    await flush();
    expect(t.asked).toHaveLength(2);
  });

  it("로그인하지 않았으면 묻지 않고, 로그아웃하면 띄운 요약을 지운다", async () => {
    const t = setup();
    t.setViewer(null);
    t.gate.sessionChanged();
    t.gate.hidden();
    t.at(60 * MIN);
    t.gate.visible();
    await flush();
    expect(t.asked).toEqual([]);
    t.setViewer({ userId: "user_1", preview: false });
    t.gate.sessionChanged();
    await flush();
    expect(t.gate.getPending()).not.toBeNull();
    t.setViewer(null);
    t.gate.sessionChanged();
    expect(t.gate.getPending()).toBeNull();
  });

  it("다른 계정으로 바뀌면 그 계정으로 다시 묻고, 늦게 온 앞 계정의 답은 버린다", async () => {
    const t = setup();
    t.manual();
    t.gate.sessionChanged();
    t.setViewer({ userId: "user_2", preview: false });
    t.gate.sessionChanged();
    expect(t.asked).toHaveLength(2);
    t.waiting[0]?.({ ok: true, data: SHOW });
    await flush();
    expect(t.gate.getPending()).toBeNull();
    t.waiting[1]?.({ ok: true, data: SHOW });
    await flush();
    expect(t.gate.getPending()?.userId).toBe("user_2");
  });

  it("시안 자료를 켰으면 preview로 묻는다", async () => {
    const t = setup();
    t.setViewer({ userId: "user_1", preview: true });
    t.gate.sessionChanged();
    await flush();
    expect(t.asked).toEqual([true]);
  });

  it("묻는 중에 또 물을 때가 와도 하나로(같은 계정)", async () => {
    const t = setup();
    t.manual();
    t.gate.sessionChanged();
    t.gate.hidden();
    t.at(31 * MIN);
    t.gate.visible();
    expect(t.asked).toHaveLength(1);
  });

  it("실패하면 띄우지 않고, 로그인이 끝났으면 세션을 다시 확인한다", async () => {
    const t = setup();
    t.manual();
    t.gate.sessionChanged();
    t.waiting[0]?.({ ok: false, error: "auth_notice_session_ended", sessionEnded: true });
    await flush();
    expect(t.gate.getPending()).toBeNull();
    expect(t.sessionChecks()).toBe(1);
  });

  it("묻기가 끝나지 않으면(요청 조각 받기가 멈춤) 10초에 그만두고, 다음 물을 때(30분 숨김 뒤) 다시 묻는다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const t = setup();
      t.manual();
      t.gate.sessionChanged();
      expect(t.asked).toHaveLength(1);
      // 묻는 중: 같은 계정으로 다시 물을 때가 와도 하나로
      t.gate.hidden();
      t.at(31 * MIN);
      t.gate.visible();
      expect(t.asked).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(SUMMARY_ASK_TIMEOUT_MS);
      expect(t.gate.getPending()).toBeNull();
      // 그만둔 뒤에는 다음 물을 때 다시 묻는다(예전에는 묻는 중 표시가 남아 다시 묻지 않았다)
      t.gate.hidden();
      t.at(62 * MIN);
      t.gate.visible();
      expect(t.asked).toHaveLength(2);
      t.waiting[1]?.({ ok: true, data: SHOW });
      await vi.advanceTimersByTimeAsync(0);
      expect(t.gate.getPending()?.userId).toBe("user_1");
      // 늦게 온 첫 답은 버린다(이미 그만뒀다)
      t.gate.dismiss();
      t.waiting[0]?.({ ok: true, data: SHOW });
      await vi.advanceTimersByTimeAsync(0);
      expect(t.gate.getPending()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("load가 던져도 띄우지 않고, 다음 물을 때 다시 묻는다", async () => {
    let calls = 0;
    let now = 0;
    const gate = createSummaryGate({
      load: () => {
        calls += 1;
        return Promise.reject(new Error("boom"));
      },
      viewer: () => ({ userId: "user_1", preview: false }),
      now: () => now,
      onSessionEnded: () => {},
    });
    gate.sessionChanged();
    await flush();
    expect(gate.getPending()).toBeNull();
    gate.hidden();
    now = 31 * MIN;
    gate.visible();
    await flush();
    expect(calls).toBe(2);
  });

  it("바뀔 때마다 듣는 쪽에 알린다", async () => {
    const t = setup();
    let calls = 0;
    const stop = t.gate.subscribe(() => {
      calls += 1;
    });
    t.gate.sessionChanged();
    await flush();
    t.gate.dismiss();
    stop();
    expect(calls).toBe(2);
  });
});
