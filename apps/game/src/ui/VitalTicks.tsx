// 생명·전투 자원 막대 위에 10 / 50 / 100 단위 눈금을 겹쳐 그리는 공용 부품.
// 부모 트랙 요소에 position: relative; overflow: hidden; 이 있어야 한다.
import type { CSSProperties } from "react";
import { type VitalTickCssVars, vitalTickVars } from "./vitalTicks.ts";
import "./vitalTicks.css";

export function VitalTicks({ max, compact = false }: { readonly max: number; readonly compact?: boolean }) {
  const vars = vitalTickVars(max, compact);
  if (vars === null) return null;
  const style: CSSProperties & VitalTickCssVars = vars;
  return (
    <span
      className="vital-ticks"
      data-compact={compact ? "true" : undefined}
      style={style}
      aria-hidden="true"
    />
  );
}
