// 일 막대 — 판 수·최악 시간 어림, [돌리기]·[멈춤], 진행 막대·걸린 시간, 오류, 내보내기(CSV·JSON 복사, CSV 받기).
// 진행은 서버가 센 판 수(워커가 판마다 알림). 같은 시드면 같은 결과라 내보낸 JSON의 입력으로 다시 돌릴 수 있다.
import { ANALYSIS_LIMITS, type AnalysisStartInput } from "@terra/shared/balanceAnalysis";
import { useState } from "react";
import { m } from "../../../paraglide/messages.js";
import { analysisErrorText, intText, secText } from "./analysisMessages.ts";
import { costOf, worstMinutes } from "./analysisModel.ts";
import type { AnalysisJobState } from "./useAnalysisJob.ts";

/** 글을 클립보드에(안 되면 false) */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function JobBar({
  input,
  state,
  locale,
  exports,
}: {
  input: AnalysisStartInput;
  state: AnalysisJobState;
  locale: string;
  /** 결과가 있으면 내보낼 글(CSV·JSON)과 파일 이름 */
  exports: { csv: string; json: string; name: string } | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const cost = costOf(input);
  const { job } = state;
  const running = job?.state === "running";
  const blocked = cost.problem !== null || state.starting || running;
  const pct = job && job.total > 0 ? Math.round((job.done * 1000) / job.total) / 10 : 0;
  const copy = (kind: "csv" | "json") => {
    if (!exports) return;
    void copyText(kind === "csv" ? exports.csv : exports.json).then((ok) =>
      setCopied(ok ? m.dev_an_copied() : m.dev_an_copy_failed()),
    );
  };
  return (
    <div className="an-jobbar" data-state={job?.state ?? "idle"}>
      <div className="an-jobbar-row">
        <button
          type="button"
          className="button-primary an-run"
          aria-disabled={blocked || undefined}
          onClick={() => {
            if (!blocked) state.start(input);
          }}
        >
          {m.dev_an_run()}
        </button>
        {running ? (
          <button type="button" className="an-cancel" onClick={() => state.cancel()}>
            {m.dev_an_cancel()}
          </button>
        ) : null}
        <span className="an-cost">
          {m.dev_an_cost({
            battles: intText(cost.battles, locale),
            minutes: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
              worstMinutes(cost.battleSeconds),
            ),
          })}
        </span>
      </div>
      {cost.problem === "budget" ? (
        <p className="an-problem" role="status">
          {m.dev_an_problem_budget({ max: intText(ANALYSIS_LIMITS.budgetSeconds, locale) })}
        </p>
      ) : cost.problem ? (
        <p className="an-problem" role="status">
          {m.dev_an_problem_invalid()}
        </p>
      ) : null}
      {job ? (
        <div className="an-progress-row">
          <progress
            className="an-progress"
            max={Math.max(1, job.total)}
            value={job.done}
            aria-label={m.dev_an_progress_label()}
          />
          <span className="an-progress-text" aria-live="polite">
            {job.state === "running"
              ? m.dev_an_progress({
                  done: intText(job.done, locale),
                  total: intText(job.total, locale),
                  pct: String(pct),
                  seconds: secText(job.elapsedMs, locale),
                })
              : job.state === "done"
                ? m.dev_an_state_done({
                    total: intText(job.total, locale),
                    seconds: secText(job.elapsedMs, locale),
                  })
                : job.state === "cancelled"
                  ? m.dev_an_state_cancelled({ done: intText(job.done, locale) })
                  : m.dev_an_state_failed({ reason: job.reason ?? "failed" })}
          </span>
        </div>
      ) : null}
      {state.busy && !running ? <p className="an-hint">{m.dev_an_busy()}</p> : null}
      {state.error ? (
        <p className="an-error" role="alert">
          {analysisErrorText(state.error)}
        </p>
      ) : null}
      {exports ? (
        <div className="an-export">
          <button type="button" className="button-small" onClick={() => copy("csv")}>
            {m.dev_an_copy_csv()}
          </button>
          <button type="button" className="button-small" onClick={() => copy("json")}>
            {m.dev_an_copy_json()}
          </button>
          <button
            type="button"
            className="button-small"
            onClick={() => download(`${exports.name}.csv`, exports.csv, "text/csv")}
          >
            {m.dev_an_download_csv()}
          </button>
          <span className="an-copied" aria-live="polite">
            {copied}
          </span>
        </div>
      ) : null}
    </div>
  );
}
