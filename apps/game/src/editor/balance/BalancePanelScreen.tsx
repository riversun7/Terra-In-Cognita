// 밸런스·전투 실험실(/dev/balance) — docs/adr/2026-11-01-balance-screen.md 7절·"바뀜 (2026-11-01, 전투 실험실)". dev·admin, 틀 안, 촘촘.
// 탭 둘: [전투 실험실](기본, lab/BattleLab.tsx — 팀 A·B 파티·유닛 편집·미리 보기·전투장)과 [가중치 표](WeightTab.tsx — 가중치 칸·1차 +10 기여·승률).
// 두 탭이 같은 실험실 자료(목록·프리셋·팀, useLabData)를 쓴다: 가중치 표의 기준 유닛을 팀 A 유닛·유닛 프리셋에서 불러온다.
// 탭은 처음 열 때 그리고(가중치 표 조회는 그때부터), 연 뒤에는 숨겨도 남겨 둔다(고친 값·결과가 사라지지 않게).
// 조각 이름 BalancePanelScreen-*(미리 캐시 규칙 [Bb]alancePanel). 계산은 모두 서버가 한다(기기는 판정 코드를 받지 않는다).
import { type KeyboardEvent, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { BattleLab } from "./lab/BattleLab.tsx";
import { useLabData } from "./lab/useLabData.ts";
import { WeightTab } from "./WeightTab.tsx";
import "./balancePanel.css";
import "./lab/battleLab.css";

type Tab = "lab" | "weights";
const TABS: readonly Tab[] = ["lab", "weights"];

export default function BalancePanelScreen() {
  const locale = getLocale();
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const data = useLabData();
  const [tab, setTab] = useState<Tab>("lab");
  const [opened, setOpened] = useState<ReadonlySet<Tab>>(new Set(["lab"]));

  const open = (next: Tab): void => {
    setTab(next);
    setOpened((previous) => (previous.has(next) ? previous : new Set([...previous, next])));
  };
  /** 탭 목록 화살표 이동(WAI-ARIA 탭 패턴) */
  const onKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = TABS.indexOf(tab);
    const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length] ?? "lab";
    open(next);
    document.getElementById(`bp-tab-${next}`)?.focus();
  };
  const label = (value: Tab) => (value === "lab" ? m.dev_lab_tab_lab() : m.dev_lab_tab_weights());

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
        {TABS.map((value) => (
          <button
            key={value}
            id={`bp-tab-${value}`}
            type="button"
            role="tab"
            className="bp-tab"
            aria-selected={tab === value}
            aria-controls={`bp-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => open(value)}
          >
            {label(value)}
          </button>
        ))}
      </div>
      {TABS.map((value) =>
        opened.has(value) ? (
          <div
            key={value}
            id={`bp-panel-${value}`}
            role="tabpanel"
            className="bp-tabpanel"
            aria-labelledby={`bp-tab-${value}`}
            hidden={tab !== value}
          >
            {value === "lab" ? (
              <BattleLab data={data} locale={locale} />
            ) : (
              <WeightTab data={data} locale={locale} />
            )}
          </div>
        ) : null,
      )}
    </section>
  );
}
