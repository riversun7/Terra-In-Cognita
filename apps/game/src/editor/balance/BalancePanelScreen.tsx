// 밸런스 · 전투 보고서(/dev/balance) — docs/adr/2026-11-14-battle-report.md(개편), docs/adr/2026-11-01-balance-screen.md.
// dev·admin, 틀 안, 촘촘. 탭: [전투 보고서](기본, lab/BattleLab.tsx — 팀·유닛 편집·보고서 설정·N판 판정·보고서), [보고서 기록]
// (report/ReportLogTab.tsx — 날짜·이름으로 찾기·열기·다시 돌리기·둘 견주기), [분포 상성](analysis/MatrixTab.tsx), [스탯 영향도]
// (analysis/SensitivityTab.tsx). 옛 [가중치 표]·[계산식] 탭은 2차 스탯 화면(/dev/secondary-stats)과 겹쳐 지웠다(스태미나·적정치·+10 대결은
// 그 화면으로 옮김, docs/research/2026-11-14-dev-tools-overlap.md). 옛 ?tab=weights·formulas 주소는 보고서 탭(머리에 2차 스탯 화면 바로가기).
// 주소 ?tab=<ID>로 바로 그 탭을 연다(시험·링크, 옛 ?tab=lab은 보고서 탭).
// 실험실 자료(목록·프리셋·팀, useLabData)와 보고서 폼·일(useReportJob)은 이 틀이 든다: 기록에서 [다시 돌리기]하면 폼·팀을 싣고 곧바로 돌린다.
// 탭은 처음 열 때 그리고, 연 뒤에는 숨겨도 남겨 둔다(고친 값·결과가 사라지지 않게).
// 조각 이름 BalancePanelScreen-*(미리 캐시 규칙 [Bb]alancePanel). 계산은 모두 서버가 한다(기기는 판정 코드를 받지 않는다).
import type { BattleReportRecord } from "@terra/shared/battleReport";
import { type KeyboardEvent, type ReactNode, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { BackButton } from "../../shell/BackButton.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { MatrixTab } from "./analysis/MatrixTab.tsx";
import { SensitivityTab } from "./analysis/SensitivityTab.tsx";
import { BattleLab } from "./lab/BattleLab.tsx";
import { ReportLogTab } from "./report/ReportLogTab.tsx";
import {
  type ReportForm,
  formOfInput,
  loadReportForm,
  reportInputOf,
  saveReportForm,
} from "./report/reportModel.ts";
import { modeText } from "./report/reportMessages.ts";
import { type ReportJobState, useReportJob } from "./report/useReportJob.ts";
import { type LabData, useLabData } from "./lab/useLabData.ts";
import "./balancePanel.css";
import "./lab/battleLab.css";
import "./lab/battleLabResults.css";
import "./analysis/analysis.css";
import "./report/report.css";

type Tab = "report" | "log" | "matrix" | "sensitivity";

/** 탭이 받는 것: 실험실 자료·언어·보고서 폼·일 */
interface TabContext {
  readonly data: LabData;
  readonly locale: string;
  readonly form: ReportForm;
  readonly onForm: (form: ReportForm) => void;
  readonly job: ReportJobState;
  readonly onRun: () => void;
  readonly onRerun: (record: BattleReportRecord) => void;
  readonly logKey: number;
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
        job={ctx.job}
        onRun={ctx.onRun}
      />
    ),
  },
  {
    id: "log",
    label: m.dev_report_log_tab,
    // 새 보고서가 저장되면(logKey) 목록을 새로 받는다(다시 그림)
    render: (ctx) => <ReportLogTab key={ctx.logKey} locale={ctx.locale} onRerun={ctx.onRerun} />,
  },
  {
    id: "matrix",
    label: m.dev_lab_tab_matrix,
    render: (ctx) => <MatrixTab data={ctx.data} locale={ctx.locale} />,
  },
  {
    id: "sensitivity",
    label: m.dev_lab_tab_sensitivity,
    render: (ctx) => <SensitivityTab data={ctx.data} locale={ctx.locale} />,
  },
];

/** 보고서 이름이 비면: 종류 × 판 수 */
const fallbackName = (current: ReportForm): string => `${modeText(current.mode)} ×${current.runs}`;

/** 주소 ?tab=<ID>(없거나 모르면 첫 탭) */
function tabFromLocation(): Tab {
  const raw = new URLSearchParams(globalThis.location?.search ?? "").get("tab");
  // 옛 [전투 실험실] 주소는 보고서 탭(같은 팀·유닛 편집이 있다)
  const wanted = raw === "lab" ? "report" : raw;
  return TABS.find((entry) => entry.id === wanted)?.id ?? TABS[0]?.id ?? "report";
}

export default function BalancePanelScreen() {
  const locale = getLocale();
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const data = useLabData();
  const [first] = useState<Tab>(tabFromLocation);
  const [tab, setTab] = useState<Tab>(first);
  const [opened, setOpened] = useState<ReadonlySet<Tab>>(new Set([first]));
  const [form, setFormState] = useState<ReportForm>(loadReportForm);
  const [logKey, setLogKey] = useState(0);
  const job = useReportJob(() => setLogKey((key) => key + 1));
  const onForm = (next: ReportForm): void => {
    setFormState(next);
    saveReportForm(next);
  };
  const onRun = (): void => job.start(reportInputOf(form, data.teams, fallbackName(form)));
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
  const ctx: TabContext = { data, locale, form, onForm, job, onRun, onRerun, logKey };

  function open(next: Tab): void {
    setTab(next);
    setOpened((previous) => (previous.has(next) ? previous : new Set([...previous, next])));
  }
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
