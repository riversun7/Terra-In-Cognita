// 임시 홈 — 홈 대시보드(W4)가 합쳐질 때까지 "/"에 연결·성능 진단을 틀 안에 그린다(계획 W1 "잠깐 쓰는 것").
// W4가 routeViews.tsx의 홈 줄을 바꾸면 이 파일은 지운다. 진단 본문(ui/DiagnosticsPanel.tsx)은 W4의 "연결·성능" 카드가 쓴다.
import type { RouteMatch } from "@terra/shared";
import { useConnectionStatus } from "../net/connectionStatus.ts";
import { m } from "../paraglide/messages.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { DiagnosticsPanel } from "../ui/DiagnosticsPanel.tsx";

interface HomeStatusProps {
  /** 주소(검색어 ?template=). 임시 홈은 쓰지 않는다 */
  match: RouteMatch;
  monitor: FrameMonitor;
}

export default function HomeStatus({ monitor }: HomeStatusProps) {
  const { status } = useConnectionStatus();
  return (
    <section className="screen" aria-labelledby="home-title">
      <div className="screen-header">
        <h1 id="home-title" className="screen-title" tabIndex={-1}>
          {m.nav_home()}
        </h1>
      </div>
      <div className="panel">
        <h2 className="section-title">{m.card_diagnostics()}</h2>
        <DiagnosticsPanel status={status} monitor={monitor} />
      </div>
    </section>
  );
}
