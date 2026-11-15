// [전투 보고서] 탭 — docs/adr/2026-11-14-battle-report.md(옛 [전투 실험실], docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)").
// 팀 A·B(파티 하나씩, 최대 6명)를 꾸리고 고른 유닛을 고치며(서버 미리 보기가 따라옴), 보고서 설정(파티 대 파티·파티 공성·웨이브 공성, A/B,
// 판 수·시드)으로 서버 워커가 N판을 돌려 보고서를 만들고 기록으로 남긴다. 파티 대 파티는 한 판·3D 관람도 그대로 있다.
// 넓은 화면: 왼쪽 = 팀 둘 + 설정 + 한 판, 오른쪽 = 유닛 편집 + 미리 보기, 아래 = 보고서. 좁은 화면(390px)은 한 줄로 쌓는다.
// A/B에서 B 팀을 따로 고치면 팀 판·유닛 편집이 고르는 설정(A·B)의 팀을 고친다. 폼·보고서 일은 화면 틀이 든다(기록에서 다시 돌리기).
// 시험용 data-*: .bl-lab data-status(loading·ready·failed).
import type { LabBattleResponse, LabPreviewResponse, LabTeam, LabUnit } from "@terra/shared/battleLab";
import { REPORT_LIMITS } from "@terra/shared/battleReport";
import { decodeBattleReplay, replayFromBase64 } from "@terra/protocol/battleReplay";
import { useEffect, useRef, useState } from "react";
import type { BattleCommandIssue } from "../../../battle/battleCommands.ts";
import { loadReplayGround } from "../../../battle/replayTerrain.ts";
import { refreshSession } from "../../../auth/session.ts";
import { api } from "../../../net/api.ts";
import { m } from "../../../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../../../ui/LiveMessage.tsx";
import { ReportPanel } from "../report/ReportPanel.tsx";
import { ReportView } from "../report/ReportView.tsx";
import {
  type ReportForm,
  legionInput,
  legionsOf,
  ordersWithoutParty,
  ordersWithoutTarget,
  teamsShown,
  withLegions,
} from "../report/reportModel.ts";
import type { ReportJobState } from "../report/useReportJob.ts";
import { ArenaPanel } from "./ArenaPanel.tsx";
import {
  type Selection,
  type Teams,
  clampSelection,
  isLabUnitShape,
  labErrorOf,
  updateUnit,
} from "./labModel.ts";
import { labErrorText } from "./labMessages.ts";
import { ReplayOverlay, type WatchedBattle } from "./ReplayOverlay.tsx";
import { reportOrderOf } from "./watchOrders.ts";
import { TeamPanel } from "./TeamPanel.tsx";
import { UnitEditor } from "./UnitEditor.tsx";
import { UnitPreview } from "./UnitPreview.tsx";
import type { LabData } from "./useLabData.ts";

/** 군단 파티 고르기 줄: 파티 탭, 더하기(상한까지), 고른 파티 빼기(2번부터) */
function PartyBar(props: {
  readonly team: LabTeam;
  readonly count: number;
  readonly at: number;
  readonly onPick: (index: number) => void;
  readonly onAdd: () => void;
  readonly onRemove: () => void;
}) {
  const label = props.team.toUpperCase();
  return (
    <div className="rp-partybar">
      <div className="rp-party-tabs" role="tablist" aria-label={m.dev_report_party_label({ team: label })}>
        {Array.from({ length: props.count }, (_, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={props.at === index}
            className="rp-party-tab"
            data-party={index}
            onClick={() => props.onPick(index)}
          >
            {m.dev_report_party_tab({ n: index + 1 })}
          </button>
        ))}
        {props.count < REPORT_LIMITS.legionPartiesEditMax ? (
          <button type="button" className="button-small rp-party-add" onClick={props.onAdd}>
            {m.dev_report_party_add()}
          </button>
        ) : null}
        {props.at > 0 ? (
          <button type="button" className="button-small rp-party-remove" onClick={props.onRemove}>
            {m.dev_report_party_remove()}
          </button>
        ) : null}
      </div>
      {props.count > 1 ? <p className="field-hint">{m.dev_report_party_hint()}</p> : null}
    </div>
  );
}

/** 3D 관람에서 명령을 내리는 편(팀 A = 편 1, 관람 판은 편을 바꾸지 않는다) */
const WATCH_SIDE = 1;

/** 유닛을 고친 뒤 미리 보기를 다시 묻기까지(ms) — 칸을 잇달아 고칠 때 요청을 줄인다 */
const PREVIEW_DELAY_MS = 300;

export function BattleLab(props: {
  readonly data: LabData;
  readonly locale: string;
  readonly form: ReportForm;
  readonly onForm: (form: ReportForm) => void;
  readonly job: ReportJobState;
  readonly onRun: () => void;
}) {
  const { data, locale, form, onForm, job } = props;
  const { load, presets } = data;
  const [editing, setEditing] = useState<"a" | "b">("a");
  // 고치는 팀: B 설정을 고르면 B 팀(따로 고칠 때만), 아니면 실험실 팀(A 설정)
  const editingB = editing === "b" && form.variantTeams !== null && form.mode !== "wave";
  const baseTeams: Teams = editingB && form.variantTeams ? form.variantTeams : data.teams;
  // 군단(기획 D-179·D-545): 팀마다 고른 파티. 1번 파티 = 실험실 팀(B 팀 따로면 B 팀), 2번부터 = 고치는 설정의 군단 폼(사용자 1468)
  const legions = legionsOf(form, editingB);
  const [partyAt, setPartyAt] = useState<Readonly<Record<LabTeam, number>>>({ a: 0, b: 0 });
  const at: Record<LabTeam, number> = {
    a: Math.min(partyAt.a, legions.a.extra.length),
    b: Math.min(partyAt.b, legions.b.extra.length),
  };
  const partyOf = (team: LabTeam) =>
    at[team] === 0 ? baseTeams[team] : (legions[team].extra[at[team] - 1] ?? baseTeams[team]);
  const teams: Teams = { a: partyOf("a"), b: partyOf("b") };
  const setTeams = (change: (current: Teams) => Teams): void => {
    const next = change(teams);
    let nextForm = form;
    const first: { a?: Teams["a"]; b?: Teams["b"] } = {};
    for (const team of ["a", "b"] as const) {
      if (next[team] === teams[team]) continue;
      const slot = at[team];
      if (slot === 0) first[team] = next[team];
      else {
        const current = legionsOf(nextForm, editingB);
        const legion = current[team];
        const extra = legion.extra.map((party, index) => (index === slot - 1 ? next[team] : party));
        nextForm = withLegions(nextForm, editingB, { ...current, [team]: { ...legion, extra } });
      }
    }
    if (Object.keys(first).length > 0) {
      if (editingB && nextForm.variantTeams)
        nextForm = { ...nextForm, variantTeams: { ...nextForm.variantTeams, ...first } };
      else data.setTeams((current) => ({ ...current, ...first }));
    }
    if (nextForm !== form) onForm(nextForm);
  };
  /** 파티 더하기(고른 파티를 베낀다)·빼기(2번부터) */
  const addParty = (team: LabTeam): void => {
    const legion = legions[team];
    if (legion.extra.length + 1 >= REPORT_LIMITS.legionPartiesEditMax) return;
    onForm(
      withLegions(form, editingB, {
        ...legions,
        [team]: { ...legion, extra: [...legion.extra, partyOf(team)] },
      }),
    );
    setPartyAt({ ...at, [team]: legion.extra.length + 1 });
  };
  /** 파티 빼기: 그 파티 명령은 지우고 뒤 파티 번호를 당긴다. 상대 군단의 그 파티 목표 공격도 지운다 */
  const removeParty = (team: LabTeam): void => {
    const slot = at[team];
    if (slot === 0) return;
    const legion = legions[team];
    const other = team === "a" ? "b" : "a";
    onForm(
      withLegions(form, editingB, {
        ...legions,
        [team]: {
          ...legion,
          extra: legion.extra.filter((_, index) => index !== slot - 1),
          orders: ordersWithoutParty(legion.orders, slot),
        },
        [other]: { ...legions[other], orders: ordersWithoutTarget(legions[other].orders, slot) },
      }),
    );
    setPartyAt({ ...at, [team]: slot - 1 });
  };
  const shown = teamsShown(form);
  const [pickedRaw, setPicked] = useState<Selection>({ team: "a", index: 0 });
  const picked: Selection = shown[pickedRaw.team] ? pickedRaw : { team: shown.a ? "a" : "b", index: 0 };
  const [preview, setPreview] = useState<{ key: string; result: LabPreviewResponse } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"battle" | "watch" | null>(null);
  const [watched, setWatched] = useState<WatchedBattle | null>(null);
  // 3D 관람 전투맵 명령(D-558 1546): 이번 관람에서 넣은 명령, 다시 기록하는 중
  const [watchIssued, setWatchIssued] = useState<readonly BattleCommandIssue[]>([]);
  const [watchBusy, setWatchBusy] = useState(false);
  const [battle, setBattle] = useState<{ result: LabBattleResponse; key: string } | null>(null);
  const notice = useLiveLines();
  const noticeError = useLiveLines();
  const problem = useLiveLines();
  const previewSeq = useRef(0);

  const selected = clampSelection(teams, picked);
  const unit: LabUnit | undefined = teams[selected.team].units[selected.index];
  const unitKey = `${editingB ? "B:" : ""}${selected.team.toUpperCase()}${at[selected.team] + 1}·${selected.index + 1}`;
  // 미리 보기 지문: 유닛 값이 바뀔 때만 다시 묻는다
  const unitJson = unit ? JSON.stringify(unit) : "";
  const ready = load.status === "ready";

  useEffect(() => {
    if (!ready || unitJson === "") return undefined;
    const seq = previewSeq.current + 1;
    previewSeq.current = seq;
    const timer = setTimeout(() => {
      // 지문은 이 화면이 만든 유닛 JSON 그대로다(서버가 다시 검사한다)
      const input: unknown = JSON.parse(unitJson);
      if (!isLabUnitShape(input)) return;
      api.battleLab.preview.query(input).then(
        (result) => {
          if (previewSeq.current !== seq) return;
          setPreview({ key: unitJson, result });
          setPreviewError(null);
        },
        (error: unknown) => {
          if (previewSeq.current !== seq) return;
          const info = labErrorOf(error);
          if (info.sessionEnded) void refreshSession();
          setPreviewError(labErrorText(info.key));
        },
      );
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, unitJson]);

  const battleKey = JSON.stringify([baseTeams, legions, form.terrain, form.limitSec, form.seed]);

  const onNotice = (line: string, tone: "success" | "error"): void => {
    if (tone === "success") {
      noticeError.clear();
      notice.show([line]);
    } else {
      notice.clear();
      noticeError.show([line]);
    }
  };

  const fail = (error: unknown): void => {
    const info = labErrorOf(error);
    if (info.sessionEnded) void refreshSession();
    problem.show([labErrorText(info.key)]);
  };

  // 한 판·3D 관람도 군단 전체(모든 파티와 명령, 사용자 1469). 파티 하나·명령 없음이면 옛 실험실 입력 그대로
  const arenaInput = (current = legions) => {
    const limitSec = Math.min(600, form.limitSec);
    const whole = current.a.extra.length > 0 || current.b.extra.length > 0;
    const orders = current.a.orders.length > 0 || current.b.orders.length > 0;
    return {
      a: baseTeams.a,
      b: baseTeams.b,
      terrain: form.terrain,
      limitSec,
      seed: form.seed,
      ...(whole || orders
        ? { legion: { a: legionInput(baseTeams.a, current.a), b: legionInput(baseTeams.b, current.b) } }
        : {}),
    };
  };

  const runBattle = (): void => {
    if (busy) return;
    setBusy("battle");
    problem.clear();
    const key = battleKey;
    api.battleLab.battle
      .mutate(arenaInput())
      .then((result) => setBattle({ result, key }), fail)
      .finally(() => setBusy(null));
  };

  /** 3D 관람: 서버가 같은 시드의 한 판을 리플레이로 기록 → 경기장 지형을 받아 보기 창을 연다 */
  const runWatch = (): void => {
    if (busy) return;
    setBusy("watch");
    problem.clear();
    api.battleLab.replay
      .mutate(arenaInput())
      .then(async (result) => {
        const replay = decodeBattleReplay(replayFromBase64(result.replay));
        const ground = await loadReplayGround(replay.arena);
        setWatchIssued([]);
        setWatched({ replay, ground });
      }, fail)
      .catch(fail)
      .finally(() => setBusy(null));
  };

  /**
   * 전투맵 명령(D-558 1546): 관람 화면에서 내린 명령을 팀 A 군단 명령 줄에 더하고(폼에 남는다 — 보고서 판에도 든다), 같은 시드의 판을 다시
   * 기록해 그 시각부터 보여 준다. 판정은 서버가 한다(정원 밖·다시 넣기 막기는 거절 — 결과 판의 거절 칩)
   */
  const issueWatch = (issue: BattleCommandIssue): void => {
    if (!watched || watchBusy) return;
    const order = reportOrderOf(issue, watched.replay, WATCH_SIDE);
    if (!order || legions.a.orders.length >= REPORT_LIMITS.legionOrdersMax) return;
    const next = { ...legions, a: { ...legions.a, orders: [...legions.a.orders, order] } };
    onForm(withLegions(form, editingB, next));
    setWatchIssued([...watchIssued, issue]);
    setWatchBusy(true);
    api.battleLab.replay
      .mutate(arenaInput(next))
      .then(async (result) => {
        const replay = decodeBattleReplay(replayFromBase64(result.replay));
        const ground = await loadReplayGround(replay.arena);
        setWatched({ replay, ground, startAtMs: issue.atMs });
      }, fail)
      .catch(fail)
      .finally(() => setWatchBusy(false));
  };

  if (load.status === "loading")
    return (
      <div className="bl-lab" data-status="loading">
        <p className="field-hint">{m.dev_balance_loading()}</p>
      </div>
    );
  if (load.status === "failed")
    return (
      <div className="bl-lab bp-failed" data-status="failed">
        <p role="alert" className="field-error">
          {labErrorText(load.error.key)}
        </p>
        <button type="button" className="button-small" onClick={data.reload}>
          {m.dev_balance_retry()}
        </button>
      </div>
    );
  const { catalog } = load;
  return (
    <div
      className="bl-lab"
      data-status="ready"
      data-revision={catalog.revision}
      data-editing={editingB ? "b" : "a"}
    >
      <ReplayOverlay
        watched={watched}
        onClose={() => setWatched(null)}
        command={{ side: WATCH_SIDE, issued: watchIssued, busy: watchBusy, onIssue: issueWatch }}
      />
      <p className="lead bp-lead">{m.dev_report_lead()}</p>
      <ul className="bp-summary" aria-label={m.dev_balance_summary_label()}>
        <li>{m.dev_balance_pack({ version: catalog.contentVersion })}</li>
        <li>{m.dev_balance_revision({ revision: catalog.revision })}</li>
        <li>{m.dev_lab_growth_chip({ growth: catalog.growth.growthPm, max: catalog.growth.maxLevel })}</li>
        {presets && presets.invalid > 0 ? (
          <li className="bl-invalid">{m.dev_lab_presets_invalid({ count: presets.invalid })}</li>
        ) : null}
      </ul>
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={noticeError.lines} version={noticeError.version} />
      <div className="bl-layout">
        <div className="bl-col">
          {(["a", "b"] as const)
            .filter((team) => shown[team])
            .map((team) => (
              <div key={team} className="rp-legion-team" data-team={team}>
                <PartyBar
                  team={team}
                  count={legions[team].extra.length + 1}
                  at={at[team]}
                  onPick={(index) => setPartyAt({ ...at, [team]: index })}
                  onAdd={() => addParty(team)}
                  onRemove={() => removeParty(team)}
                />
                <TeamPanel
                  key={`${editingB ? "B" : "A"}-${team}-${at[team]}`}
                  team={team}
                  teams={teams}
                  setTeams={setTeams}
                  selected={selected}
                  onSelect={setPicked}
                  catalog={catalog}
                  presets={presets}
                  onPresets={data.setPresets}
                  onNotice={onNotice}
                  locale={locale}
                />
              </div>
            ))}
          <ReportPanel
            catalog={catalog}
            form={form}
            onForm={onForm}
            teams={data.teams}
            editing={editingB ? "b" : "a"}
            onEditing={setEditing}
            job={job}
            onRun={props.onRun}
          />
          {form.mode === "arena" ? (
            <ArenaPanel
              catalog={catalog}
              limitSec={form.limitSec}
              busy={busy}
              onBattle={runBattle}
              onWatch={runWatch}
              battle={battle ? { result: battle.result, stale: battle.key !== battleKey } : null}
              problem={problem}
              teams={baseTeams}
              legion={{
                a: [baseTeams.a, ...legions.a.extra],
                b: [baseTeams.b, ...legions.b.extra],
              }}
              locale={locale}
            />
          ) : null}
        </div>
        {shown.a || shown.b ? (
          <div className="bl-col">
            {unit ? (
              <UnitEditor
                key={unitKey}
                unit={unit}
                unitKey={unitKey}
                catalog={catalog}
                presets={presets}
                locale={locale}
                onChange={(change) => setTeams((current) => updateUnit(current, selected, change))}
                onPresets={data.setPresets}
                onNotice={onNotice}
              />
            ) : null}
            <UnitPreview
              preview={preview?.result ?? null}
              error={previewError}
              stale={preview !== null && preview.key !== unitJson}
              catalog={catalog}
              locale={locale}
            />
          </div>
        ) : null}
      </div>
      {job.record ? (
        <section className="rp-latest" aria-label={m.dev_report_latest()}>
          <h2 className="bp-title">{m.dev_report_latest()}</h2>
          <ReportView key={job.record.id || job.record.createdAtMs} record={job.record} locale={locale} />
        </section>
      ) : (
        <p className="field-hint bl-results-empty">{m.dev_report_empty()}</p>
      )}
    </div>
  );
}
