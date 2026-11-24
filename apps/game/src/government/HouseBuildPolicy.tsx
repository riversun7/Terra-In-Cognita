// 정부 판의 [다른 가문 짓기] 칸 — 기획 D-574 2124(사용자 답 "나 — 같은 나라의 다른 가문 도시에 짓는 것은 그 도시 가문의 정책으로"). 가문 도시만
// 서버가 칸을 보낸다(GovernmentHouseEntry.build). docs/adr/2026-11-11-faction-identity.md "바뀜 (house-8, D-574)".
// - 모두에게: 지금 값(허용·막음, 정하지 않으면 기본값과 "기본값" 덧말). 자기 가문은 늘 짓는다는 안내.
// - 그 도시를 가진 가문의 가문장(canSetCity): [허용]·[막음]·[비우기](기본값을 따름) → WebSocket house_build_policy(프로토콜 54).
import type { GovernmentHouseEntry } from "@terra/shared/government";
import { useId, useState } from "react";
import { sendHouseMember } from "../faction/identity/houseCommands.ts";
import { HOUSE_MEMBER_ERROR_TEXT } from "../faction/identity/houseText.ts";
import { m } from "../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";

type Build = NonNullable<GovernmentHouseEntry["build"]>;
type ForeignBuild = NonNullable<GovernmentHouseEntry["foreignBuild"]>;

/** 정책 값 → 문장(정하지 않았으면 기본값 + 덧말) */
export function buildPolicyText(build: {
  readonly city: boolean | null;
  readonly fallback: boolean;
}): string {
  const allow = build.city ?? build.fallback;
  const value = allow ? m.government_build_allow() : m.government_build_deny();
  return build.city === null ? m.government_build_default({ value }) : value;
}

export function HouseBuildPolicy({
  cityId,
  build,
  canSet,
  foreignBuild,
}: {
  cityId: number;
  build?: Build | undefined;
  canSet: boolean;
  foreignBuild?: ForeignBuild | undefined;
}) {
  const titleId = useId();
  const [shown, setShown] = useState(build);
  const [shownForeign, setShownForeign] = useState(foreignBuild);
  const [busy, setBusy] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();
  const saveHouseBuild = async (allow: boolean | null): Promise<void> => {
    if (busy) return;
    setBusy(true);
    notice.clear();
    problem.clear();
    try {
      const outcome = await sendHouseMember({ t: "house_build_policy", cityId, allow });
      if (outcome.ok) {
        notice.show([m.fid_house_done_build_policy()]);
        setShown((before) => (before ? { ...before, city: allow } : before));
      } else problem.show([HOUSE_MEMBER_ERROR_TEXT[outcome.code]()]);
    } finally {
      setBusy(false);
    }
  };
  const saveForeignBuild = async (allow: boolean | null): Promise<void> => {
    if (busy) return;
    setBusy(true);
    notice.clear();
    problem.clear();
    try {
      const outcome = await sendHouseMember({ t: "house_foreign_build_policy", cityId, allow });
      if (outcome.ok) {
        notice.show([m.fid_house_done_foreign_build_policy()]);
        setShownForeign((before) => (before ? { ...before, city: allow } : before));
      } else problem.show([HOUSE_MEMBER_ERROR_TEXT[outcome.code]()]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="gov-section gov-band" aria-labelledby={titleId} data-part="government-house-build">
      <h3 id={titleId} className="gov-section-title">
        {shown ? m.government_build_section_title() : m.government_foreign_build_label()}
      </h3>
      {shown ? <p className="gov-muted">{m.government_build_hint()}</p> : null}
      {shownForeign ? <p className="gov-muted">{m.government_foreign_build_hint()}</p> : null}
      <dl className="gov-facts">
        {shown ? (
          <div className="gov-fact gov-entry-row">
            <dt>{m.government_build_title()}</dt>
            <dd>
              <span data-part="government-build-value">{buildPolicyText(shown)}</span>
              {canSet ? (
                <span className="gov-entry-edit">
                  <button
                    type="button"
                    className="button-small"
                    disabled={busy}
                    onClick={() => void saveHouseBuild(true)}
                  >
                    {m.government_build_allow()}
                  </button>
                  <button
                    type="button"
                    className="button-small"
                    disabled={busy}
                    onClick={() => void saveHouseBuild(false)}
                  >
                    {m.government_build_deny()}
                  </button>
                  <button
                    type="button"
                    className="button-small"
                    disabled={busy}
                    onClick={() => void saveHouseBuild(null)}
                  >
                    {m.government_entry_clear()}
                  </button>
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
        {shownForeign ? (
          <div className="gov-fact gov-entry-row">
            <dt>{m.government_foreign_build_label()}</dt>
            <dd>
              <span data-part="government-foreign-build-value">{buildPolicyText(shownForeign)}</span>
              {shownForeign.canSet ? (
                <span className="gov-entry-edit">
                  <button
                    type="button"
                    className="button-small"
                    disabled={busy}
                    onClick={() => void saveForeignBuild(true)}
                  >
                    {m.government_build_allow()}
                  </button>
                  <button
                    type="button"
                    className="button-small"
                    disabled={busy}
                    onClick={() => void saveForeignBuild(false)}
                  >
                    {m.government_build_deny()}
                  </button>
                  <button
                    type="button"
                    className="button-small"
                    disabled={busy}
                    onClick={() => void saveForeignBuild(null)}
                  >
                    {m.government_entry_clear()}
                  </button>
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
    </section>
  );
}
