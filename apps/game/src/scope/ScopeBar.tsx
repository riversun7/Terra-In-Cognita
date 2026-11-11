// 범위 줄 — 개발·운영 화면 머리에 "이 화면에서 바꾼 것이 어디에 반영되는가"를 보인다(docs/adr/2026-11-11-planet-scope.md 3절).
// 사용자 요청(2026-11-11): "행성을 선택이 필요한 에디터에 행성 선택하는 기능이 없어 어디에만 반영되는지 확인 불가."
// - 모든 행성 공통(규칙·수치): 고정 표지 + 한 줄 풀이(이 세계의 덮어쓰기, 플레이 행성 모두에 같다).
// - 행성 하나: 행성 고르기(상태 표지: 공개 행성·편집 전용, D-530 945 다) — 고른 값은 주소 ?planet=과 계정 기억에 남는다(planetScopeStore.ts).
// - 보관함·항성계·행성과 무관: 고정 표지 + 풀이.
// 틀이 보이는 개발·운영 화면은 주소 → 화면 표(shell/routeViews.tsx)가 화면 위에 그린다(편집기마다 고칠 것이 없다).
// 틀을 숨긴 화면(행성 편집기·항성계·2차맵 시험·전투 다시보기)은 자기 머리에 <ScopeBar route="…" inline />을 둔다.
import type { RouteId } from "@terra/shared";
import { ALL_PLANETS, type PlanetScopeEntry, type PlanetScopeStatus } from "@terra/shared/planetScope";
import { useEffect, useId, useRef } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { useRoute } from "../shell/routerStore.ts";
import {
  type PlanetScope,
  adoptPlanetFromUrl,
  reloadPlanetScope,
  usePlanetScope,
  writePlanetUrl,
} from "./planetScopeStore.ts";
import { type PlanetGroup, type ScopeKind, routeScope } from "./scopeRoutes.ts";
import "./scope.css";

const STATUS_TEXT: { readonly [S in PlanetScopeStatus]: () => string } = {
  playable: m.scope_status_playable,
  editor: m.scope_status_editor,
  library: m.scope_status_library,
};

const KIND_TEXT: { readonly [K in Exclude<ScopeKind, "planet">]: () => string } = {
  common: m.scope_chip_common,
  library: m.scope_chip_library,
  system: m.scope_chip_system,
  none: m.scope_chip_none,
};

/** 행성 이름(화면 언어) */
export function planetLabel(planet: Pick<PlanetScopeEntry, "id" | "name">): string {
  return (getLocale() === "en" ? planet.name.en : planet.name.ko) || planet.id;
}

/** 상태 표지(공개 행성·편집 전용·보관함) */
export function PlanetStatusChip({ status }: { status: PlanetScopeStatus }) {
  return (
    <span className="scope-chip scope-status" data-status={status}>
      {STATUS_TEXT[status]()}
    </span>
  );
}

/** 플레이 행성 이름 목록("S2 시험 행성" 또는 "지구, 화성") */
function playableNames(scope: PlanetScope): string {
  return scope.playable.map(planetLabel).join(", ");
}

function PlanetPicker({ scope, labelId }: { scope: PlanetScope; labelId: string }) {
  if (scope.status === "failed")
    return (
      <span className="scope-failed" role="alert">
        {m.scope_load_failed()}{" "}
        <button type="button" className="button-small" onClick={reloadPlanetScope}>
          {m.retry()}
        </button>
      </span>
    );
  if (scope.selected === null)
    return (
      <span className="dev-muted" role="status">
        {m.scope_loading()}
      </span>
    );
  return (
    <>
      <select
        className="scope-select"
        aria-labelledby={labelId}
        value={scope.selected}
        onChange={(event) => scope.select(event.target.value)}
      >
        {scope.allowAll ? <option value={ALL_PLANETS}>{m.scope_all_planets()}</option> : null}
        {scope.planets.map((planet) => (
          <option key={planet.id} value={planet.id}>
            {m.scope_option({ name: planetLabel(planet), status: STATUS_TEXT[planet.status]() })}
          </option>
        ))}
      </select>
      {scope.planet ? (
        <>
          <PlanetStatusChip status={scope.planet.status} />
          <code className="scope-id" translate="no">
            {scope.planet.id}
          </code>
        </>
      ) : (
        <span className="scope-chip" data-kind="all">
          {m.scope_all_count({ count: scope.playable.length })}
        </span>
      )}
    </>
  );
}

/**
 * 주소 ?planet=과 고른 행성을 맞춘다. 처음(주소로 바로 연 화면·뒤로/앞으로): 주소에 값이 있으면 그것을 고른 값으로 삼는다.
 * 그 뒤(고르기를 바꿈·목록을 받음·주소 값이 고를 수 없는 행성이었음): 고른 값을 주소에 적는다.
 * 라우터 주소가 바뀌면(key — 화면이 검색어를 갈아 끼움, 같은 화면의 다른 기록 칸) 새로 만들어져 처음부터 다시 한다
 */
function PlanetUrlSync({ group, selected }: { group: PlanetGroup; selected: string | null }) {
  const adopted = useRef(false);
  useEffect(() => {
    if (!adopted.current) {
      adopted.current = true;
      // 주소 값을 삼았으면 저장소가 바뀌어 다시 그려진다 → 그때 아래에서 주소를 맞춘다(같으면 아무것도 하지 않는다)
      if (adoptPlanetFromUrl(group) && selected === null) return;
    }
    if (selected !== null) writePlanetUrl(selected);
  }, [group, selected]);
  return null;
}

function PlanetBar({
  group,
  note,
  inline,
  routeId,
}: {
  group: PlanetGroup;
  note: string;
  inline: boolean;
  routeId: RouteId;
}) {
  const labelId = useId();
  const scope = usePlanetScope(group);
  // 라우터 주소: 화면이 검색어를 갈아 끼우면(예: 구인 시험의 ?city=) ?planet=을 다시 적는다
  const routerUrl = useRoute().url;
  return (
    <div
      className={inline ? "scope-bar scope-bar-inline" : "scope-bar"}
      role="group"
      aria-labelledby={labelId}
      data-scope="planet"
      data-route={routeId}
      data-planet={scope.selected ?? ""}
    >
      <PlanetUrlSync key={routerUrl} group={group} selected={scope.selected} />
      <span id={labelId} className="scope-label">
        {m.scope_label()}
      </span>
      <PlanetPicker scope={scope} labelId={labelId} />
      <span className="scope-note">{note}</span>
    </div>
  );
}

function FixedBar({
  kind,
  note,
  inline,
  routeId,
}: {
  kind: Exclude<ScopeKind, "planet">;
  note: string;
  inline: boolean;
  routeId: RouteId;
}) {
  const labelId = useId();
  // 풀이에 지금 플레이 행성 이름을 붙인다(공통 = 이 행성들 모두, 보관함 = 이 행성은 바뀌지 않음)
  const scope = usePlanetScope("edit");
  const names = playableNames(scope);
  const tail =
    names === ""
      ? null
      : kind === "common"
        ? m.scope_tail_common({ count: scope.playable.length, names })
        : kind === "library" || kind === "system"
          ? m.scope_tail_untouched({ names })
          : null;
  return (
    <div
      className={inline ? "scope-bar scope-bar-inline" : "scope-bar"}
      role="group"
      aria-labelledby={labelId}
      data-scope={kind}
      data-route={routeId}
    >
      <span id={labelId} className="scope-label">
        {m.scope_label()}
      </span>
      <span className="scope-chip" data-kind={kind}>
        {KIND_TEXT[kind]()}
      </span>
      <span className="scope-note">
        {note}
        {tail ? <span className="scope-tail"> {tail}</span> : null}
      </span>
    </div>
  );
}

/** 그 화면의 범위 줄. 범위가 없는 화면(개발자 홈·게임 화면)은 아무것도 그리지 않는다 */
export default function ScopeBar({ route, inline = false }: { route: RouteId; inline?: boolean }) {
  const scope = routeScope(route);
  if (scope === null) return null;
  if (scope.kind === "planet")
    return <PlanetBar group={scope.group ?? "edit"} note={scope.note()} inline={inline} routeId={route} />;
  return <FixedBar kind={scope.kind} note={scope.note()} inline={inline} routeId={route} />;
}

/**
 * 담은 변경 막대의 "적용 대상" 한 줄. planet을 주면 그 행성, 아니면 모든 행성 공통(팩 덮어쓰기·설정 칸 편집기)
 */
export function ScopeTarget({ planet }: { planet?: Pick<PlanetScopeEntry, "id" | "name"> | null }) {
  return (
    <span className="scope-target" data-target={planet ? planet.id : "common"}>
      {m.scope_target({ target: planet ? planetLabel(planet) : m.scope_chip_common() })}
    </span>
  );
}
