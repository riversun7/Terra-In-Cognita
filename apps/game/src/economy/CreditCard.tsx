// 경제 한눈에(/economy)의 [신용] 카드 — 내가 속한 나라에 대한 신용 한 점수(D-581·D-584, docs/adr/2026-11-21-credit.md). 지금 나라 줄 + 내린 몫이 남은 줄, 없으면 시작값 한 줄.
// 실제 자료만(시안 없음). 갚으면 바로 돌아온다는 안내를 붙인다. 누르는 곳이 없는 카드다.
import type { CreditLine, CreditMarkView } from "@terra/shared/credit";
import { m } from "../paraglide/messages.js";
import { Icon } from "../ui/icons.tsx";
import { NO_ARGS, useCredit } from "./queries.ts";

/** 내린 몫 하나의 문구 */
function markText(mark: CreditMarkView): string {
  const args = { count: mark.count, points: mark.points };
  switch (mark.cause) {
    case "resident":
      return m.economy_credit_cause_resident(args);
    case "business":
      return m.economy_credit_cause_business(args);
    case "upkeep":
      return m.economy_credit_cause_upkeep(args);
    case "coup_join":
      return m.economy_credit_cause_coup_join(args);
    default:
      return m.economy_credit_cause_same_nation_attack(args);
  }
}

/** 내린 까닭 한 줄(주민세 빚 n회 · 사업장 적자 · 유지비 체납 …) */
function causeText(line: CreditLine): string {
  return line.marks.map(markText).join(" · ");
}

export function CreditCard() {
  const credit = useCredit(NO_ARGS);
  const data = credit.data;
  return (
    <li className="eco-card">
      <div className="eco-card-link" data-card="credit">
        <span className="eco-card-head">
          <span className="eco-card-mark" aria-hidden="true">
            <Icon name="money_survival" />
          </span>
          <span className="eco-card-title">{m.economy_credit_title()}</span>
        </span>
        <span className="eco-card-body">
          {credit.status === "failed" ? (
            <span className="eco-card-sub">{m.economy_not_ready_title()}</span>
          ) : data === null ? (
            <span className="eco-card-sub">{m.shell_loading()}</span>
          ) : data.status !== "ready" ? (
            <span className="eco-card-sub">{m.economy_not_ready_title()}</span>
          ) : data.lines.length === 0 ? (
            <span className="eco-card-metric eco-num">
              {m.economy_credit_clean({ score: data.range.start })}
            </span>
          ) : (
            <>
              {data.lines.map((line) => (
                <span
                  key={`${line.unitId ?? ""}|${line.nationId}`}
                  className="eco-credit-line"
                  data-subject={line.subject}
                >
                  <span className="eco-card-metric eco-num">
                    {m.economy_credit_scores({
                      who:
                        line.unitId === null
                          ? m.economy_credit_me()
                          : m.economy_credit_unit({ id: line.unitId }),
                      nation: line.current
                        ? m.economy_credit_nation_current()
                        : m.economy_credit_nation_other({ id: line.nationId }),
                      score: line.score,
                    })}
                  </span>
                  {line.current ? (
                    <span className="eco-card-sub">
                      {m.economy_credit_rise({ tenure: line.tenure, rise: line.rise })}
                    </span>
                  ) : null}
                  {line.marks.length > 0 ? (
                    <span className="eco-card-sub" data-tone="warning">
                      {causeText(line)}
                    </span>
                  ) : null}
                </span>
              ))}
              <span className="eco-card-sub">{m.economy_credit_restore()}</span>
            </>
          )}
        </span>
      </div>
    </li>
  );
}
