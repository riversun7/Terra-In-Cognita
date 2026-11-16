// 정부 판의 [가문 이동 정책] 칸 — 기획 D-570 "해당 국가나 도시의 정책에 따름. 지원금이 있을지 가입비가 있을지"·D-526(받는 쪽이 정함), 질문 2018 답
// (정하는 곳은 정부 판에 최소한으로 — 나라 = 지도자, 도시 = 도시 주인). docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-16, 2011·2012·2014·2017·2018 답)".
// - 모두에게: 이 도시 값(정하지 않으면 "나라 값을 따름")과 나라 값(지도자가 정함 / NPC 성향 / 없음). 가문이 옮겨 올 때 가문이 한꺼번에 낸다(D-573).
// - 정할 수 있는 사람(서버가 canSetCity·canSetNation으로 알려 준다): 이 도시를 가진 가문의 가문장, 이 나라인 가문(독립)의 가문장. 값 = 가문원마다
//   (+ 가입비 / − 지원금, 정수 15자리) → WebSocket house_entry_policy(프로토콜 51). [비우기] = 정하지 않음. 판정은 서버가 다시 한다.
import type { GovernmentHouseEntry } from "@terra/shared/government";
import type { HouseEntryScope } from "@terra/protocol";
import { useId, useState } from "react";
import { sendHouseMember } from "../faction/identity/houseCommands.ts";
import { HOUSE_MEMBER_ERROR_TEXT } from "../faction/identity/houseText.ts";
import { m } from "../paraglide/messages.js";
import { formatAmount } from "../roster/rosterText.ts";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { entryFeeText, parseEntryFee } from "./governmentData.ts";

/** 한 자리(도시·나라)의 값 줄과 정하기 칸 */
function PolicyRow(props: {
  readonly scope: HouseEntryScope;
  readonly label: string;
  readonly value: string;
  readonly note: string | null;
  readonly editable: boolean;
  readonly busy: boolean;
  readonly onSave: (scope: HouseEntryScope, fee: string | null) => void;
  readonly onInvalid: () => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  return (
    <div className="gov-fact gov-entry-row" data-part={`government-entry-${props.scope}`}>
      <dt>{props.label}</dt>
      <dd>
        <span data-part="government-entry-value">{props.value}</span>
        {props.note ? <span className="gov-person-note">{props.note}</span> : null}
        {props.editable ? (
          <span className="gov-entry-edit">
            <label className="visually-hidden" htmlFor={inputId}>
              {m.government_entry_input()}
            </label>
            <input
              id={inputId}
              className="gov-entry-input"
              inputMode="numeric"
              autoComplete="off"
              placeholder={m.government_entry_input()}
              value={draft}
              disabled={props.busy}
              onChange={(event) => setDraft(event.target.value)}
              data-part="government-entry-input"
            />
            <button
              type="button"
              className="button-small"
              disabled={props.busy || draft.trim() === ""}
              onClick={() => {
                const fee = parseEntryFee(draft);
                if (fee === null) props.onInvalid();
                else props.onSave(props.scope, fee);
              }}
            >
              {m.government_entry_save()}
            </button>
            <button
              type="button"
              className="button-small"
              disabled={props.busy}
              onClick={() => props.onSave(props.scope, null)}
            >
              {m.government_entry_clear()}
            </button>
          </span>
        ) : null}
      </dd>
    </div>
  );
}

export function HouseEntryPolicy({ cityId, policy }: { cityId: number; policy: GovernmentHouseEntry }) {
  const titleId = useId();
  // 정한 뒤에는 보낸 값을 바로 보인다(대화상자를 다시 열면 서버 값)
  const [shown, setShown] = useState(policy);
  const [busy, setBusy] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();

  const save = async (scope: HouseEntryScope, fee: string | null): Promise<void> => {
    if (busy) return;
    setBusy(true);
    notice.clear();
    problem.clear();
    try {
      const outcome = await sendHouseMember(
        scope === "city"
          ? { t: "house_entry_policy", scope, cityId, fee }
          : { t: "house_entry_policy", scope, fee },
      );
      if (outcome.ok) {
        notice.show([m.fid_house_done_entry_policy()]);
        setShown((before) =>
          scope === "city"
            ? { ...before, city: fee }
            : { ...before, nation: fee ?? "0", nationSource: fee === null ? "none" : "leader" },
        );
      } else problem.show([HOUSE_MEMBER_ERROR_TEXT[outcome.code]()]);
    } finally {
      setBusy(false);
    }
  };
  const invalid = (): void => problem.show([m.government_entry_invalid()]);

  return (
    <section className="gov-section gov-band" aria-labelledby={titleId} data-part="government-house-entry">
      <h3 id={titleId} className="gov-section-title">
        {m.government_entry_title()}
      </h3>
      <p className="gov-muted">{m.government_entry_hint()}</p>
      <dl className="gov-facts">
        <PolicyRow
          scope="city"
          label={m.government_entry_city()}
          value={entryFeeText(shown.city, formatAmount)}
          note={null}
          editable={shown.canSetCity}
          busy={busy}
          onSave={(scope, fee) => void save(scope, fee)}
          onInvalid={invalid}
        />
        <PolicyRow
          scope="nation"
          label={m.government_entry_nation()}
          value={entryFeeText(shown.nation, formatAmount)}
          note={shown.nationSource === "npc" ? m.government_entry_npc() : null}
          editable={shown.canSetNation}
          busy={busy}
          onSave={(scope, fee) => void save(scope, fee)}
          onInvalid={invalid}
        />
      </dl>
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
    </section>
  );
}
