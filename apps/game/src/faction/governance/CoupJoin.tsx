// 쿠데타 카드의 편 들기 + 보낼 병력 고르기(줄기 no-teleport — 사용자 결정 D-591 "어떠한 경우에도 순간이동은 없다 파견으로 실제로 이동해서 참전한다").
// 고른 유닛은 서버가 이동 서비스로 싸우는 도시까지 실제로 걸어 보낸다(WebSocket gov_coup_join unitIds). 전투(참가 받기 끝) 때 그 도시에 닿은 유닛만 싸운다.
// 자료는 tRPC governance.view의 쿠데타 troops(내 유닛마다 그 도시에 있나·가는 중 도착 예정·보내면 도착 예정). 아무것도 고르지 않으면 서버가 이미 그 도시에 있는
// 내 유닛만 넣는다(보내지 않는다). 처음 고름 = 그 도시에 있거나 이미 보낸 유닛.
import type { GovernanceCoupTroop, GovernanceCoupView } from "@terra/shared/governance";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { ActionRow } from "../../sections/screenParts.tsx";
import { dateText, relativeText } from "../../sections/screenText.ts";
import type { GovernanceRequest } from "./governanceCommands.ts";

const TYPE_TEXT = {
  body: m.gov_coup_troop_body,
  human: m.gov_coup_troop_human,
  cyborg: m.gov_coup_troop_cyborg,
} as const;

/** 처음 고른 유닛(그 도시에 있거나 이미 보낸 것) */
const initialPick = (troops: readonly GovernanceCoupTroop[]): ReadonlySet<number> =>
  new Set(troops.filter((troop) => troop.state === "here" || troop.sent).map((troop) => troop.id));

function TroopState({ troop, battleAt, now }: { troop: GovernanceCoupTroop; battleAt: number; now: number }) {
  if (troop.state === "here") return <span className="faction-muted">{m.gov_coup_troop_here()}</span>;
  if (troop.arriveAt === null) return <span className="faction-muted">{m.gov_coup_troop_no_route()}</span>;
  const late = troop.arriveAt > battleAt;
  return (
    <span className={late ? "gov-troop-late" : "faction-muted"}>
      {troop.state === "going" ? m.gov_coup_troop_going() : m.gov_coup_troop_away()}{" "}
      <time dateTime={new Date(troop.arriveAt).toISOString()} title={dateText(troop.arriveAt)}>
        {relativeText(troop.arriveAt, now)}
      </time>
      {late ? ` · ${m.gov_coup_troop_late()}` : null}
    </span>
  );
}

export function CoupJoin({
  coup,
  now,
  busy,
  run,
}: {
  coup: GovernanceCoupView;
  now: number;
  busy: boolean;
  run: (body: GovernanceRequest) => Promise<void>;
}) {
  const troops = coup.troops ?? [];
  const [picked, setPicked] = useState<ReadonlySet<number>>(() => initialPick(troops));
  const toggle = (id: number, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };
  const join = (side: "rebel" | "government") => {
    const unitIds = troops.filter((troop) => picked.has(troop.id)).map((troop) => troop.id);
    void run(
      unitIds.length > 0
        ? { t: "gov_coup_join", coupId: coup.id, side, unitIds }
        : { t: "gov_coup_join", coupId: coup.id, side },
    );
  };
  return (
    <>
      {coup.troops ? (
        <fieldset className="gov-troops" data-testid="governance-coup-troops">
          <legend className="gov-sub">{m.gov_coup_troops()}</legend>
          <p className="faction-muted">{m.gov_coup_troops_hint()}</p>
          {troops.length === 0 ? (
            <p className="faction-muted">{m.gov_coup_troops_none()}</p>
          ) : (
            <ul className="gov-troop-list">
              {troops.map((troop) => (
                <li key={troop.id}>
                  <label className="gov-troop">
                    <input
                      type="checkbox"
                      checked={picked.has(troop.id)}
                      onChange={(event) => toggle(troop.id, event.target.checked)}
                    />
                    <span className="gov-troop-name">
                      {m.gov_coup_troop_label({ type: TYPE_TEXT[troop.type](), id: String(troop.id) })}
                      {troop.sent ? ` · ${m.gov_coup_troop_sent()}` : null}
                    </span>
                    <TroopState troop={troop} battleAt={coup.gatherUntilMs} now={now} />
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      ) : null}
      <ActionRow>
        <button
          type="button"
          className="button-small"
          aria-disabled={busy}
          aria-pressed={coup.mySide === "rebel"}
          onClick={() => join("rebel")}
        >
          {m.gov_coup_join_rebel()}
        </button>
        <button
          type="button"
          className="button-small"
          aria-disabled={busy}
          aria-pressed={coup.mySide === "government"}
          onClick={() => join("government")}
        >
          {m.gov_coup_join_government()}
        </button>
      </ActionRow>
    </>
  );
}
