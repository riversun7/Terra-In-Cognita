// 세력 화면 "내 가문" 칸의 가입 부분(질문 985 다 — 초대 + 신청) — 가문원 목록·가문장의 초대·대기 중인 요청(받기·거절·거두기)·
// 내보내기, 가문원의 나가기, 가문이 없으면 받은 초대·보낸 신청과 가입할 수 있는 가문 목록([가입 신청]), 가문 소식([확인]).
// 자료는 tRPC factionIdentity.house, 바꾸는 명령은 WebSocket(houseCommands.ts sendHouseMember, 프로토콜 23). 명령 뒤에는 자료를 다시 받는다.
// 프로토콜 24(질문 1003 가·1005 가): 가문장의 [가문장 넘기기]·혼자 남은 가문장의 [가문 해산](도시 없는 가문만), 가문 도시 부분(HouseCityBlock.tsx).
// 프로토콜 39(기획 D-565): 소속 도시 부분(HouseHomeBlock.tsx — 가문장의 [소속 도시 바꾸기], 무소속 안내). 가입은 나라를 가리지 않는다.
// docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 981~986 답)"·"바뀜 (2026-11-15, D-565)"
import { labelTextOn } from "@terra/shared/factionIdentity";
import type { HouseBadge, HouseView } from "@terra/shared/house";
import { type ReactNode, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { formatAmount } from "../../roster/rosterText.ts";
import { dateText } from "../../sections/screenText.ts";
import { NationEmblem } from "../../ui/NationEmblem.tsx";
import { HouseCityBlock } from "./HouseCityBlock.tsx";
import { HouseHomeBlock } from "./HouseHomeBlock.tsx";
import { type HouseMemberRequest, sendHouseMember } from "./houseCommands.ts";
import { HOUSE_ACTION_TEXT, HOUSE_MEMBER_ERROR_TEXT, houseNoticeText } from "./houseText.ts";
import { dismissHouseNotices } from "./identityQueries.ts";

const DAY_MS = 86_400_000;

type Status = { readonly tone: "ok" | "error"; readonly text: string } | null;

/** 명령 하나를 보내고 결과 문장을 남긴 뒤 자료를 다시 받는다 */
function useHouseCommand(onChanged: () => void) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const run = async (body: HouseMemberRequest, accepted = false): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await sendHouseMember(body);
      if (outcome.ok) {
        const action = accepted && outcome.action === "joined" ? "accepted" : outcome.action;
        setStatus({ tone: "ok", text: HOUSE_ACTION_TEXT[action]() });
      } else setStatus({ tone: "error", text: HOUSE_MEMBER_ERROR_TEXT[outcome.code]() });
      onChanged();
      return outcome.ok;
    } finally {
      setBusy(false);
    }
  };
  return { busy, status, run };
}

function BadgeLine({ house, children }: { house: HouseBadge; children?: ReactNode }) {
  return (
    <li className="fid-house-row" data-house={house.factionId}>
      <NationEmblem spec={house.emblem} color={house.color} uploaded={house.uploaded} size={24} />
      <span className="fid-house-row-main">
        <span className="fid-house-row-name" translate="no">
          {house.name}{" "}
          <span
            className="fid-house-short"
            style={{ backgroundColor: house.color, color: labelTextOn(house.color) }}
          >
            {house.shortName}
          </span>
        </span>
        <span className="faction-muted">
          {m.fid_house_joinable_line({ count: house.memberCount, leader: house.leaderName ?? "—" })}
        </span>
      </span>
      {children}
    </li>
  );
}

function Notices({ view, onView }: { view: HouseView; onView: (next: HouseView) => void }) {
  const [busy, setBusy] = useState(false);
  if (view.notices.length === 0) return null;
  const dismiss = async (ids?: readonly number[]): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      onView(await dismissHouseNotices(ids));
    } catch {
      // 실패하면 소식을 그대로 둔다(다시 누를 수 있다)
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fid-house-block" data-testid="house-notices">
      <h3 className="fid-house-sub">{m.fid_house_notices_title()}</h3>
      <ul className="fid-house-list">
        {view.notices.map((notice) => (
          <li key={notice.id} className="fid-house-row" data-notice={notice.kind}>
            <span className="fid-house-row-main">
              <span>{houseNoticeText(notice)}</span>
              {notice.reason === null ? null : (
                <span className="faction-muted fid-notice-reason">
                  {m.faction_identity_notice_reason({ reason: notice.reason })}
                </span>
              )}
            </span>
            <button
              type="button"
              className="button-small"
              aria-disabled={busy}
              onClick={() => void dismiss([notice.id])}
            >
              {m.faction_identity_notice_ok()}
            </button>
          </li>
        ))}
      </ul>
      {view.notices.length > 1 ? (
        <button type="button" className="button-small" aria-disabled={busy} onClick={() => void dismiss()}>
          {m.fid_house_notice_all()}
        </button>
      ) : null}
    </div>
  );
}

/** 확인 줄이 붙는 단추(내보내기·나가기) */
function ConfirmButton({
  label,
  question,
  confirm,
  disabled,
  onConfirm,
}: {
  label: string;
  question: string;
  confirm: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className="button-small" aria-disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  return (
    <span className="fid-house-confirm" role="group" aria-label={question}>
      <span>{question}</span>
      <button
        type="button"
        className="button-small button-primary"
        aria-disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirm}
      </button>
      <button type="button" className="button-small" onClick={() => setAsking(false)}>
        {m.cancel()}
      </button>
    </span>
  );
}

function MyHouse({
  house,
  home,
  limits,
  command,
  onChanged,
}: {
  house: NonNullable<HouseView["house"]>;
  home: HouseView["home"];
  limits: HouseView["limits"];
  command: ReturnType<typeof useHouseCommand>;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const leader = house.role === "leader";
  const { busy, run } = command;
  return (
    <>
      {home ? (
        <HouseHomeBlock
          home={home}
          inHouse
          leader={leader}
          busy={busy}
          onChange={(cityId) => void run({ t: "house_home", cityId })}
        />
      ) : null}
      {house.vault === undefined ? null : (
        // 가문 금고(국고와 따로 — D-338·D-213, 질문 2150 고침): 가문원 모두에게 잔고만
        <div className="fid-house-block" data-testid="house-vault">
          <p data-part="house-vault">{m.fid_house_vault({ amount: formatAmount(house.vault) })}</p>
          <p className="faction-muted">{m.fid_house_vault_hint()}</p>
        </div>
      )}
      <div className="fid-house-block" data-testid="house-members">
        <h3 className="fid-house-sub">
          {m.fid_house_members_title()}{" "}
          <span className="faction-muted">
            {m.fid_house_count({ count: house.members.length, max: limits.memberMax })}
          </span>
        </h3>
        <ul className="fid-house-list">
          {house.members.map((member) => (
            <li key={member.userId} className="fid-house-row" data-role={member.role}>
              <span className="fid-house-row-main">
                <span className="fid-house-row-name" translate="no">
                  {member.name ?? m.fid_house_someone()}
                </span>
                <span className="faction-muted">
                  {member.role === "leader" ? m.fid_house_role_leader() : m.fid_house_role_member()}
                </span>
              </span>
              {leader && member.role === "member" ? (
                <span className="fid-house-actions">
                  <ConfirmButton
                    label={m.fid_house_handover()}
                    question={m.fid_house_handover_confirm({ name: member.name ?? m.fid_house_someone() })}
                    confirm={m.fid_house_handover_yes()}
                    disabled={busy}
                    onConfirm={() => void run({ t: "house_handover", userId: member.userId })}
                  />
                  <ConfirmButton
                    label={m.fid_house_kick()}
                    question={m.fid_house_kick_confirm({ name: member.name ?? m.fid_house_someone() })}
                    confirm={m.fid_house_kick_yes()}
                    disabled={busy}
                    onConfirm={() => void run({ t: "house_kick", userId: member.userId })}
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      {leader ? (
        <form
          className="fid-house-block fid-house-invite"
          onSubmit={(event) => {
            event.preventDefault();
            const value = name.trim();
            if (value === "") return;
            void run({ t: "house_invite", name: value }).then((ok) => {
              if (ok) setName("");
            });
          }}
        >
          <label className="fid-house-sub" htmlFor="fid-house-invite-name">
            {m.fid_house_invite_label()}
          </label>
          <span className="fid-house-invite-row">
            <input
              id="fid-house-invite-name"
              className="input"
              maxLength={32}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button type="submit" className="button-small button-primary" aria-disabled={busy}>
              {m.fid_house_invite()}
            </button>
          </span>
          <span className="faction-muted">
            {m.fid_house_invite_hint({ days: Math.max(1, Math.round(limits.requestTtlMs / DAY_MS)) })}
          </span>
        </form>
      ) : null}
      {leader && house.requests.length > 0 ? (
        <div className="fid-house-block" data-testid="house-requests">
          <h3 className="fid-house-sub">{m.fid_house_requests_title()}</h3>
          <ul className="fid-house-list">
            {house.requests.map((request) => (
              <li key={request.id} className="fid-house-row" data-kind={request.kind}>
                <span className="fid-house-row-main">
                  <span className="fid-house-row-name" translate="no">
                    {request.name ?? m.fid_house_someone()}
                  </span>
                  <span className="faction-muted">
                    {request.kind === "invite" ? m.fid_house_request_invite() : m.fid_house_request_apply()} ·{" "}
                    {m.fid_house_expires({ when: dateText(request.expiresAt) })}
                  </span>
                </span>
                <span className="fid-house-actions">
                  {request.kind === "apply" ? (
                    <>
                      <button
                        type="button"
                        className="button-small button-primary"
                        aria-disabled={busy}
                        onClick={() =>
                          void run({ t: "house_answer", requestId: request.id, accept: true }, true)
                        }
                      >
                        {m.fid_house_accept()}
                      </button>
                      <button
                        type="button"
                        className="button-small"
                        aria-disabled={busy}
                        onClick={() => void run({ t: "house_answer", requestId: request.id, accept: false })}
                      >
                        {m.fid_house_decline()}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button-small"
                      aria-disabled={busy}
                      onClick={() => void run({ t: "house_withdraw", requestId: request.id })}
                    >
                      {m.fid_house_withdraw()}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {house.city ? <HouseCityBlock city={house.city} leader={leader} onChanged={onChanged} /> : null}
      {leader ? (
        <>
          <p className="faction-muted">{m.fid_house_leader_note()}</p>
          {house.members.length <= 1 && house.city?.status == null ? (
            <ConfirmButton
              label={m.fid_house_dissolve()}
              question={m.fid_house_dissolve_confirm()}
              confirm={m.fid_house_dissolve_yes()}
              disabled={busy}
              onConfirm={() => void run({ t: "house_dissolve" })}
            />
          ) : null}
        </>
      ) : (
        <ConfirmButton
          label={m.fid_house_leave()}
          question={m.fid_house_leave_confirm()}
          confirm={m.fid_house_leave_yes()}
          disabled={busy}
          onConfirm={() => void run({ t: "house_leave" })}
        />
      )}
    </>
  );
}

function NoHouse({ view, command }: { view: HouseView; command: ReturnType<typeof useHouseCommand> }) {
  const { busy, run } = command;
  if (view.nationId === null) return <p className="faction-muted">{m.fid_house_no_cyborg()}</p>;
  const home = view.home;
  const applied = new Set(
    view.offers.filter((offer) => offer.kind === "apply").map((offer) => offer.house.factionId),
  );
  return (
    <>
      {home ? (
        <HouseHomeBlock home={home} inHouse={false} leader={false} busy={busy} onChange={() => undefined} />
      ) : null}
      {view.offers.length > 0 ? (
        <div className="fid-house-block" data-testid="house-offers">
          <h3 className="fid-house-sub">{m.fid_house_offers_title()}</h3>
          <ul className="fid-house-list">
            {view.offers.map((offer) => (
              <li key={offer.id} className="fid-house-row" data-kind={offer.kind}>
                <NationEmblem
                  spec={offer.house.emblem}
                  color={offer.house.color}
                  uploaded={offer.house.uploaded}
                  size={24}
                />
                <span className="fid-house-row-main">
                  <span translate="no">
                    {offer.kind === "invite"
                      ? m.fid_house_offer_invite({ house: offer.house.name })
                      : m.fid_house_offer_apply({ house: offer.house.name })}
                  </span>
                  <span className="faction-muted">
                    {m.fid_house_expires({ when: dateText(offer.expiresAt) })}
                  </span>
                </span>
                <span className="fid-house-actions">
                  {offer.kind === "invite" ? (
                    <>
                      <button
                        type="button"
                        className="button-small button-primary"
                        aria-disabled={busy}
                        onClick={() => void run({ t: "house_answer", requestId: offer.id, accept: true })}
                      >
                        {m.fid_house_accept()}
                      </button>
                      <button
                        type="button"
                        className="button-small"
                        aria-disabled={busy}
                        onClick={() => void run({ t: "house_answer", requestId: offer.id, accept: false })}
                      >
                        {m.fid_house_decline()}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button-small"
                      aria-disabled={busy}
                      onClick={() => void run({ t: "house_withdraw", requestId: offer.id })}
                    >
                      {m.fid_house_withdraw()}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="fid-house-block" data-testid="house-joinable">
        <h3 className="fid-house-sub">{m.fid_house_joinable_title()}</h3>
        {view.joinable.length === 0 ? (
          <p className="faction-muted">{m.fid_house_joinable_none()}</p>
        ) : (
          <ul className="fid-house-list">
            {view.joinable.map((house) => (
              <BadgeLine key={house.factionId} house={house}>
                {applied.has(house.factionId) ? null : (
                  <button
                    type="button"
                    className="button-small"
                    aria-disabled={busy}
                    onClick={() => void run({ t: "house_apply", factionId: house.factionId })}
                  >
                    {m.fid_house_apply()}
                  </button>
                )}
              </BadgeLine>
            ))}
          </ul>
        )}
        <p className="faction-muted">{m.fid_house_apply_hint({ count: view.limits.applyMax })}</p>
      </div>
    </>
  );
}

export function HouseSection({
  view,
  onView,
  onChanged,
}: {
  view: HouseView;
  onView: (next: HouseView) => void;
  /** 명령 뒤 자료를 다시 받는다 */
  onChanged: () => void;
}) {
  const command = useHouseCommand(onChanged);
  return (
    <div className="fid-house" data-testid="house-section">
      <Notices view={view} onView={onView} />
      {view.house ? (
        <MyHouse
          house={view.house}
          home={view.home}
          limits={view.limits}
          command={command}
          onChanged={onChanged}
        />
      ) : null}
      {view.house ? null : <NoHouse view={view} command={command} />}
      {command.status ? (
        <p
          className={
            command.status.tone === "ok" ? "fid-house-status" : "fid-house-status fid-house-status-error"
          }
          role={command.status.tone === "ok" ? "status" : "alert"}
        >
          {command.status.text}
        </p>
      ) : null}
    </div>
  );
}
