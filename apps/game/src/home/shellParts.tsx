// 화면 틀(W1)이 줄 부품의 홈 쪽 자리 — 홈은 틀의 부품을 이 파일로만 쓴다.
// - HomeLink: 앱 안 링크(shell/AppLink.tsx). 보조 키·가운데 버튼·target은 브라우저에 맡긴다.
// - DiagnosticsBody: 연결·성능 카드의 몸(ui/DiagnosticsPanel.tsx, 연결 상태는 net/connectionStatus.ts).
// - useSheetOverlay: 편집 시트의 열림 = 라우터의 겹침 칸(W1 서랍과 같은 방식). 열 때 같은 주소로 기록 한 칸을 쌓고, 뒤로 → 닫힘(ADR 37 2절 표).
//   열기는 누르기 처리기에서만 한다. 효과에서 열면 개발 모드(StrictMode)의 효과 두 번 돌리기가 열기 → 닫기 → 다시 열기가 되는데,
//   닫기(history.go(-1))가 늦게 끝나는 동안 라우터가 다시 열기를 무시해서 시트가 열리자마자 닫힌다.
import { useCallback, useState } from "react";
import { useConnectionStatus } from "../net/connectionStatus.ts";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { closeOverlay, openOverlay, useRoute } from "../shell/routerStore.ts";
import { DiagnosticsPanel } from "../ui/DiagnosticsPanel.tsx";

export { AppLink as HomeLink } from "../shell/AppLink.tsx";

/** 연결·성능 카드의 몸 */
export function DiagnosticsBody({ monitor }: { monitor: FrameMonitor }) {
  const { status } = useConnectionStatus();
  return <DiagnosticsPanel status={status} monitor={monitor} />;
}

/** 편집 시트의 열림과 열기·닫기(HomeScreen이 쓴다) */
export interface SheetOverlay {
  readonly open: boolean;
  /** [편집]을 눌렀을 때(누르기 처리기에서만 부른다) */
  readonly show: () => void;
  /** 시트가 스스로 닫혔을 때(Esc·[닫기]·바탕 누르기 — <dialog>의 close 알림) */
  readonly hide: () => void;
}

/**
 * 편집 시트의 열림. 겹침 칸이 "sheet"인 동안만 열려 있다: 뒤로로 그 칸이 빠지면 닫힌다(시트가 화면에서 내려간다).
 * 시트가 스스로 닫히면 그 칸을 뺀다. 라우터가 다른 이동을 기다리는 중이라 칸을 못 쌓거나 못 빼도 화면 상태가 먼저 맞는다.
 */
export function useSheetOverlay(): SheetOverlay {
  const [shown, setShown] = useState(false);
  const overlay = useRoute().overlay;
  const show = useCallback(() => {
    setShown(true);
    openOverlay("sheet");
  }, []);
  const hide = useCallback(() => {
    setShown(false);
    closeOverlay();
  }, []);
  return { open: shown && overlay === "sheet", show, hide };
}
