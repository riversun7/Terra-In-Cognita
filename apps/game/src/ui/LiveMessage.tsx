// 알림 영역 — 오류는 role="alert", 안내는 role="status". 영역은 늘 두고 문구만 바꾼다.
// 읽기 프로그램은 처음부터 있던 영역의 변화만 잘 읽는다. 그래서 문구는 영역이 그려진 다음에 넣는다(첫 그림 뒤).
// 같은 오류가 다시 나도 읽히게, version이 바뀌면 상자를 새로 만든다.
// 상자에는 상태 아이콘을 함께 그린다(색만으로 알리지 않는다).
import { useCallback, useEffect, useState } from "react";
import { StatusIcon, type StatusTone } from "./StatusIcon.tsx";

export type MessageTone = StatusTone;

export interface LiveLines {
  lines: readonly string[];
  version: number;
  /** 문구를 보여 준다(같은 문구여도 다시 알린다) */
  show: (lines: readonly string[]) => void;
  clear: () => void;
}

/** 알림 문구 상태. 언어는 바꾸면 새로고침되므로 문장 그대로 담아도 된다 */
export function useLiveLines(initial: readonly string[] = []): LiveLines {
  const [state, setState] = useState({ lines: initial, version: 0 });
  const show = useCallback((lines: readonly string[]) => {
    setState((previous) => ({ lines, version: previous.version + 1 }));
  }, []);
  const clear = useCallback(() => {
    setState((previous) => (previous.lines.length === 0 ? previous : { ...previous, lines: [] }));
  }, []);
  return { lines: state.lines, version: state.version, show, clear };
}

interface LiveMessageProps {
  tone: MessageTone;
  /** 보여 줄 문장들. 비어 있으면 상자를 그리지 않는다 */
  lines: readonly string[];
  /** 바뀌면 같은 문구라도 다시 알린다 */
  version?: number;
  className?: string;
}

export function LiveMessage({ tone, lines, version = 0, className }: LiveMessageProps) {
  // 빈 영역이 한 번 그려진 다음 프레임부터 문구를 넣는다(처음부터 문구가 있던 영역은 읽히지 않을 수 있다)
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const show = ready && lines.length > 0;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={className}>
      {show ? (
        <div key={version} className={`message message-${tone}`}>
          <StatusIcon tone={tone} />
          <div className="message-body">
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
