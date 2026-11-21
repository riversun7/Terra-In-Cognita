// 경제 한눈에(/economy)의 [신용] 카드 — 내 도시 신용·나라 신용(D-581, docs/adr/2026-11-21-credit.md). 깎인 곳만 줄로 보이고, 없으면 시작값 한 줄.
// 실제 자료만(시안 없음). 갚으면 바로 돌아온다는 안내를 붙인다. 누르는 곳이 없는 카드다.
import type { CreditLine } from "@terra/shared/credit";
import { m } from "../paraglide/messages.js";
import { Icon } from "../ui/icons.tsx";
import { NO_ARGS, useCredit } from "./queries.ts";

/** 깎은 까닭 한 줄(주민세 빚 n회 · 사업장 적자, 도시·나라 몫) */
function causeText(line: CreditLine): string {
  return line.marks
    .map((mark) =>
      mark.cause === "resident"
        ? m.economy_credit_cause_resident({
            count: mark.count,
            city: mark.cityPoints,
            nation: mark.nationPoints,
          })
        : m.economy_credit_cause_business({ city: mark.cityPoints, nation: mark.nationPoints }),
    )
    .join(" · ");
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
                  key={`${line.unitId ?? ""}|${line.cityId}|${line.nationId}`}
                  className="eco-credit-line"
                  data-subject={line.subject}
                >
                  <span className="eco-card-metric eco-num">
                    {m.economy_credit_scores({
                      who:
                        line.unitId === null
                          ? m.economy_credit_me()
                          : m.economy_credit_unit({ id: line.unitId }),
                      city: line.cityName ?? `#${line.cityId}`,
                      cityScore: line.cityScore,
                      nationScore: line.nationScore,
                    })}
                  </span>
                  <span className="eco-card-sub" data-tone="warning">
                    {causeText(line)}
                  </span>
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
