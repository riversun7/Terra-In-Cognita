// 전투맵 명령 줄 — 기획 D-558 1546(45 §4.1 "아래 초상화 줄의 파티 탭 + 군단 단추, 전장을 터치해 칸·목표를 고른다"), D-549·D-558 명령 종류.
// 받는 쪽(군단 전체 또는 분대 하나)을 고르고 명령을 누른다. 진형 전진·집결은 전장의 칸을, 목표 공격은 적 유닛을 눌러 마친다(BattleReplayView가
// 땅·유닛 누르기를 받아 넘긴다). 따라가기·대형·전개 방식은 그 자리에서 고른다. 같은 받는 쪽에 방금(약 1초) 넣은 명령이 있으면 다시 넣기 링을
// 보이고 막는다(판정도 막는다 — 서버 권위). 시험용: .br-cmd, .br-cmd-who[data-party], .br-cmd-order[data-kind], .br-cmd-hint,
// select.br-cmd-shape·.br-cmd-tactic·.br-cmd-leader, .br-cmd-issue.
import {
  REPORT_FORMATIONS,
  REPORT_TACTICS,
  type ReportFormation,
  type ReportTactic,
} from "@terra/shared/battleReport";
import { useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import {
  type BattleCommandIssue,
  type BattleOrderDraft,
  type BattlePick,
  COMMAND_LOCK_MS,
} from "./battleCommands.ts";
import { formationText, orderText, tacticText } from "./battleCommandText.ts";
import "./battleCommandBar.css";

type OrderKind = BattleOrderDraft["kind"];
/** 단추 차례 */
const ORDER_KINDS: readonly OrderKind[] = [
  "advance",
  "hold",
  "attack",
  "rally",
  "follow",
  "formation",
  "tactic",
  "retreat",
  "free",
];

const isFormation = (value: string): value is ReportFormation =>
  (REPORT_FORMATIONS as readonly string[]).includes(value);
const isTactic = (value: string): value is ReportTactic =>
  (REPORT_TACTICS as readonly string[]).includes(value);

export interface BattleCommandBarProps {
  /** 내 편 파티 ID(탭 차례) */
  readonly parties: readonly number[];
  readonly timeMs: number;
  readonly pick: BattlePick;
  /** 이미 넣은 명령(다시 넣기 링) */
  readonly issued: readonly Pick<BattleCommandIssue, "party" | "atMs">[];
  /** 서버가 명령을 반영해 다시 계산하는 중 */
  readonly busy: boolean;
  readonly onPick: (pick: BattlePick) => void;
  readonly onIssue: (party: number | null, order: BattleOrderDraft) => void;
  /** 군단 단추를 보이나(없으면 보인다). 실제 세계 전투에서 내가 지휘관이 아니면 끈다(서버도 not_commander로 거절) */
  readonly legion?: boolean | undefined;
}

export function BattleCommandBar(props: BattleCommandBarProps) {
  const { parties, pick } = props;
  const id = useId();
  const legionOn = props.legion !== false;
  const [who, setWho] = useState<number | null>(legionOn ? null : (parties[0] ?? null));
  const [open, setOpen] = useState<"follow" | "formation" | "tactic" | null>(null);
  const [shape, setShape] = useState<ReportFormation>("line");
  const [tactic, setTactic] = useState<ReportTactic>("assault");
  const leaders = parties.filter((party) => party !== who);
  const [leader, setLeader] = useState<number | null>(null);
  const chosenLeader = leader !== null && leaders.includes(leader) ? leader : (leaders[0] ?? null);
  const locked = props.issued.some(
    (entry) => entry.party === who && Math.abs(entry.atMs - props.timeMs) < COMMAND_LOCK_MS,
  );
  const disabled = props.busy || locked;
  /** 칸 없이 내릴 수 있는 고르기(전진 = 적 쪽으로, 집결 = 그 자리에서) */
  const noCell = pick && pick.kind !== "attack" ? pick.kind : null;
  const whoName = (party: number | null): string =>
    party === null ? m.battle_cmd_legion() : m.battle_cmd_party({ n: parties.indexOf(party) + 1 });

  const press = (kind: OrderKind): void => {
    setOpen(null);
    if (kind === "advance" || kind === "rally" || kind === "attack") {
      props.onPick({ kind, party: who });
      return;
    }
    props.onPick(null);
    if (kind === "follow" || kind === "formation" || kind === "tactic") {
      setOpen(kind);
      return;
    }
    props.onIssue(who, { kind });
  };

  const issueOpen = (): void => {
    if (open === "follow" && chosenLeader !== null)
      props.onIssue(who, { kind: "follow", leader: chosenLeader });
    else if (open === "formation") props.onIssue(who, { kind: "formation", shape });
    else if (open === "tactic") props.onIssue(who, { kind: "tactic", tactic });
    setOpen(null);
  };

  return (
    <div
      className="br-cmd"
      role="group"
      aria-label={m.battle_cmd_label()}
      data-busy={props.busy ? "true" : "false"}
    >
      <div className="br-cmd-whos" role="group" aria-label={m.battle_cmd_who()}>
        {[...(legionOn ? [null] : []), ...parties].map((party) => (
          <button
            key={party ?? "legion"}
            type="button"
            className="button-small br-cmd-who"
            data-party={party ?? "legion"}
            data-locked={
              props.issued.some(
                (entry) => entry.party === party && Math.abs(entry.atMs - props.timeMs) < COMMAND_LOCK_MS,
              )
                ? "true"
                : "false"
            }
            aria-pressed={who === party}
            onClick={() => {
              setWho(party);
              props.onPick(null);
              setOpen(null);
            }}
          >
            {whoName(party)}
          </button>
        ))}
      </div>
      <div className="br-cmd-orders" role="group" aria-label={m.battle_cmd_orders({ who: whoName(who) })}>
        {ORDER_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className="button-small br-cmd-order"
            data-kind={kind}
            disabled={disabled || (kind === "follow" && leaders.length === 0)}
            aria-pressed={pick?.kind === kind || open === kind}
            onClick={() => press(kind)}
          >
            {orderText(kind)}
          </button>
        ))}
      </div>
      {locked ? (
        <p className="field-hint br-cmd-locked" role="status">
          {m.battle_cmd_locked()}
        </p>
      ) : null}
      {props.busy ? (
        <p className="field-hint br-cmd-busy" role="status">
          {m.battle_cmd_busy()}
        </p>
      ) : null}
      {pick ? (
        <div className="br-cmd-hint" role="status">
          <span>{pick.kind === "attack" ? m.battle_cmd_pick_target() : m.battle_cmd_pick_cell()}</span>
          {noCell ? (
            <button
              type="button"
              className="button-small br-cmd-nocell"
              onClick={() => {
                props.onPick(null);
                props.onIssue(pick.party, { kind: noCell });
              }}
            >
              {noCell === "advance" ? m.battle_cmd_toward_enemy() : m.battle_cmd_here()}
            </button>
          ) : null}
          <button type="button" className="button-small br-cmd-cancel" onClick={() => props.onPick(null)}>
            {m.battle_cmd_cancel()}
          </button>
        </div>
      ) : null}
      {open ? (
        <div className="br-cmd-more">
          <label className="field-label" htmlFor={`${id}-more`}>
            {open === "follow"
              ? m.battle_cmd_follow_who()
              : open === "formation"
                ? m.battle_cmd_shape()
                : m.battle_cmd_tactic()}
          </label>
          {open === "follow" ? (
            <select
              id={`${id}-more`}
              className="br-cmd-leader"
              value={chosenLeader ?? ""}
              onChange={(event) => setLeader(Number(event.target.value))}
            >
              {leaders.map((party) => (
                <option key={party} value={party}>
                  {whoName(party)}
                </option>
              ))}
            </select>
          ) : open === "formation" ? (
            <select
              id={`${id}-more`}
              className="br-cmd-shape"
              value={shape}
              onChange={(event) => {
                if (isFormation(event.target.value)) setShape(event.target.value);
              }}
            >
              {REPORT_FORMATIONS.map((value) => (
                <option key={value} value={value}>
                  {formationText(value)}
                </option>
              ))}
            </select>
          ) : (
            <select
              id={`${id}-more`}
              className="br-cmd-tactic"
              value={tactic}
              onChange={(event) => {
                if (isTactic(event.target.value)) setTactic(event.target.value);
              }}
            >
              {REPORT_TACTICS.map((value) => (
                <option key={value} value={value}>
                  {tacticText(value)}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="button-small button-primary br-cmd-issue"
            disabled={disabled}
            onClick={issueOpen}
          >
            {m.battle_cmd_issue()}
          </button>
        </div>
      ) : null}
    </div>
  );
}
