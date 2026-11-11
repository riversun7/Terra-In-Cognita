// 다른 가문의 마크·이름 [신고] 단추(질문 930 나) — 유닛 한눈 정보의 "주인 세력" 줄 곁에 둔다. 누르면 확인 줄 → [신고 보내기]면
// tRPC factionIdentity.report. 결과(받음·이미 신고함·오늘 다 씀 등)를 같은 자리에 보인다. 운영자는 마크 관리 목록에서 신고 수로 본다.
// docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)".
import type { FactionReportStatus } from "@terra/shared/factionIdentity";
import { useState } from "react";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { REPORT_TEXT } from "./identityText.ts";

type ReportState =
  | { readonly kind: "idle" }
  | { readonly kind: "confirm" }
  | { readonly kind: "busy" }
  | { readonly kind: "done"; readonly status: FactionReportStatus }
  | { readonly kind: "failed" };

export function HouseReport({ houseId, name }: { readonly houseId: number; readonly name: string }) {
  const [state, setState] = useState<ReportState>({ kind: "idle" });
  const send = async (): Promise<void> => {
    setState({ kind: "busy" });
    try {
      const result = await api.factionIdentity.report.mutate({ factionId: houseId });
      setState({ kind: "done", status: result.status });
    } catch {
      setState({ kind: "failed" });
    }
  };
  if (state.kind === "done" || state.kind === "failed")
    return (
      <p className="map-peek-line map-peek-report-result" role="status" data-part="peek-report-result">
        {state.kind === "done" ? REPORT_TEXT[state.status]() : m.map_peek_report_failed()}
      </p>
    );
  if (state.kind === "idle")
    return (
      <button
        type="button"
        className="button-small map-peek-report"
        data-part="peek-report"
        onClick={() => setState({ kind: "confirm" })}
      >
        {m.map_peek_report()}
      </button>
    );
  return (
    <div className="map-peek-line map-peek-report-confirm" data-part="peek-report-confirm">
      <span>{m.map_peek_report_confirm({ name })}</span>
      <button
        type="button"
        className="button-small map-peek-report-send"
        aria-disabled={state.kind === "busy"}
        onClick={() => {
          if (state.kind !== "busy") void send();
        }}
      >
        {m.map_peek_report_send()}
      </button>
      <button type="button" className="button-small" onClick={() => setState({ kind: "idle" })}>
        {m.cancel()}
      </button>
    </div>
  );
}
