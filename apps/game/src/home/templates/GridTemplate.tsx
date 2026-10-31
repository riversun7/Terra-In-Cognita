// DT-GRID 위젯 격자 — 카드 격자만. 처리할 일 카드(2×1)가 기본으로 맨 앞이다(ADR 2026-10-29-app-shell 6절).
// 카드 순서·크기는 유저가 고른다(편집 시트, 끌어 옮기기는 같은 동작의 보조).
import { CardGrid } from "../CardGrid.tsx";
import type { TemplateProps } from "../homeTypes.ts";

export default function GridTemplate(props: TemplateProps) {
  return <CardGrid {...props} />;
}
