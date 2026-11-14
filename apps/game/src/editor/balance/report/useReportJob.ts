// 전투 보고서 일(서버 워커) 시작·진행·멈춤 — tRPC battleReport.start·status·cancel. 진행은 0.6초마다 묻는다(서버 따로 센 제한 안).
// 끝나면 기록(저장 실패여도 결과)을 돌려준다. 화면을 떠나도 서버 일은 끝까지 돌고 기록으로 남는다([보고서 기록]에서 연다).
import type { BattleReportRecord, ReportJobView, ReportStartInput } from "@terra/shared/battleReport";
import { useCallback, useEffect, useRef, useState } from "react";
import { refreshSession } from "../../../auth/session.ts";
import { api } from "../../../net/api.ts";
import { type ReportErrorKey, reportErrorOf } from "./reportModel.ts";

const POLL_MS = 600;

export interface ReportJobState {
  readonly job: ReportJobView | null;
  readonly record: BattleReportRecord | null;
  readonly error: ReportErrorKey | null;
  readonly busy: boolean;
  readonly start: (input: ReportStartInput) => void;
  readonly cancel: () => void;
  /** 열어 둔 결과를 바꾼다(기록에서 다시 돌리기 전에 지우기 등) */
  readonly show: (record: BattleReportRecord | null) => void;
}

export function useReportJob(onDone?: (record: BattleReportRecord) => void): ReportJobState {
  const [job, setJob] = useState<ReportJobView | null>(null);
  const [record, setRecord] = useState<BattleReportRecord | null>(null);
  const [error, setError] = useState<ReportErrorKey | null>(null);
  const [starting, setStarting] = useState(false);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  const fail = useCallback((cause: unknown) => {
    const info = reportErrorOf(cause);
    if (info.sessionEnded) void refreshSession();
    setError(info.key);
  }, []);

  const running = job?.state === "running";
  const jobId = job?.id;
  useEffect(() => {
    if (!running || !jobId) return undefined;
    let alive = true;
    const timer = setInterval(() => {
      api.battleReport.status.query({ id: jobId }).then(
        (status) => {
          if (!alive) return;
          setJob(status.job);
          if (status.job.state !== "running") {
            if (status.report) {
              setRecord(status.report);
              doneRef.current?.(status.report);
            }
            if (status.job.reason) setError(status.job.reason === "timeout" ? "timeout" : "failed");
          }
        },
        (cause: unknown) => {
          if (alive) fail(cause);
        },
      );
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [running, jobId, fail]);

  const start = useCallback(
    (input: ReportStartInput) => {
      setStarting(true);
      setError(null);
      api.battleReport.start
        .mutate(input)
        .then((view) => setJob(view), fail)
        .finally(() => setStarting(false));
    },
    [fail],
  );

  const cancel = useCallback(() => {
    if (!jobId) return;
    api.battleReport.cancel.mutate({ id: jobId }).then((view) => setJob(view), fail);
  }, [jobId, fail]);

  return { job, record, error, busy: starting || running, start, cancel, show: setRecord };
}
