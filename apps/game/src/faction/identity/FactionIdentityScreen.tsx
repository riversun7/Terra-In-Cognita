// 내 세력 정체성 정하기·고치기(/faction/identity) — 지연 로딩 조각(default export, shell/routeViews.tsx).
// 사용자 결정(2026-11-11): 플레이어도 NPC 세력처럼 세력을 만들 때 같은 과정(이름·약어·색·마크)을 거친다. 지금 플레이어가 이끄는 세력은
// 자기 소유 주체뿐이라(세력 창설 규칙이 아직 없다 — 질문 926) 이 화면이 그 과정이다. 창설 흐름이 생기면 IdentityStep을 그 안에 넣는다.
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
          {mine?.identity ? m.fid_title_edit() : m.fid_title_create()}
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
          // 저장할 때마다 새 초안으로 다시 시작한다
          key={mine.identity?.updatedAt ?? 0}
          mine={mine}
          onSaved={(next) => {
            setSaved(next);
            goBack();
          }}
          onCancel={goBack}
        />
      )}
    </section>
  );
}
