// 밸런스·전투 실험실(/dev/balance) — docs/adr/2026-11-01-balance-screen.md 7절·"바뀜 (2026-11-01, 전투 실험실)". dev·admin, 틀 안, 촘촘.
// 탭 둘: [전투 실험실](기본, lab/BattleLab.tsx — 팀 A·B 파티·유닛 편집·미리 보기·전투장)과 [가중치 표](WeightTab.tsx — 가중치 칸·1차 +10 기여·승률).
// 두 탭이 같은 실험실 자료(목록·프리셋·팀, useLabData)를 쓴다: 가중치 표의 기준 유닛을 팀 A 유닛·유닛 프리셋에서 불러온다.
// 탭은 처음 열 때 그리고(가중치 표 조회는 그때부터), 연 뒤에는 숨겨도 남겨 둔다(고친 값·결과가 사라지지 않게).
// 탭을 더하거나 바꾸려면 TABS 줄 하나(ID·이름·그리기)를 고친다(계산식 탭 등 다른 줄기의 탭도 같은 자리에 단다).
// 조각 이름 BalancePanelScreen-*(미리 캐시 규칙 [Bb]alancePanel). 계산은 모두 서버가 한다(기기는 판정 코드를 받지 않는다).
import { type KeyboardEvent, type ReactNode, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { BattleLab } from "./lab/BattleLab.tsx";
import { type LabData, useLabData } from "./lab/useLabData.ts";
import { WeightTab } from "./WeightTab.tsx";
import "./balancePanel.css";
import "./lab/battleLab.css";
import "./lab/battleLabResults.css";

type Tab = "lab" | "weights";

/** 탭 목록(차례 = 화면 차례, 첫 줄이 기본). 그리기는 두 탭이 같이 쓰는 실험실 자료를 받는다 */
const TABS: readonly {
  readonly id: Tab;
  readonly label: () => string;
  readonly render: (data: LabData, locale: string) => ReactNode;
}[] = [
  {
    id: "lab",
    label: m.dev_lab_tab_lab,
    render: (data, locale) => <BattleLab data={data} locale={locale} />,
  },
  {
    id: "weights",
    label: m.dev_lab_tab_weights,
    render: (data, locale) => <WeightTab data={data} locale={locale} />,
  },
];

export default function BalancePanelScreen() {
  const locale = getLocale();
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const data = useLabData();
  const [tab, setTab] = useState<Tab>(TABS[0]?.id ?? "lab");
  const [opened, setOpened] = useState<ReadonlySet<Tab>>(new Set([TABS[0]?.id ?? "lab"]));

  const open = (next: Tab): void => {
    setTab(next);
    setOpened((previous) => (previous.has(next) ? previous : new Set([...previous, next])));
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
      <div className="screen-header">
        <h1 id="balance-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_balance()}
        </h1>
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
            {render(data, locale)}
          </div>
        ) : null,
      )}
    </section>
  );
}
