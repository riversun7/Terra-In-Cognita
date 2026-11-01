// 아이템 편집기 머리 판(설계안 3.2 머리 줄) — 팩 판·덮어쓰기 판·아이템 수·바뀐 항목 수·잠든 줄 수와 [내보내기]·[최근 바꿈] 단추,
// 잠든 줄 판(켤 때 적용하지 않은 덮어쓰기: 까닭과 [버리기 담기]), 팩 차이 내보내기 판(pnpm tuning:apply로 팩에 넣는 파일).
import type { ContentSleepingRow } from "@terra/shared/contentEdit";
import type { ItemEditorListResponse } from "@terra/shared/itemEditor";
import type { TuningExportResponse } from "@terra/shared/tuning";
import { m } from "../../paraglide/messages.js";
import { sleepText } from "./itemMessages.ts";

export function ItemSummary({
  list,
  sleeping,
  historyOpen,
  onExport,
  onHistory,
}: {
  list: ItemEditorListResponse;
  sleeping: number;
  historyOpen: boolean;
  onExport: () => void;
  onHistory: () => void;
}) {
  const changed = list.items.filter((item) => item.origin !== "pack").length;
  return (
    <ul className="ie-summary" aria-label={m.dev_items_summary_label()}>
      <li>{m.dev_items_pack({ version: list.contentVersion })}</li>
      <li className="ie-revision">{m.dev_items_revision({ revision: list.revision })}</li>
      <li>{m.dev_items_count({ count: list.items.length })}</li>
      <li className="ie-changed" data-count={changed}>
        {m.dev_items_changed({ count: changed })}
      </li>
      {sleeping > 0 ? <li className="ie-changed">{m.dev_items_sleeping({ count: sleeping })}</li> : null}
      <li className="ie-summary-tools">
        <button type="button" className="button-small" onClick={onExport}>
          {m.dev_items_export()}
        </button>
        <button type="button" className="button-small" aria-expanded={historyOpen} onClick={onHistory}>
          {m.dev_items_history()}
        </button>
      </li>
    </ul>
  );
}

export function SleepingPanel({
  rows,
  onDiscard,
}: {
  rows: readonly ContentSleepingRow[];
  onDiscard: (category: string, id: string) => void;
}) {
  return (
    <section className="ie-panel ie-sleeping" aria-labelledby="ie-sleeping-title">
      <h2 id="ie-sleeping-title" className="ie-heading">
        {m.dev_items_sleeping_title()}
      </h2>
      <ul className="ie-plain">
        {rows.map((line) => (
          <li key={`${line.category}/${line.id}`} className="ie-sleeping-row">
            <span>
              {line.category}/{line.id} · {sleepText(line.reason)} · {line.contentVersion}
            </span>
            <button type="button" className="button-small" onClick={() => onDiscard(line.category, line.id)}>
              {m.dev_items_sleeping_discard()}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ExportPanel({ exported, onClose }: { exported: TuningExportResponse; onClose: () => void }) {
  const text = `${JSON.stringify(exported.diff, null, 2)}\n`;
  const download = (): void => {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = exported.fileName;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="ie-panel ie-export" aria-labelledby="ie-export-title">
      <h2 id="ie-export-title" className="ie-heading">
        {m.dev_items_export_title()}
      </h2>
      <p className="field-hint">{m.dev_items_export_hint()}</p>
      <textarea
        className="input ie-export-text"
        readOnly
        rows={6}
        value={text}
        aria-labelledby="ie-export-title"
      />
      <div className="ie-inline-actions">
        <button type="button" className="button-small button-primary" onClick={download}>
          {m.dev_items_export_download()}
        </button>
        <button type="button" className="button-small" onClick={onClose}>
          {m.dev_items_close()}
        </button>
      </div>
    </section>
  );
}
