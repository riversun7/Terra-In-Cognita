// 컨디션 한 줄(유닛·사이보그 정보창) — 기획 D-534, docs/adr/2026-11-12-unit-condition.md. 서버가 센 값(RosterCondition)을 보이기만 한다.
// "roster-facts" 목록(dl) 안 한 칸: 이름 · 합계(±, 상한) · 주거 몫 · 음식 몫. 합계 양수 = 좋음 색, 음수 = 경고 색, 상한에 닿으면 표지.
import type { RosterCondition } from "@terra/shared/roster";
import { m } from "../paraglide/messages.js";
import { formatNumber } from "./rosterText.ts";

/** 부호를 붙인 수(+12, −8, 0) */
export function signedNumber(value: number): string {
  if (value > 0) return `+${formatNumber(value)}`;
  if (value < 0) return `−${formatNumber(-value)}`;
  return formatNumber(0);
}

export function ConditionFact({ condition }: { condition: RosterCondition }) {
  const tone = condition.total > 0 ? "good" : condition.total < 0 ? "bad" : undefined;
  return (
    <div className="roster-condition" data-testid="unit-condition">
      <dt title={m.roster_condition_hint()}>{m.roster_condition()}</dt>
      <dd>
        <span className="roster-num roster-condition-total" data-tone={tone}>
          {signedNumber(condition.total)}
        </span>
        <span className="roster-condition-parts">
          {m.roster_condition_parts({
            housing: signedNumber(condition.housing),
            food: signedNumber(condition.food),
            cap: formatNumber(condition.cap),
          })}
        </span>
      </dd>
    </div>
  );
}
