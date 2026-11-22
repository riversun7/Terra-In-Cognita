// 밸런스 · 전투 테스트(/dev/balance) — docs/adr/2026-11-14-battle-report.md, docs/adr/2026-11-01-balance-screen.md.
// dev·admin, 틀 안, 촘촘.
// 탭: [전투 보고서](기본, 팀 A·B 양쪽 세팅·1:1 비교·군단 편성·한 판·보고서), [3D 전투 · 리플레이](현재 세팅·시범 6v6 3D 재생 통합),
// [보고서 기록](찾기·열기·3D 보기·다시 돌리기·견주기), [분포 상성](analysis/MatrixTab.tsx).
// 조각 이름 BalancePanelScreen-*(미리 캐시 규칙 [Bb]alancePanel). 계산은 모두 서버가 한다(기기는 판정 코드를 받지 않는다).
import { type BattleReportRecord, REPORT_LIMITS } from "@terra/shared/battleReport";
import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import type { BattleCommandIssue } from "../../battle/battleCommands.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { BackButton } from "../../shell/BackButton.tsx";
import { navigate } from "../../shell/routerStore.ts";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { MatrixTab } from "./analysis/MatrixTab.tsx";
import { BattleLab, buildArenaInput } from "./lab/BattleLab.tsx";
import { BattleReplayTab, type ReplaySource } from "./lab/BattleReplayTab.tsx";
import { ReplayOverlay } from "./lab/ReplayOverlay.tsx";
import { UnitWorkshopTab } from "./lab/UnitWorkshopTab.tsx";
import { legionUnitCount } from "./lab/legionPresets.ts";
import { type LabData, useLabData } from "./lab/useLabData.ts";
import { type WatchBattleController, useWatchBattle } from "./lab/useWatchBattle.ts";
import { reportOrderOf } from "./lab/watchOrders.ts";
import { ReportLogTab } from "./report/ReportLogTab.tsx";
import { modeText, terrainLabel } from "./report/reportMessages.ts";
import {
  type ReportForm,
  formOfInput,
  legionsOf,
  loadReportForm,
  reportInputOf,
  saveReportForm,
  withLegions,
} from "./report/reportModel.ts";
import { type ReportJobState, useReportJob } from "./report/useReportJob.ts";
import "./balancePanel.css";
import "./lab/battleLab.css";
import "./lab/battleLabResults.css";
import "./lab/battleLabStudio.css";
import "./analysis/analysis.css";
import "./report/report.css";

type Tab = "report" | "units" | "replay" | "log" | "matrix";

/** 3D 관람에서 명령을 내리는 편(팀 A = 편 1) */
const WATCH_SIDE = 1;

/** 탭이 받는 것: 실험실 자료·언어·보고서 폼·일·3D 관람 제어 */
interface TabContext {
  readonly data: LabData;
  readonly locale: string;
  readonly form: ReportForm;
  readonly onForm: (form: ReportForm) => void;
  readonly editing: "a" | "b";
  readonly onEditing: (which: "a" | "b") => void;
  readonly job: ReportJobState;
  readonly onRun: () => void;
  readonly onRerun: (record: BattleReportRecord) => void;
  readonly onWatchReport: (record: BattleReportRecord) => void;
  readonly logKey: number;
  readonly watch: WatchBattleController;
  readonly activeTab: Tab;
  readonly initialReplaySource: ReplaySource;
  readonly battleKey: string;
  readonly matchupSummary: string;
  readonly onRecordSetup: () => void;
  readonly onOpenReplayTab: () => void;
  readonly onIssueWatch: (issue: BattleCommandIssue) => void;
}

/** 탭 목록(차례 = 화면 차례, 첫 줄이 기본) */
const TABS: readonly {
  readonly id: Tab;
  readonly label: () => string;
  readonly render: (ctx: TabContext) => ReactNode;
}[] = [
  {
    id: "report",
    label: m.dev_report_tab,
    render: (ctx) => (
      <BattleLab
        data={ctx.data}
        locale={ctx.locale}
        form={ctx.form}
        onForm={ctx.onForm}
        editing={ctx.editing}
        onEditing={ctx.onEditing}
        job={ctx.job}
        onRun={ctx.onRun}
        watch={ctx.watch}
        onOpenReplayTab={ctx.onOpenReplayTab}
      />
    ),
  },
  {
    id: "units",
    label: m.dev_lab_tab_units,
    render: (ctx) => <UnitWorkshopTab data={ctx.data} locale={ctx.locale} />,
  },
  {
    id: "replay",
    label: m.dev_lab_tab_replay,
    render: (ctx) => (
      <BattleReplayTab
        active={ctx.activeTab === "replay"}
        initialSource={ctx.initialReplaySource}
        modalOpen={ctx.watch.modalOpen}
        watched={ctx.watch.watched}
        watchedKey={ctx.watch.watchedKey}
        currentBattleKey={ctx.battleKey}
        matchupSummary={ctx.matchupSummary}
        busy={ctx.watch.busy}
        error={ctx.watch.error}
        command={{
          side: WATCH_SIDE,
          issued: ctx.watch.issued,
          busy: ctx.watch.commandBusy,
          onIssue: ctx.onIssueWatch,
        }}
        onRecordSetup={ctx.onRecordSetup}
        onOpenFullscreen={ctx.watch.openModal}
      />
    ),
  },
  {
    id: "log",
    label: m.dev_report_log_tab,
    // 새 보고서가 저장되면(logKey) 목록을 새로 받는다(다시 그림)
    render: (ctx) => (
      <ReportLogTab
        key={ctx.logKey}
        locale={ctx.locale}
        onRerun={ctx.onRerun}
        onWatch3D={ctx.onWatchReport}
      />
    ),
  },
  {
    id: "matrix",
    label: m.dev_lab_tab_matrix,
    render: (ctx) => <MatrixTab data={ctx.data} locale={ctx.locale} />,
  },
];

/** 보고서 이름이 비면: 종류 × 판 수 */
const fallbackName = (current: ReportForm): string => `${modeText(current.mode)} ×${current.runs}`;

/** 주소 ?tab=<ID>(없거나 모르면 initialTab, 그것도 없으면 첫 탭) */
function tabFromLocation(fallback?: Tab): Tab {
  const raw = new URLSearchParams(globalThis.location?.search ?? "").get("tab");
  const wanted = raw === "lab" ? "report" : raw;
  return TABS.find((entry) => entry.id === wanted)?.id ?? fallback ?? TABS[0]?.id ?? "report";
}

export default function BalancePanelScreen({
  initialTab,
  initialReplaySource = "setup",
}: {
  readonly initialTab?: Tab;
  readonly initialReplaySource?: ReplaySource;
} = {}) {
  const locale = getLocale();
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const data = useLabData();
  const [first] = useState<Tab>(() => tabFromLocation(initialTab));
  const [tab, setTab] = useState<Tab>(first);
  const [opened, setOpened] = useState<ReadonlySet<Tab>>(new Set([first]));
  const [form, setFormState] = useState<ReportForm>(loadReportForm);
  const [editing, setEditing] = useState<"a" | "b">("a");
  const [logKey, setLogKey] = useState(0);
  const job = useReportJob(() => setLogKey((key) => key + 1));
  const watch = useWatchBattle();

  // 옛 [스탯 영향도] 탭 주소는 2차 스탯 화면으로(D-560 1376 — 그 화면 맨 아래로 옮겼다)
  useEffect(() => {
    if (new URLSearchParams(globalThis.location?.search ?? "").get("tab") === "sensitivity")
      navigate({ route: "dev_secondary_stats" }, { replace: true });
  }, []);

  const onForm = (next: ReportForm): void => {
    setFormState(next);
    saveReportForm(next);
  };
  const onRun = (): void => job.start(reportInputOf(form, data.teams, fallbackName(form)));

  const editingB = editing === "b" && form.variantTeams !== null && form.mode !== "wave";
  const baseTeams = editingB && form.variantTeams ? form.variantTeams : data.teams;
  const legions = legionsOf(form, editingB);
  const battleKey = JSON.stringify([baseTeams, legions, form.terrain, form.limitSec, form.seed]);

  const catalog = data.load.status === "ready" ? data.load.catalog : null;
  const terrainObj = catalog?.terrains.find((entry) => entry.id === form.terrain);
  const terrainText = terrainObj ? terrainLabel(terrainObj) : form.terrain;
  const countA = legionUnitCount(baseTeams.a, legions.a.extra);
  const countB = legionUnitCount(baseTeams.b, legions.b.extra);
  const matchupSummary = `${m.dev_lab_team_a()} (${m.dev_lab_legion_summary({
    parties: legions.a.extra.length + 1,
    units: countA,
  })}) vs ${m.dev_lab_team_b()} (${m.dev_lab_legion_summary({
    parties: legions.b.extra.length + 1,
    units: countB,
  })}) · ${terrainText} · ${m.dev_lab_seed()} ${form.seed}`;

  function open(next: Tab): void {
    setTab(next);
    setOpened((previous) => (previous.has(next) ? previous : new Set([...previous, next])));
  }

  const onRecordSetup = (): void => {
    void watch.record(buildArenaInput(baseTeams, form, editingB), battleKey, { openModal: false });
  };

  /** 전투맵 명령(D-558 1546): 팀 A 군단 명령 줄에 더하고 같은 시드의 판을 다시 기록한다 */
  const onIssueWatch = (issue: BattleCommandIssue): void => {
    if (!watch.watched || watch.commandBusy) return;
    const order = reportOrderOf(issue, watch.watched.replay, WATCH_SIDE);
    if (!order || legions.a.orders.length >= REPORT_LIMITS.legionOrdersMax) return;
    const nextLegions = { ...legions, a: { ...legions.a, orders: [...legions.a.orders, order] } };
    const nextForm = withLegions(form, editingB, nextLegions);
    onForm(nextForm);
    const nextKey = JSON.stringify([baseTeams, nextLegions, form.terrain, form.limitSec, form.seed]);
    watch.issueCommand(issue, buildArenaInput(baseTeams, form, editingB, nextLegions), nextKey);
  };

  /** 기록에서 다시 돌리기: 폼·팀을 싣고 보고서 탭에서 곧바로 같은 입력으로 돌린다 */
  const onRerun = (record: BattleReportRecord): void => {
    const loaded = formOfInput(record.input, form);
    onForm(loaded.form);
    if (loaded.teams) {
      const teams = loaded.teams;
      data.setTeams((current) => ({ ...current, ...teams }));
    }
    job.show(null);
    job.start(record.input);
    open("report");
  };

  /** 기록에서 3D 보기(파티 대 파티 보고서): 팀·군단·지형·시드를 싣고 [3D 전투 · 리플레이] 탭에서 바로 재생 */
  const onWatchReport = (record: BattleReportRecord): void => {
    if (record.input.setup.mode !== "arena") return;
    const loaded = formOfInput(record.input, form);
    const nextTeams = loaded.teams ? { ...data.teams, ...loaded.teams } : data.teams;
    onForm(loaded.form);
    if (loaded.teams) data.setTeams(() => nextTeams);
    setEditing("a");
    open("replay");
    const nextLegions = loaded.form.legion;
    const nextKey = JSON.stringify([
      nextTeams,
      nextLegions,
      loaded.form.terrain,
      loaded.form.limitSec,
      loaded.form.seed,
    ]);
    void watch.record(buildArenaInput(nextTeams, loaded.form, false, nextLegions), nextKey, {
      openModal: false,
    });
  };

  const ctx: TabContext = {
    data,
    locale,
    form,
    onForm,
    editing,
    onEditing: setEditing,
    job,
    onRun,
    onRerun,
    onWatchReport,
    logKey,
    watch,
    activeTab: tab,
    initialReplaySource,
    battleKey,
    matchupSummary,
    onRecordSetup,
    onOpenReplayTab: () => open("replay"),
    onIssueWatch,
  };

  /** 탭 목록 화살표 이동(WAI-ARIA 탭 패턴) */
  const onKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = TABS.findIndex((entry) => entry.id === tab);
    const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]?.id ?? tab;
    open(next);
    document.getElementById(`bp-tab-${next}`)?.focus();
  };

  return (
    <section
      className="screen screen-wide bp-screen"
      aria-labelledby="balance-title"
      data-density="compact"
      data-tab={tab}
    >
      <ReplayOverlay
        watched={watch.modalOpen ? watch.watched : null}
        onClose={watch.closeModal}
        command={{
          side: WATCH_SIDE,
          issued: watch.issued,
          busy: watch.commandBusy,
          onIssue: onIssueWatch,
        }}
      />
      <div className="screen-header">
        <h1 id="balance-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_balance()}
        </h1>
        <AppLink className="button-small" to={{ route: "dev_secondary_stats" }}>
          {m.shell_route_dev_secondary_stats()}
        </AppLink>
        <BackButton />
      </div>
      <div className="bp-tabs" role="tablist" aria-label={m.dev_lab_tabs_label()} onKeyDown={onKey}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            id={`bp-tab-${id}`}
            type="button"
            role="tab"
            className="bp-tab"
            aria-selected={tab === id}
            aria-controls={`bp-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => open(id)}
          >
            {label()}
          </button>
        ))}
      </div>
      {TABS.map(({ id, render }) =>
        opened.has(id) ? (
          <div
            key={id}
            id={`bp-panel-${id}`}
            role="tabpanel"
            className="bp-tabpanel"
            aria-labelledby={`bp-tab-${id}`}
            hidden={tab !== id}
          >
            {render(ctx)}
          </div>
        ) : null,
      )}
    </section>
  );
}
