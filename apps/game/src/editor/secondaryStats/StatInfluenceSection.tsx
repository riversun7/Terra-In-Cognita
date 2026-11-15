// 2차 스탯 화면의 [스탯 영향도] — 기획 D-560 1376 "영향도는 2차 스탯 화면으로"(옛 밸런스 화면 /dev/balance [스탯 영향도] 탭을 옮겼다,
// docs/adr/2026-11-14-battle-report.md "바뀜 (2026-11-15, D-560)"). 기준 분포에서 1차 하나씩 옮기거나 더해 2차 스탯·승률·전투 시간이 어떻게 바뀌는지
// 서버가 잰다(analysis/SensitivityTab.tsx 그대로). 실험실 자료(목록·프리셋·팀 — useLabData)가 필요해 [열기]를 누른 뒤에만 받는다.
// 팀은 밸런스 화면과 같은 기기 저장소(labModel)를 쓴다 — 밸런스 화면에서 고친 팀 A가 여기의 "팀 A 유닛"이다.
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { SensitivityTab } from "../balance/analysis/SensitivityTab.tsx";
import { useLabData } from "../balance/lab/useLabData.ts";
import "../balance/lab/battleLab.css";
import "../balance/analysis/analysis.css";

/** 연 뒤의 판(실험실 자료를 받는다) */
function InfluencePanel({ locale }: { readonly locale: string }) {
  const data = useLabData();
  if (data.load.status === "loading") return <p className="sec-extra-note">{m.shell_loading()}</p>;
  if (data.load.status === "failed")
    return (
      <p className="sec-extra-note" role="alert">
        {m.dev_sec_influence_failed()}
      </p>
    );
  return <SensitivityTab data={data} locale={locale} />;
}

export function StatInfluenceSection({ locale }: { readonly locale: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <section
      className="sec-chart-card sec-extra sec-influence"
      aria-labelledby={`${id}-influence`}
      data-open={open ? "true" : "false"}
    >
      <div className="sec-influence-head">
        <h2 id={`${id}-influence`} className="sec-extra-title">
          {m.dev_lab_tab_sensitivity()}
        </h2>
        <button
          type="button"
          className="button-small sec-influence-toggle"
          aria-expanded={open}
          aria-controls={`${id}-influence-body`}
          onClick={() => setOpen((on) => !on)}
        >
          {open ? m.dev_sec_influence_close() : m.dev_sec_influence_open()}
        </button>
      </div>
      {/* 연 뒤에는 영향도 판이 자기 설명 줄을 보인다(겹치지 않게 닫힌 동안만) */}
      {open ? null : <p className="sec-extra-note">{m.dev_sec_influence_note()}</p>}
      <div id={`${id}-influence-body`} hidden={!open}>
        {open ? <InfluencePanel locale={locale} /> : null}
      </div>
    </section>
  );
}
