// 홈 부품이 함께 받는 값 — 템플릿은 그리기만 하고 자료는 같은 훅(useHomeData)에서 온다(D-6005 "자료는 템플릿과 따로").
import type { CardSize } from "@terra/shared/dashboard";
import type { InboxItem } from "@terra/shared/inbox";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import type { HomeData } from "./homeData.ts";
import type { ShownCard } from "./homeView.ts";

/** 홈의 모든 부품(템플릿·카드)이 받는 값 */
export interface HomeViewProps {
  readonly data: HomeData;
  readonly monitor: FrameMonitor;
  /** 바로 처리 단추를 눌렀다. 시안 자료면 명령을 보내지 않는다(부른 쪽이 알린다) */
  readonly onQuickAction: (item: InboxItem, action: string) => void;
}

/** 템플릿이 받는 값: 격자(처리함 템플릿은 요약 카드 줄)에 그릴 카드 */
export interface TemplateProps extends HomeViewProps {
  readonly cards: readonly ShownCard[];
}

/** 카드 몸이 받는 값 */
export interface CardBodyProps extends HomeViewProps {
  readonly size: CardSize;
}
