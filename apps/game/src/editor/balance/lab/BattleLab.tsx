// [전투 테스트 · 보고서] 탭 — docs/adr/2026-11-14-battle-report.md.
// 위: BattleCommandStrip(전투 규모 1:1·파티전·군단전, 팀 바꾸기·복사, [3D 전투 보기]·[한 판]·[3D 탭], 지형·시드, 한 판 결과).
// 가운데: 팀 A(왼쪽) vs 팀 B(오른쪽) 나란히 배치(군단 파티 편성·파티 불러와 군단 추가·팀/군단 저장·접이식 9×6 진형), 1:1이면 스탯 비교 카드.
// 아래: 고른 유닛 편집(왼쪽) + 서버 스탯 미리 보기(오른쪽), 그 아래 보고서 설정(공성·웨이브·명령·A/B·N판)과 보고서 결과.
// 시험용 data-*: .bl-lab data-status(loading·ready·failed).
import type {
  LabBattleInput,
  LabBattleResponse,
  LabParty,
  LabPreviewResponse,
  LabTeam,
  LabUnit,
} from "@terra/shared/battleLab";
import { REPORT_LIMITS } from "@terra/shared/battleReport";
import { useEffect, useRef, useState } from "react";
import { refreshSession } from "../../../auth/session.ts";
import { api } from "../../../net/api.ts";
import { m } from "../../../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../../../ui/LiveMessage.tsx";
import { ReportPanel } from "../report/ReportPanel.tsx";
import { ReportView } from "../report/ReportView.tsx";
import {
  EMPTY_LEGION,
  type ReportForm,
  legionInput,
  legionsOf,
  ordersWithoutParty,
  ordersWithoutTarget,
  teamsShown,
  withLegions,
  withMode,
} from "../report/reportModel.ts";
import type { ReportJobState } from "../report/useReportJob.ts";
import { BattleCommandStrip, type BattleScale } from "./BattleCommandStrip.tsx";
import { DuelCompareCard } from "./DuelCompareCard.tsx";
import { LegionBar } from "./LegionBar.tsx";
import {
  type Selection,
  type Teams,
  clampSelection,
  isLabUnitShape,
  labErrorOf,
  setPartyLevel,
  shiftPartyLevel,
  updateUnit,
} from "./labModel.ts";
import { labErrorText } from "./labMessages.ts";
import {
  type SavedLegion,
  deleteLegionPreset,
  isDuelMatchup,
  loadSavedLegions,
  saveLegionPreset,
  swapTeams,
  toDuelParty,
} from "./legionPresets.ts";
import { TeamPanel } from "./TeamPanel.tsx";
import { UnitEditor } from "./UnitEditor.tsx";
import { UnitPreview } from "./UnitPreview.tsx";
import type { LabData } from "./useLabData.ts";
import type { WatchBattleController } from "./useWatchBattle.ts";

/** 유닛을 고친 뒤 미리 보기를 다시 묻기까지(ms) — 칸을 잇달아 고칠 때 요청을 줄인다 */
const PREVIEW_DELAY_MS = 300;

/** 현재 설정으로 한 판·3D 관람 입력을 만든다(군단 전체 지원) */
export function buildArenaInput(
  baseTeams: Teams,
  form: ReportForm,
  editingB: boolean,
  overrideLegions?: { a: ReportForm["legion"]["a"]; b: ReportForm["legion"]["b"] },
): LabBattleInput {
  const current = overrideLegions ?? legionsOf(form, editingB);
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
}

export function BattleLab(props: {
  readonly data: LabData;
  readonly locale: string;
  readonly form: ReportForm;
  readonly onForm: (form: ReportForm) => void;
  readonly editing: "a" | "b";
  readonly onEditing: (which: "a" | "b") => void;
  readonly job: ReportJobState;
  readonly onRun: () => void;
  readonly watch: WatchBattleController;
  readonly onOpenReplayTab: () => void;
}) {
  const { data, locale, form, onForm, editing, onEditing, job, watch } = props;
  const { load, presets } = data;
  // 고치는 팀: B 설정을 고르면 B 팀(따로 고칠 때만), 아니면 실험실 팀(A 설정)
  const editingB = editing === "b" && form.variantTeams !== null && form.mode !== "wave";
  const baseTeams: Teams = editingB && form.variantTeams ? form.variantTeams : data.teams;
  // 군단(기획 D-179·D-545): 팀마다 고른 파티. 1번 파티 = 실험실 팀(B 팀 따로면 B 팀), 2번부터 = 고치는 설정의 군단 폼
  const legions = legionsOf(form, editingB);
  const [partyAt, setPartyAt] = useState<Readonly<Record<LabTeam, number>>>({ a: 0, b: 0 });
  const [legionModeOpen, setLegionModeOpen] = useState(false);
  const [savedLegions, setSavedLegions] = useState<SavedLegion[]>(loadSavedLegions);

  const at: Record<LabTeam, number> = {
    a: Math.min(partyAt.a, legions.a.extra.length),
    b: Math.min(partyAt.b, legions.b.extra.length),
  };
  const partyOf = (team: LabTeam) =>
    at[team] === 0 ? baseTeams[team] : (legions[team].extra[at[team] - 1] ?? baseTeams[team]);
  const teams: Teams = { a: partyOf("a"), b: partyOf("b") };

  const setBaseTeams = (change: (current: Teams) => Teams): void => {
    if (editingB && form.variantTeams) {
      onForm({ ...form, variantTeams: change(form.variantTeams) });
    } else {
      data.setTeams(change);
    }
  };

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

  /** 파티 추가(현재 파티 복제 또는 저장된 파티 프리셋을 곧바로 군단에 추가) */
  const appendParty = (team: LabTeam, party: LabParty): void => {
    const legion = legions[team];
    if (legion.extra.length + 1 >= REPORT_LIMITS.legionPartiesEditMax) return;
    onForm(
      withLegions(form, editingB, {
        ...legions,
        [team]: { ...legion, extra: [...legion.extra, party] },
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
  const [battleBusy, setBattleBusy] = useState(false);
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
  const isDuel = isDuelMatchup(baseTeams, legions.a.extra.length, legions.b.extra.length);
  const hasLegionParties = legions.a.extra.length > 0 || legions.b.extra.length > 0;
  const activeScale: BattleScale = legionModeOpen || hasLegionParties ? "legion" : isDuel ? "duel" : "party";

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

  /** 전투 규모 빠른 전환(1:1 비교·파티전·군단전) */
  const onScale = (scale: BattleScale): void => {
    let nextForm = form.mode === "arena" ? form : withMode(form, "arena");
    if (scale === "duel") {
      setLegionModeOpen(false);
      const keepA = selected.team === "a" && at.a === 0 ? selected.index : 0;
      const keepB = selected.team === "b" && at.b === 0 ? selected.index : 0;
      const duelTeams: Teams = {
        a: toDuelParty(baseTeams.a, keepA),
        b: toDuelParty(baseTeams.b, keepB),
      };
      nextForm = withLegions(nextForm, editingB, {
        a: { ...legions.a, extra: [] },
        b: { ...legions.b, extra: [] },
      });
      if (editingB && nextForm.variantTeams) nextForm = { ...nextForm, variantTeams: duelTeams };
      else data.setTeams(() => duelTeams);
      onForm(nextForm);
      setPartyAt({ a: 0, b: 0 });
      setPicked({ team: selected.team, index: 0 });
      onNotice(m.dev_lab_duel_ready(), "success");
      return;
    }
    if (scale === "party") {
      setLegionModeOpen(false);
      nextForm = withLegions(nextForm, editingB, {
        a: { ...legions.a, extra: [] },
        b: { ...legions.b, extra: [] },
      });
      onForm(nextForm);
      setPartyAt({ a: 0, b: 0 });
      return;
    }
    setLegionModeOpen(true);
    if (nextForm !== form) onForm(nextForm);
  };

  /** 팀 A ↔ 팀 B 맞바꾸기(군단 파티와 명령 포함) */
  const onSwapTeams = (): void => {
    const swapped = swapTeams(baseTeams);
    let nextForm = withLegions(form, editingB, { a: legions.b, b: legions.a });
    if (editingB && nextForm.variantTeams) nextForm = { ...nextForm, variantTeams: swapped };
    else data.setTeams(() => swapped);
    onForm(nextForm);
    setPartyAt({ a: at.b, b: at.a });
    setPicked({ team: selected.team === "a" ? "b" : "a", index: selected.index });
    onNotice(m.dev_lab_swapped_teams(), "success");
  };

  /** 팀 A 구성을 팀 B에 복사(군단 파티 포함) */
  const onCopyAToB = (): void => {
    const copied: Teams = { a: baseTeams.a, b: baseTeams.a };
    let nextForm = withLegions(form, editingB, {
      a: legions.a,
      b: { ...EMPTY_LEGION, extra: [...legions.a.extra] },
    });
    if (editingB && nextForm.variantTeams) nextForm = { ...nextForm, variantTeams: copied };
    else data.setTeams(() => copied);
    onForm(nextForm);
    setPartyAt({ a: at.a, b: Math.min(at.b, legions.a.extra.length) });
    onNotice(m.dev_lab_copied_a_to_b(), "success");
  };

  /** 양 팀 전체(모든 군단 파티 포함) 유닛 레벨을 한 번에 맞춤 */
  const onSetAllLevel = (level: number): void => {
    const nextTeams: Teams = {
      a: setPartyLevel(baseTeams.a, level),
      b: setPartyLevel(baseTeams.b, level),
    };
    let nextForm = withLegions(form, editingB, {
      a: { ...legions.a, extra: legions.a.extra.map((party) => setPartyLevel(party, level)) },
      b: { ...legions.b, extra: legions.b.extra.map((party) => setPartyLevel(party, level)) },
    });
    if (editingB && nextForm.variantTeams) nextForm = { ...nextForm, variantTeams: nextTeams };
    else data.setTeams(() => nextTeams);
    onForm(nextForm);
    onNotice(m.dev_lab_level_applied_all({ level }), "success");
  };

  /** 양 팀 전체(모든 군단 파티 포함) 유닛 레벨을 ±delta만큼 조정 */
  const onShiftAllLevel = (delta: number): void => {
    const nextTeams: Teams = {
      a: shiftPartyLevel(baseTeams.a, delta),
      b: shiftPartyLevel(baseTeams.b, delta),
    };
    let nextForm = withLegions(form, editingB, {
      a: { ...legions.a, extra: legions.a.extra.map((party) => shiftPartyLevel(party, delta)) },
      b: { ...legions.b, extra: legions.b.extra.map((party) => shiftPartyLevel(party, delta)) },
    });
    if (editingB && nextForm.variantTeams) nextForm = { ...nextForm, variantTeams: nextTeams };
    else data.setTeams(() => nextTeams);
    onForm(nextForm);
    onNotice(m.dev_lab_level_shifted_all({ delta: delta > 0 ? `+${delta}` : String(delta) }), "success");
  };

  const runBattle = (): void => {
    if (battleBusy || watch.busy) return;
    setBattleBusy(true);
    problem.clear();
    const key = battleKey;
    api.battleLab.battle
      .mutate(buildArenaInput(baseTeams, form, editingB))
      .then((result) => setBattle({ result, key }), fail)
      .finally(() => setBattleBusy(false));
  };

  const runWatchModal = (): void => {
    if (battleBusy || watch.busy) return;
    problem.clear();
    void watch.record(buildArenaInput(baseTeams, form, editingB), battleKey, {
      openModal: true,
      onError: (msg) => problem.show([msg]),
    });
  };

  const openReplayTab = (): void => {
    if (battleBusy || watch.busy) return;
    problem.clear();
    props.onOpenReplayTab();
    void watch.record(buildArenaInput(baseTeams, form, editingB), battleKey, {
      openModal: false,
      onError: (msg) => problem.show([msg]),
    });
  };

  const handleSaveLegion = (team: LabTeam, name: string): void => {
    const parties = [baseTeams[team], ...legions[team].extra];
    const outcome = saveLegionPreset(savedLegions, name, parties);
    if (!outcome) return;
    setSavedLegions(outcome.list);
    onNotice(m.dev_lab_legion_preset_saved({ name: outcome.saved.name }), "success");
  };

  const handleLoadLegion = (team: LabTeam, preset: SavedLegion): void => {
    const [first, ...rest] = preset.parties;
    if (!first) return;
    setBaseTeams((current) => ({ ...current, [team]: first }));
    onForm(
      withLegions(form, editingB, {
        ...legions,
        [team]: { ...legions[team], extra: rest },
      }),
    );
    setPartyAt({ ...at, [team]: 0 });
    setPicked({ team, index: 0 });
    onNotice(m.dev_lab_legion_preset_loaded({ name: preset.name }), "success");
  };

  const handleDeleteLegion = (preset: SavedLegion): void => {
    setSavedLegions((current) => deleteLegionPreset(current, preset.id));
    onNotice(m.dev_lab_legion_preset_deleted({ name: preset.name }), "success");
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
  const visibleTeams = (["a", "b"] as const).filter((team) => shown[team]);
  const busyMode: "battle" | "watch" | null = battleBusy ? "battle" : watch.busy ? "watch" : null;

  return (
    <div
      className="bl-lab"
      data-status="ready"
      data-revision={catalog.revision}
      data-editing={editingB ? "b" : "a"}
      data-scale={activeScale}
    >
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

      <BattleCommandStrip
        catalog={catalog}
        form={form}
        onForm={onForm}
        scale={activeScale}
        onScale={onScale}
        onSwapTeams={onSwapTeams}
        onCopyAToB={onCopyAToB}
        onSetAllLevel={onSetAllLevel}
        onShiftAllLevel={onShiftAllLevel}
        busy={busyMode}
        onBattle={runBattle}
        onWatch={runWatchModal}
        onOpenReplayTab={openReplayTab}
        battle={battle ? { result: battle.result, stale: battle.key !== battleKey } : null}
        problem={problem}
        teams={baseTeams}
        legion={{
          a: [baseTeams.a, ...legions.a.extra],
          b: [baseTeams.b, ...legions.b.extra],
        }}
        locale={locale}
      />

      {visibleTeams.length > 0 ? (
        <div className="bl-teams-vs" data-count={visibleTeams.length}>
          {visibleTeams.map((team) => (
            <div key={team} className="rp-legion-team" data-team={team}>
              <LegionBar
                team={team}
                firstParty={baseTeams[team]}
                extraParties={legions[team].extra}
                at={at[team]}
                presets={presets?.presets ?? []}
                savedLegions={savedLegions}
                locale={locale}
                expanded={legionModeOpen}
                onPick={(index) => setPartyAt({ ...at, [team]: index })}
                onAddClone={() => appendParty(team, partyOf(team))}
                onAddPresetParty={(party, label) => {
                  appendParty(team, party);
                  onNotice(m.dev_lab_legion_added_preset({ name: label }), "success");
                }}
                onRemove={() => removeParty(team)}
                onSaveLegion={(name) => handleSaveLegion(team, name)}
                onLoadLegion={(preset) => handleLoadLegion(team, preset)}
                onDeleteLegion={handleDeleteLegion}
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
        </div>
      ) : null}

      {form.mode === "arena" && isDuel && baseTeams.a.units[0] && baseTeams.b.units[0] ? (
        <DuelCompareCard
          unitA={baseTeams.a.units[0]}
          unitB={baseTeams.b.units[0]}
          catalog={catalog}
          locale={locale}
        />
      ) : null}

      {shown.a || shown.b ? (
        <div className="bl-workbench">
          <div className="bl-col">
            {unit ? (
              <UnitEditor
                key={unitKey}
                unit={unit}
                unitKey={unitKey}
                team={selected.team}
                catalog={catalog}
                presets={presets}
                locale={locale}
                onChange={(change) => setTeams((current) => updateUnit(current, selected, change))}
                onPresets={data.setPresets}
                onNotice={onNotice}
              />
            ) : null}
          </div>
          <div className="bl-col">
            <UnitPreview
              preview={preview?.result ?? null}
              error={previewError}
              stale={preview !== null && preview.key !== unitJson}
              catalog={catalog}
              locale={locale}
            />
          </div>
        </div>
      ) : null}

      <ReportPanel
        catalog={catalog}
        form={form}
        onForm={onForm}
        teams={data.teams}
        editing={editingB ? "b" : "a"}
        onEditing={onEditing}
        job={job}
        onRun={props.onRun}
      />

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
