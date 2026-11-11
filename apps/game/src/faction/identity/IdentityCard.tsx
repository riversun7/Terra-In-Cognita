// 세력 화면 옆 판의 "내 세력 이름과 마크" 칸 — 정했으면 마크·이름·약어 표지와 [고치기], 아직이면 [세력 정체성 정하기].
// 운영자가 올린 마크를 내렸으면 알림(사유)과 [확인]을 보인다. 자료는 factionIdentity.mine(세력 화면 조회와 따로 — 실패해도 세력 화면은 그대로).
// docs/adr/2026-11-11-faction-identity.md 2·5절
import { type FactionIdentityMine, labelTextOn } from "@terra/shared/factionIdentity";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { useScreenQuery } from "../../sections/useScreenQuery.ts";
import { AppLink } from "../../shell/AppLink.tsx";
import { NationEmblem } from "../../ui/NationEmblem.tsx";
import { StatusIcon } from "../../ui/StatusIcon.tsx";
import { dismissIdentityNotice, loadIdentityMine } from "./identityQueries.ts";
import "./identityCard.css";

function Notice({
  mine,
  onDismissed,
}: {
  mine: FactionIdentityMine;
  onDismissed: (next: FactionIdentityMine) => void;
}) {
  const [busy, setBusy] = useState(false);
  const notice = mine.notice;
  if (notice === null) return null;
  const dismiss = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      onDismissed(await dismissIdentityNotice());
    } catch {
      // 실패하면 알림을 그대로 둔다(다시 누를 수 있다)
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="message message-info fid-notice" role="status" data-testid="fid-notice">
      <StatusIcon tone="info" />
      <div className="message-body">
        <p>{m.faction_identity_notice_removed()}</p>
        {notice.reason === null ? null : (
          <p className="fid-notice-reason">{m.faction_identity_notice_reason({ reason: notice.reason })}</p>
        )}
        <button
          type="button"
          className="button-small fid-notice-ok"
          aria-disabled={busy}
          onClick={() => void dismiss()}
        >
          {m.faction_identity_notice_ok()}
        </button>
      </div>
    </div>
  );
}

export function IdentityCard() {
  const { state } = useScreenQuery(loadIdentityMine);
  const [changed, setChanged] = useState<FactionIdentityMine | null>(null);
  const mine = changed ?? state.data;
  // 이 서버에 기능이 없거나(DB 없음) 받지 못했으면 칸을 그리지 않는다(세력 화면의 나머지는 그대로)
  if (mine === null) return null;
  const identity = mine.identity;
  return (
    <section
      className="panel faction-me fid-card"
      aria-labelledby="fid-card-title"
      data-set={identity ? "" : undefined}
    >
      <h2 id="fid-card-title" className="screen-section-title">
        {m.faction_identity_title()}
      </h2>
      <Notice mine={mine} onDismissed={setChanged} />
      {identity ? (
        <p className="fid-card-line">
          <NationEmblem
            spec={identity.emblem}
            color={identity.color}
            uploaded={identity.uploaded}
            size={40}
            className="fid-card-emblem"
          />
          <span className="fid-card-name" translate="no">
            {identity.name}
          </span>
          <span
            className="fid-card-short"
            style={{ backgroundColor: identity.color, color: labelTextOn(identity.color) }}
            translate="no"
          >
            {identity.shortName}
          </span>
        </p>
      ) : (
        <p className="faction-muted">{m.faction_identity_unset()}</p>
      )}
      <p className="faction-muted fid-card-note">{m.faction_identity_note()}</p>
      <AppLink className="fid-card-link" to={{ route: "faction_identity" }}>
        {identity ? m.faction_identity_edit() : m.faction_identity_start()}
      </AppLink>
    </section>
  );
}
