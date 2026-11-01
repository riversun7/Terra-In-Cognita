// 다시보기 사건 기록 판 — 그 시각까지 보인 사건 줄(새 것이 위, 최근 LOG_LINES줄). 좁은 화면은 접고, 넓은 화면은 옆 판이다.
import type { BattleReplay } from "@terra/protocol/battleReplay";
import { useState } from "react";
import { m } from "../paraglide/messages.js";
import { type Locale, logLine } from "./battleText.ts";
import { clockText } from "./replayClock.ts";
import type { ReplayTimeline } from "./replayTimeline.ts";

const LOG_LINES = 40;

export function BattleLog({
  replay,
  timeline,
  timeMs,
  locale,
  endText,
}: {
  readonly replay: BattleReplay;
  readonly timeline: ReplayTimeline;
  readonly timeMs: number;
  readonly locale: Locale;
  readonly endText: string | null;
}) {
  const [open, setOpen] = useState(false);
  const count = timeline.logCountAt(timeMs);
  // 새 것이 위: toReversed는 지원 하한 브라우저(Firefox 114)에 없어 거꾸로 읽어 새 배열을 만든다
  const shown = timeline.logAt(timeMs, LOG_LINES);
  const lines = Array.from({ length: shown.length }, (_, i) => shown[shown.length - 1 - i] ?? 0);
  return (
    <section className="br-log" data-open={open ? "true" : "false"} aria-labelledby="br-log-title">
      <button
        type="button"
        className="button-small br-log-toggle"
        aria-expanded={open}
        aria-controls="br-log-list"
        onClick={() => setOpen(!open)}
      >
        <span id="br-log-title">{m.battle_log()}</span>
        <span className="br-log-count">{count}</span>
      </button>
      {endText ? <p className="br-log-end">{endText}</p> : null}
      <ol id="br-log-list" className="br-log-list">
        {lines.length === 0 ? <li className="br-log-empty">{m.battle_log_empty()}</li> : null}
        {lines.map((index) => {
          const event = replay.events[index];
          const text = logLine(replay, index, locale);
          if (!event || text === null) return null;
          return (
            <li key={index} className="br-log-line" data-kind={event.k}>
              <time className="br-log-time">{clockText((event.t + 1) * replay.tickMs)}</time>
              <span>{text}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
