// 유닛 화면 "전투" 칸 — 실제 세계 전투 명령(기획 D-558 1546 "전투맵 명령 화면" → D-571 답 1969). 내 유닛이 낀 진행 중인 세계 전투를 받고
// (battle_list), 고른 전투에 전투맵 명령 줄(BattleCommandBar — 다시보기·3D 관람과 같은 부품)로 파티·군단 명령을 넣는다(battle_order, 프로토콜 49).
// - 세계 전투는 서버가 빨리감기로 계산하고 끝 시각에 결과를 적용한다. 명령은 다음 판정 틱에 들어가고 그 뒤를 다시 계산한다(서버 권위·결정성).
//   실시간 전장 그림이 아직 없어 칸 고르기 대신 "적 쪽으로·그 자리에서", 목표 공격은 적 유닛 목록에서 고른다 [임시](질문 2111).
// - 군단 단추는 지금 내가 그 편 지휘관일 때만(서버도 not_commander로 막는다). 파티 탭은 모두 내 유닛인 파티만.
// 시험용: .lb-panel, .lb-battle[data-battle], .lb-empty, .lb-status, .lb-enemy, .lb-refresh.
import type { BattleView } from "@terra/protocol";
import { useCallback, useEffect, useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { formatNumber } from "../roster/rosterText.ts";
import { BattleCommandBar } from "../battle/BattleCommandBar.tsx";
import type { BattleCommandIssue, BattleOrderDraft, BattlePick } from "../battle/battleCommands.ts";
import {
  type LiveBattleFailure,
  liveOrderOf,
  requestLiveBattles,
  sendLiveOrder,
} from "../battle/liveBattleCommands.ts";
import { serverLink } from "../net/serverLink.ts";

type ListState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly battles: readonly BattleView[] }
  | { readonly status: "error"; readonly code: LiveBattleFailure };

const FAILURE: Readonly<Record<LiveBattleFailure, () => string>> = {
  sign_in_required: m.live_battle_fail_sign_in,
  busy: m.live_battle_fail_busy,
  rate_limited: m.live_battle_fail_rate_limited,
  internal_error: m.live_battle_fail_internal,
  no_cyborg: m.live_battle_fail_no_cyborg,
  unknown_battle: m.live_battle_fail_unknown_battle,
  not_participant: m.live_battle_fail_not_participant,
  not_your_party: m.live_battle_fail_not_your_party,
  not_commander: m.live_battle_fail_not_commander,
  rejected: m.live_battle_fail_rejected,
  offline: m.live_battle_fail_offline,
  timeout: m.live_battle_fail_timeout,
};
export const liveFailureText = (code: LiveBattleFailure): string => FAILURE[code]();

/** 서버 시계 기준 지금(ms) — 전투 시각은 서버 시계다 */
const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

export function LiveBattlesPanel() {
  const id = useId();
  // 새로 고침 = 목록 몸을 다시 만든다(key)
  const [round, setRound] = useState(0);
  const reload = useCallback(() => setRound((value) => value + 1), []);
  return (
    <div className="units-panel-body lb-panel" aria-labelledby={`${id}-title`}>
      <div className="lb-head">
        <h2 id={`${id}-title`} className="lb-title">
          {m.live_battle_title()}
        </h2>
        <button type="button" className="button-small lb-refresh" onClick={reload}>
          {m.live_battle_refresh()}
        </button>
      </div>
      <p className="field-hint">{m.live_battle_intro()}</p>
      <LiveBattleList key={round} />
    </div>
  );
}

function LiveBattleList() {
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [chosen, setChosen] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void requestLiveBattles().then((outcome) => {
      if (!live) return;
      setList(
        outcome.ok ? { status: "ready", battles: outcome.battles } : { status: "error", code: outcome.code },
      );
    });
    return () => {
      live = false;
    };
  }, []);
  const battles = list.status === "ready" ? list.battles : [];
  const battle = battles.find((entry) => entry.battle === chosen) ?? battles[0];
  return (
    <>
      {list.status === "loading" ? <p className="field-hint">{m.live_battle_loading()}</p> : null}
      {list.status === "error" ? (
        <p className="field-hint lb-status" role="alert">
          {liveFailureText(list.code)}
        </p>
      ) : null}
      {list.status === "ready" && battles.length === 0 ? (
        <p className="field-hint lb-empty">{m.live_battle_empty()}</p>
      ) : null}
      {battles.length > 1 ? (
        <div className="lb-tabs" role="group" aria-label={m.live_battle_pick()}>
          {battles.map((entry) => (
            <button
              key={entry.battle}
              type="button"
              className="button-small lb-tab"
              aria-pressed={entry.battle === battle?.battle}
              onClick={() => setChosen(entry.battle)}
            >
              {m.live_battle_name({ id: formatNumber(entry.battle) })}
            </button>
          ))}
        </div>
      ) : null}
      {battle ? <LiveBattle key={battle.battle} battle={battle} /> : null}
    </>
  );
}

function LiveBattle({ battle }: { battle: BattleView }) {
  const [nowMs, setNowMs] = useState(serverNow);
  const [pick, setPick] = useState<BattlePick>(null);
  const [issued, setIssued] = useState<Pick<BattleCommandIssue, "party" | "atMs">[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // 명령으로 다시 계산한 끝 시각(서버 답)
  const [endsAtMs, setEndsAtMs] = useState(battle.endsAtMs);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(serverNow()), 250);
    return () => clearInterval(timer);
  }, []);
  const timeMs = Math.max(0, nowMs - battle.startedAtMs);
  const leftSec = Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
  const parties = battle.parties.filter((party) => party.mine).map((party) => party.id);

  const issue = (party: number | null, draft: BattleOrderDraft): void => {
    setPick(null);
    setBusy(true);
    setStatus(null);
    const atMs = Math.max(0, serverNow() - battle.startedAtMs);
    void sendLiveOrder({ battle: battle.battle, party, order: liveOrderOf(draft, battle.mapSize) }).then(
      (outcome) => {
        setBusy(false);
        if (outcome.ok) {
          setIssued((list) => [...list.slice(-9), { party, atMs }]);
          setStatus(m.live_battle_sent({ tick: formatNumber(outcome.tick) }));
          setEndsAtMs(outcome.endsAtMs);
        } else setStatus(liveFailureText(outcome.code));
      },
    );
  };

  return (
    <article
      className="lb-battle"
      data-battle={battle.battle}
      aria-label={m.live_battle_name({ id: formatNumber(battle.battle) })}
    >
      <p className="lb-meta">
        <span>{m.live_battle_name({ id: formatNumber(battle.battle) })}</span>
        <span>{battle.kind === "siege" ? m.live_battle_kind_siege() : m.live_battle_kind_normal()}</span>
        <span>{m.live_battle_left({ sec: formatNumber(leftSec) })}</span>
        <span>{battle.commander ? m.live_battle_commander() : m.live_battle_not_commander()}</span>
      </p>
      {parties.length === 0 && !battle.commander ? (
        <p className="field-hint">{m.live_battle_no_parties()}</p>
      ) : (
        <BattleCommandBar
          parties={parties}
          timeMs={timeMs}
          pick={pick}
          issued={issued}
          busy={busy}
          legion={battle.commander}
          onPick={setPick}
          onIssue={issue}
        />
      )}
      {pick?.kind === "attack" ? (
        <div className="lb-enemies" role="group" aria-label={m.live_battle_targets()}>
          {battle.enemies.map((unit, index) => (
            <button
              key={unit}
              type="button"
              className="button-small lb-enemy"
              data-unit={unit}
              onClick={() => issue(pick.party, { kind: "attack", target: unit })}
            >
              {m.live_battle_enemy({ n: formatNumber(index + 1) })}
            </button>
          ))}
        </div>
      ) : null}
      {status ? (
        <p className="field-hint lb-status" role="status">
          {status}
        </p>
      ) : null}
    </article>
  );
}
