// 지연 로딩 화면(관리자 화면 등)을 불러오다 실패했을 때 — 앱 전체가 내려가지 않고 이 자리만 안내로 바뀐다.
// 배포 뒤 옛 조각 파일이 없어지면 Vite가 vite:preloadError를 내고 pwa/updates.ts가 새 버전을 찾아 적용한다.
// 안내의 [다시 시도]도 같은 강제 적용(새 버전, 없으면 새로고침)이다. React.lazy는 실패를 기억해서 그냥 다시 그리면 안 된다.
import { Component, type ReactNode } from "react";

interface ChunkErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

export class ChunkErrorBoundary extends Component<ChunkErrorBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
