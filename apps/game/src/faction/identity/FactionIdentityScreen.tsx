// 가문 창설·내 가문 정체성 고치기(/faction/identity) — 지연 로딩 조각(default export, shell/routeViews.tsx).
// 사용자 결정(2026-11-11): 플레이어도 NPC 세력처럼 세력을 만들 때 같은 과정(이름·약어·색·마크)을 거친다. 질문 926 나: 정체성을 정하는 것이
// 곧 가문 창설이다 — 이 화면의 마지막 단추가 [가문 창설](IdentityStep), 창설한 뒤에는 같은 화면에서 고친다.
// docs/adr/2026-11-11-faction-identity.md
import type { FactionIdentityMine } from "@terra/shared/factionIdentity";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { QueryFailure } from "../../sections/screenParts.tsx";
import { useScreenQuery } from "../../sections/useScreenQuery.ts";
import { BackButton } from "../../shell/BackButton.tsx";
import { goBack } from "../../shell/routerStore.ts";
import { IdentityStep } from "./IdentityStep.tsx";
import { loadIdentityMine } from "./identityQueries.ts";
import "../../sections/screenParts.css";
import "./identity.css";

export default function FactionIdentityScreen() {
  const { state, refresh } = useScreenQuery(loadIdentityMine);
  // 저장한 뒤의 값(조회를 다시 기다리지 않고 바로 쓴다)
  const [saved, setSaved] = useState<FactionIdentityMine | null>(null);
  const mine = saved ?? state.data;
  return (
    <section className="screen fid" aria-labelledby="fid-title">
      <div className="screen-header">
        <h1 id="fid-title" className="screen-title" tabIndex={-1}>
          {mine?.house ? m.fid_title_edit() : m.fid_title_create()}
        </h1>
        <BackButton />
      </div>
      <QueryFailure
        error={state.status === "failed" ? state.error : null}
        title={m.faction_identity_load_failed()}
        onRetry={refresh}
      />
      {mine === null ? (
        state.status === "failed" ? null : (
          <p className="status" role="status">
            {m.faction_identity_loading()}
          </p>
        )
      ) : (
        <IdentityStep
          // 창설하면 새 초안으로 다시 시작한다(초안만 저장하고 창설이 실패한 때는 고치던 값·알림을 그대로 둔다)
          key={mine.house?.factionId ?? 0}
          mine={mine}
          onSaved={(next) => {
            setSaved(next);
            goBack();
          }}
          onDraftSaved={setSaved}
          onCancel={goBack}
        />
      )}
    </section>
  );
}
