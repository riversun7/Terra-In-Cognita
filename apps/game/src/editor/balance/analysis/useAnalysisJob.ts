// 분석 일 하나의 상태(시작·진행·결과·취소) — tRPC balanceAnalysis.*. 도는 동안 1초마다 진행을 묻는다.
// 화면을 열면 내 최근 일(같은 종류)을 이어 본다(새로 고쳐도 도는 일·결과가 이어진다, 결과는 서버 메모리에 30분).
import type { AnalysisJobView, AnalysisResult, AnalysisStartInput } from "@terra/shared/balanceAnalysis";
import { useCallback, useEffect, useRef, useState } from "react";
import { refreshSession } from "../../../auth/session.ts";
import { api } from "../../../net/api.ts";
import { type AnalysisErrorKey, analysisErrorOf } from "./analysisModel.ts";

/** 진행 묻는 간격(ms) */
const POLL_MS = 1000;

export interface AnalysisJobState {
  readonly job: AnalysisJobView | null;
  readonly result: AnalysisResult | null;
  /** 결과를 낸 입력(내보내기에 함께 넣는다). 이어 본 일은 null */
  readonly input: AnalysisStartInput | null;
  readonly error: AnalysisErrorKey | null;
  readonly starting: boolean;
  /** 서버에 남이 돌리는 분석 일이 있나(목록 조회 때) */
  readonly busy: boolean;
  start(input: AnalysisStartInput): void;
  cancel(): void;
}

export function useAnalysisJob(kind: AnalysisStartInput["kind"]): AnalysisJobState {
  const [job, setJob] = useState<AnalysisJobView | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [input, setInput] = useState<AnalysisStartInput | null>(null);
  const [error, setError] = useState<AnalysisErrorKey | null>(null);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const fail = useCallback((caught: unknown) => {
    const info = analysisErrorOf(caught);
    if (info.sessionEnded) void refreshSession();
    setError(info.key);
  }, []);

  /** 일 상태를 받는다(끝났으면 결과도) */
  const fetchStatus = useCallback(
    (id: string, mine: number) => {
      api.balanceAnalysis.status.query({ id }).then(
        (status) => {
          if (seq.current !== mine) return;
          setJob(status.job);
          if (status.result) setResult(status.result);
        },
        (caught: unknown) => {
          if (seq.current !== mine) return;
          fail(caught);
          // 서버를 다시 켜 일이 사라졌으면 멈춘 것으로 본다
          setJob((current) =>
            current && current.id === id ? { ...current, state: "failed", reason: "restart" } : current,
          );
        },
      );
    },
    [fail],
  );

  // 처음: 내 최근 일(같은 종류)을 이어 본다
  useEffect(() => {
    const mine = seq.current;
    api.balanceAnalysis.list.query().then(
      (list) => {
        if (seq.current !== mine) return;
        setBusy(list.busy);
        const latest = list.jobs.find((entry) => entry.kind === kind);
        if (!latest) return;
        setJob(latest);
        if (latest.state === "done") fetchStatus(latest.id, mine);
      },
      () => undefined,
    );
  }, [kind, fetchStatus]);

  // 도는 동안 진행을 묻는다
  // (응답마다 새 일 객체가 들어와 다음 물음을 건다)
  useEffect(() => {
    if (!job || job.state !== "running") return undefined;
    const mine = seq.current;
    const timer = setTimeout(() => fetchStatus(job.id, mine), POLL_MS);
    return () => clearTimeout(timer);
  }, [job, fetchStatus]);

  const start = useCallback(
    (next: AnalysisStartInput) => {
      seq.current += 1;
      const mine = seq.current;
      setStarting(true);
      setError(null);
      api.balanceAnalysis.start.mutate(next).then(
        (view) => {
          if (seq.current !== mine) return;
          setStarting(false);
          setJob(view);
          setResult(null);
          setInput(next);
          setBusy(false);
          if (view.state === "done") fetchStatus(view.id, mine);
        },
        (caught: unknown) => {
          if (seq.current !== mine) return;
          setStarting(false);
          fail(caught);
        },
      );
    },
    [fail, fetchStatus],
  );

  const cancel = useCallback(() => {
    if (!job || job.state !== "running") return;
    const mine = seq.current;
    api.balanceAnalysis.cancel.mutate({ id: job.id }).then((view) => {
      if (seq.current === mine) setJob(view);
    }, fail);
  }, [job, fail]);

  return { job, result, input, error, starting, busy, start, cancel };
}
