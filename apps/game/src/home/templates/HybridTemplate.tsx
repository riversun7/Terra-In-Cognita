// DT-HYBRID 조합(기본 템플릿, 사용자 결정 2) — 처리할 일 맨 위 고정(접기 가능) + 아래 카드 격자. 타임라인·브리핑은 카드 종류다.
// 플레이어는 늘 이 템플릿이다. 그래서 홈 조각에 함께 넣는다(다른 다섯은 따로 받는다, HomeScreen.tsx).
import { CardGrid } from "../CardGrid.tsx";
import type { TemplateProps } from "../homeTypes.ts";
import { PinnedTodo } from "../PinnedTodo.tsx";

export default function HybridTemplate(props: TemplateProps) {
  return (
    <>
      <PinnedTodo data={props.data} onQuickAction={props.onQuickAction} />
      <CardGrid {...props} />
    </>
  );
}
