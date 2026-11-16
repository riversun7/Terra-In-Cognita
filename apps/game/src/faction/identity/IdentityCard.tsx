// 세력 화면 옆 판의 "내 가문" 칸(질문 926 나 — 정체성을 정하면 곧 가문 창설) — 창설했으면 마크·이름·약어 표지와 [고치기], 초안만 저장했으면
// [가문 창설 마치기], 아직이면 [가문 창설].
// 운영자가 올린 마크를 내렸으면 알림(사유)과 [확인]을 보인다. 자료는 factionIdentity.mine(세력 화면 조회와 따로 — 실패해도 세력 화면은 그대로).
// docs/adr/2026-11-11-faction-identity.md 2·5절
// 바뀜(질문 985 다): 가문원 목록·초대·가입 신청·나가기·가문 소식은 HouseSection(factionIdentity.house — 이 조회도 따로, 실패하면 그 부분만
// 빠진다). 다른 사람의 가문에 든 가문원에게는 그 가문의 이름·마크가 보이고 [가문 창설] 링크는 없다(사용자마다 한 가문).
// 바뀜(질문 2242 이름 붙이기 길): 이름이 자리표시("가문 #ID" — 서버가 만든 이름 없는 1인 가문, 운영자가 되돌린 이름)면 안내 한 줄과 [이름 정하기]
// (같은 정체성 화면 — 이름 대기 없이 바로 정한다).
import { type FactionIdentityMine, labelTextOn } from "@terra/shared/factionIdentity";
import { type HouseView, houseResetName } from "@terra/shared/house";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { useScreenQuery } from "../../sections/useScreenQuery.ts";
import { AppLink } from "../../shell/AppLink.tsx";
import { NationEmblem } from "../../ui/NationEmblem.tsx";
import { StatusIcon } from "../../ui/StatusIcon.tsx";
import { HouseSection } from "./HouseSection.tsx";
import { dismissIdentityNotice, loadHouseView, loadIdentityMine } from "./identityQueries.ts";
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
  const houseQuery = useScreenQuery(loadHouseView);
  const [changed, setChanged] = useState<FactionIdentityMine | null>(null);
  const [houseChanged, setHouseChanged] = useState<HouseView | null>(null);
  const mine = changed ?? state.data;
  const houseView = houseChanged ?? houseQuery.state.data;
  // 이 서버에 기능이 없거나(DB 없음) 받지 못했으면 칸을 그리지 않는다(세력 화면의 나머지는 그대로)
  if (mine === null) return null;
  // 다른 사람의 가문에 든 가문원: 그 가문의 이름·마크를 보인다
  const memberOf = houseView?.house?.role === "member" ? houseView.house : null;
  const identity = memberOf ?? mine.identity;
  const founded = mine.house !== null || memberOf !== null;
  // 내 가문의 이름이 아직 자리표시(서버가 만든 1인 가문·운영자가 되돌린 이름)
  const unnamed = mine.house !== null && mine.identity?.name === houseResetName(mine.house.factionId);
  return (
    <section
      className="panel faction-me fid-card"
      aria-labelledby="fid-card-title"
      data-set={identity ? "" : undefined}
      data-house={founded ? "" : undefined}
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
      {identity && !founded ? <p className="faction-muted">{m.faction_identity_draft()}</p> : null}
      {unnamed && !memberOf ? (
        <p className="faction-muted" data-part="fid-unnamed">
          {m.faction_identity_unnamed()}
        </p>
      ) : null}
      <p className="faction-muted fid-card-note">{m.faction_identity_note()}</p>
      {memberOf ? null : (
        <AppLink className="fid-card-link" to={{ route: "faction_identity" }}>
          {unnamed
            ? m.faction_identity_name_house()
            : founded
              ? m.faction_identity_edit()
              : identity
                ? m.faction_identity_finish()
                : m.faction_identity_start()}
        </AppLink>
      )}
      {houseView ? (
        <HouseSection
          view={houseView}
          onView={setHouseChanged}
          onChanged={() => {
            setHouseChanged(null);
            houseQuery.refresh();
          }}
        />
      ) : null}
    </section>
  );
}
