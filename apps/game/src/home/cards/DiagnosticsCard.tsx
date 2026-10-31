// 연결·성능 카드 — 옛 상태 화면의 내용(연결, fps·p95·메모리). dev·admin의 기본 카드에만 있고 누구나 더할 수 있다(ADR 2026-10-29-app-shell 6절).
// 몸은 화면 틀(W1)의 ui/DiagnosticsPanel.tsx를 감싸기만 한다. W1 전에는 shellParts.tsx의 임시 몸이다.
import type { CardBodyProps } from "../homeTypes.ts";
import { DiagnosticsBody } from "../shellParts.tsx";

export function DiagnosticsCardBody({ monitor }: CardBodyProps) {
  return <DiagnosticsBody monitor={monitor} />;
}
