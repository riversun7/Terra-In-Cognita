// 복귀 요약(D-6014·D-266) — 화면 틀(shell/Shell.tsx)이 한 줄로 그린다. 어느 주소 위에도 뜨는 겹침이다(지도 위에도).
// ADR 2026-10-29-app-shell 2·8절
// - 첫 화면 묶음에 들어가므로 작게 둔다: 물을 때·보일지는 summaryGate.ts, 요청은 summaryClient.ts(지연),
//   대화상자는 SummaryDialog.tsx(지연. 보일 요약이 있을 때만 받는다. 지금 플레이어는 늘 show: false라 받지 않는다).
// - 기록 칸을 쌓지 않는다. [확인]·Esc(닫기 요청)로 닫으면 보던 화면에 남는다: /로 켰으면 홈, 바로 연 주소면 그 화면(D-266).
// - 대화상자 조각을 받지 못하면 조용히 넘긴다(다음에 켤 때 다시 묻는다).
import { Suspense, lazy } from "react";
import { ChunkErrorBoundary } from "../ui/ChunkErrorBoundary.tsx";
import { dismissReturnSummary, useReturnSummary } from "./summaryGate.ts";

const SummaryDialog = lazy(() => import("./SummaryDialog.tsx"));

export interface ReturnSummaryProps {
  /** 앱 안 이동(라우터의 쌓기). 숫자를 누르면 그 화면으로 가며 요약을 닫는다. 없으면 보통 링크다 */
  readonly navigate?: ((path: string) => void) | undefined;
}

export function ReturnSummary({ navigate }: ReturnSummaryProps) {
  const pending = useReturnSummary();
  if (pending === null) return null;
  return (
    <ChunkErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <SummaryDialog summary={pending.summary} navigate={navigate} onClose={dismissReturnSummary} />
      </Suspense>
    </ChunkErrorBoundary>
  );
}
