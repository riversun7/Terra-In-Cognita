// 상단 핵심 자산·상태 요약 바(지연 조각 — 첫 화면 묶음에 tRPC 클라이언트를 넣지 않는다).
// 모바일(< 37.5em)은 40px 상단바 바로 아래 5열 요약 줄로, 태블릿·PC(≥ 37.5em)는 한 줄 가로 지표 띠로 그린다.
import type { HoldingLine } from "@terra/shared/economy";
import { toBig } from "../economy/amount.ts";
import { fmt } from "../economy/economyText.ts";
import { NO_ARGS, useHoldings, useProduction } from "../economy/queries.ts";
import { usePreviewOn } from "../inbox/preview.ts";
import { useInboxBellCount } from "../inbox/store.ts";
import { totalLines } from "../inventory/inventoryModel.ts";
import { m } from "../paraglide/messages.js";
import { loadUnits, useRosterQuery } from "../roster/useRosterQuery.ts";
import { SignatureIcon } from "../ui/SignatureIcon.tsx";
import "./statusStrip.css";

function topCurrency(wallet: readonly HoldingLine[]): HoldingLine | null {
  let best: HoldingLine | null = null;
  for (const line of wallet) {
    if (best === null || toBig(line.qty) > toBig(best.qty)) best = line;
  }
  return best;
}

export default function StatusStrip() {
  const preview = usePreviewOn();
  const holdings = useHoldings(NO_ARGS);
  const production = useProduction(NO_ARGS);
  const units = useRosterQuery(loadUnits, preview);
  const alerts = useInboxBellCount();

  const holdingsData = holdings.status === "ready" ? holdings.data : null;
  const prodData = production.status === "ready" ? production.data : null;

  const walletTop = holdingsData !== null ? topCurrency(holdingsData.wallet) : null;
  const creditText = walletTop !== null ? fmt(toBig(walletTop.qty)) : "0";
  const creditSub = walletTop?.currency ?? null;

  const itemCount = holdingsData !== null ? totalLines(holdingsData.places).length : 0;

  const totalUnits = units.state.status === "ready" ? units.state.data.units.length : 0;
  const activeUnits =
    units.state.status === "ready"
      ? units.state.data.units.filter((u) => u.moving || u.job !== null).length
      : 0;

  const runningFacilities = prodData !== null ? prodData.facilities.filter((f) => f.workers > 0).length : 0;
  const totalFacilities = prodData !== null ? prodData.facilities.length : 0;

  return (
    <div className="status-strip" role="region" aria-label={m.shell_status_strip_label()}>
      <div className="status-cell" data-tone="gold">
        <span className="status-cell-head">
          <SignatureIcon name="credit" className="status-ico" />
          <span className="status-k">{m.shell_status_credit()}</span>
        </span>
        <strong className="status-v">
          {creditText}
          {creditSub ? <span className="status-extra"> {creditSub}</span> : null}
        </strong>
      </div>

      <div className="status-cell" data-tone="cyan">
        <span className="status-cell-head">
          <SignatureIcon name="inventory" className="status-ico" />
          <span className="status-k">{m.shell_status_goods()}</span>
        </span>
        <strong className="status-v">{itemCount}</strong>
      </div>

      <div className="status-cell" data-tone="sky">
        <span className="status-cell-head">
          <SignatureIcon name="units" className="status-ico" />
          <span className="status-k">{m.shell_status_units()}</span>
        </span>
        <strong className="status-v">
          {activeUnits}/{totalUnits}
        </strong>
      </div>

      <div className="status-cell" data-tone="emerald">
        <span className="status-cell-head">
          <SignatureIcon name="facility" className="status-ico" />
          <span className="status-k">{m.shell_status_facilities()}</span>
        </span>
        <strong className="status-v">
          {runningFacilities}
          <span className="status-extra">/{totalFacilities}</span>
        </strong>
      </div>

      <div className="status-cell" data-tone={alerts > 0 ? "amber" : "violet"}>
        <span className="status-cell-head">
          <SignatureIcon name="inbox" className="status-ico" />
          <span className="status-k">{m.shell_status_tasks()}</span>
        </span>
        <strong className="status-v">{alerts}</strong>
      </div>
    </div>
  );
}
