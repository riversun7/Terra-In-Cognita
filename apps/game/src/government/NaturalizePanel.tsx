// 정부 창구 국적 상담의 [국적 바꾸기(귀화)] 칸 — 질문 745 나(다른 나라 정부에서 귀화 신청, 값·쉬는 날은 설정 칸)·D-526(받는 나라가 지원금
// 또는 입회비를 정함, 옛 나라에 반환 없음, 옛 나라 우호도 하락 — 적대 세력으로 가면 크게), docs/adr/2026-11-08-citizenship.md. 내 나라가 아닌
// 도시의 정부에서만 그린다(창구 GovernmentDesk의 국적 상담 자리 CitizenshipSlot.tsx가 넣는다).
// - 조건: tRPC world.naturalization(받는 나라·지금 내 나라·입회비 또는 지원금·내 잔고·옛 나라와 이 나라 우호도·쉬는 기간·막는 까닭). 판정은
//   서버가 다시 한다.
// - 신청: [귀화 신청] → 확인 줄(받는 나라·낼 값 또는 받을 값·우호도 하락) → [확정]이면 WebSocket nationality_change(본 나라·값을 함께 보낸다).
//   결과 뒤 조건을 다시 받는다.
// - 무엇이 그대로인지 먼저 알린다: 유닛·건물·직무는 그대로 내 것, 내 도시가 이 도시로, 정착 지원금은 다시 받지 않음.
import type { GovernmentResponse } from "@terra/shared/government";
import type { NaturalizationResponse } from "@terra/shared/citizenship";
import { useEffect, useId, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { sendNaturalize } from "./naturalizeCommands.ts";
import { formatAmount } from "../roster/rosterText.ts";
import {
  NATURALIZE_RESULT_TEXT,
  blockText,
  confirmText,
  costLines,
  loadNaturalization,
} from "./naturalizeData.ts";
import "./naturalize.css";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: NaturalizationResponse }
  | { readonly status: "failed" };

/** 사실 한 줄(정부 판과 같은 모양) */
function Fact({ label, value, part }: { label: string; value: string; part: string }) {
  return (
    <div className="gov-fact" data-part={part}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function NaturalizePanel({ government }: { government: GovernmentResponse }) {
  const buildingId = government.buildingId;
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();
  const titleId = useId();
  const mine = government.nation?.mine === true;

  /** 조건을 (다시) 받는다 — 신청 뒤·[다시 시도] */
  const fetchTerms = (): Promise<void> =>
    loadNaturalization(buildingId).then(
      (data) => setLoad({ status: "ready", data }),
      () => setLoad({ status: "failed" }),
    );

  // 처음 한 번 받는다(대화상자는 건물마다 새로 열린다). 받은 뒤 setLoad는 비동기 콜백 안이다
  const first = useRef(true);
  useEffect(() => {
    if (!first.current || mine) return;
    first.current = false;
    void loadNaturalization(buildingId).then(
      (data) => setLoad({ status: "ready", data }),
      () => setLoad({ status: "failed" }),
    );
  }, [buildingId, mine]);

  // 내 나라 도시의 정부에는 귀화 칸이 없다
  if (mine) return null;
  const data = load.status === "ready" ? load.data : null;
  const terms = data?.status === "ready" ? data.terms : null;
  if (data && data.status !== "ready") return null;

  const submit = async (): Promise<void> => {
    if (!terms || busy) return;
    setBusy(true);
    notice.clear();
    problem.clear();
    try {
      const outcome = await sendNaturalize({
        t: "nationality_change",
        buildingId,
        factionId: terms.target.id,
        cost: terms.cost,
      });
      if (outcome.ok)
        notice.show([
          m.naturalize_done({ nation: costLines(terms).target }),
          ...(outcome.granted !== "0"
            ? [m.naturalize_done_grant({ amount: formatAmount(outcome.granted) })]
            : []),
        ]);
      else problem.show([NATURALIZE_RESULT_TEXT[outcome.code]()]);
    } finally {
      await fetchTerms();
      setConfirming(false);
      setBusy(false);
    }
  };

  const text = terms ? costLines(terms) : null;
  const reason = terms && data ? blockText(terms, data.generatedAt) : null;
  // 이미 그 나라(방금 귀화했거나 다른 화면에서 바뀜)면 신청 칸 대신 알림만
  const member = terms?.blocked === "same_nation";
  return (
    <section
      className="gov-naturalize"
      data-part="government-naturalize"
      data-state={terms?.blocked ?? (terms ? "open" : load.status)}
      aria-labelledby={titleId}
    >
      <h4 id={titleId} className="gov-naturalize-title">
        {m.naturalize_title()}
      </h4>
      <p className="gov-muted">{m.naturalize_lead()}</p>
      {load.status === "loading" ? <p className="gov-muted">{m.naturalize_loading()}</p> : null}
      {load.status === "failed" ? (
        <div className="gov-actions">
          <p role="alert" className="field-error">
            {m.naturalize_load_failed()}
          </p>
          <button type="button" className="button-small" onClick={() => void fetchTerms()}>
            {m.naturalize_retry()}
          </button>
        </div>
      ) : null}
      {terms && text && !member ? (
        <>
          <dl className="gov-facts">
            <Fact part="naturalize-target" label={m.naturalize_field_target()} value={text.target} />
            <Fact part="naturalize-current" label={m.naturalize_field_current()} value={text.current} />
            <Fact part="naturalize-terms" label={m.naturalize_field_fee()} value={text.terms} />
            <Fact part="naturalize-net" label={m.naturalize_field_total()} value={text.net} />
            <Fact part="naturalize-standing" label={m.naturalize_field_standing()} value={text.standing} />
            <Fact
              part="naturalize-target-standing"
              label={m.naturalize_field_target_standing()}
              value={text.targetStanding}
            />
            <Fact part="naturalize-rest" label={m.naturalize_field_rest()} value={text.rest} />
          </dl>
          {terms.standing.hostile ? (
            <p className="gov-naturalize-reason" data-part="naturalize-hostile">
              {m.naturalize_standing_hostile({ nation: text.current })}
            </p>
          ) : null}
          <p className="gov-muted">{m.naturalize_keeps()}</p>
          {reason ? (
            <p className="gov-naturalize-reason" data-part="naturalize-reason">
              {reason}
            </p>
          ) : null}
          {confirming ? (
            <div className="gov-naturalize-confirm" data-part="naturalize-confirm">
              <p className="gov-naturalize-ask">{confirmText(text)}</p>
              {terms.standing.drop > 0 ? (
                <p className="gov-muted">
                  {m.naturalize_confirm_standing({ old: text.current, drop: String(terms.standing.drop) })}
                </p>
              ) : null}
              <div className="gov-actions">
                <button
                  type="button"
                  className="button-small"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  {m.naturalize_cancel()}
                </button>
                <button type="button" className="button-small" disabled={busy} onClick={() => void submit()}>
                  {busy ? m.naturalize_sending() : m.naturalize_confirm_button()}
                </button>
              </div>
            </div>
          ) : (
            <div className="gov-actions">
              <button
                type="button"
                className="button-small gov-naturalize-apply"
                disabled={busy || terms.blocked !== null}
                onClick={() => {
                  notice.clear();
                  problem.clear();
                  setConfirming(true);
                }}
              >
                {m.naturalize_apply()}
              </button>
            </div>
          )}
        </>
      ) : null}
      {member && text ? <p className="gov-muted">{m.naturalize_member({ nation: text.target })}</p> : null}
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
    </section>
  );
}
