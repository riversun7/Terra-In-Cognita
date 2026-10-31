// 고른 궤도의 카드 — 천체 이름, 거리·받는 빛, 생명 가능 지대에서 어디인지. 보관함 행성이면 제안 기온과 [제안 적용]·
// [행성 편집기에서 열기]. ADR 2026-10-31-star-system-editor.
// - 제안 = @terra/shared suggestTemperatures(빛 세기, 지구 기준). 화면 효과 없음(게임 실행에 쓰지 않는다).
// - [제안 적용]은 이 기기의 작업 사본만 바꾼다(applySuggestion). 서버 행성은 행성 편집기에서 [저장]할 때만 바뀐다.
// - 지금 기온은 작업 사본이 있으면 그 값, 없으면 서버 정의 값(행성 편집기가 여는 값과 같다).
import { type StarSystemOrbit, starType, stellarFlux, suggestTemperatures, zoneOf } from "@terra/shared";
import { useEffect, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { entrySettings } from "../planet/editorModel.ts";
import { type LibraryPlanet, libraryApi, libraryFailure } from "../planet/libraryClient.ts";
import type { WorkingCopyStore } from "../planet/workingCopy.ts";
import { EARTH_REFERENCE } from "./applySuggestion.ts";
import { bodyKindText, failureText, formatFlux, signed } from "./systemMessages.ts";
import { formatAu } from "./systemEdit.ts";

const ZONE_TEXT = {
  hot: m.star_system_zone_hot,
  habitable: m.star_system_zone_habitable,
  cold: m.star_system_zone_cold,
} as const;

type PlanetLoad =
  | { readonly kind: "loading"; readonly id: string }
  | { readonly kind: "ready"; readonly id: string; readonly planet: LibraryPlanet }
  | { readonly kind: "failed"; readonly id: string; readonly message: string };

export interface OrbitCardProps {
  readonly orbit: StarSystemOrbit;
  readonly index: number;
  readonly starTypeId: string;
  /** 보관함 행성 이름(목록에 없으면 null = 지운 행성) */
  readonly planetName: string | null;
  readonly store: WorkingCopyStore;
  readonly onApply: (
    planet: LibraryPlanet,
    target: { equatorTemperatureC: number; poleTemperatureC: number },
  ) => void;
  readonly onOpenPlanet: (planetId: string) => void;
  readonly onClose: () => void;
}

export function OrbitCard(props: OrbitCardProps) {
  const { orbit, index } = props;
  const luminosity = starType(props.starTypeId)?.luminosity ?? 1;
  const distanceAu = orbit.distanceMilliAu / 1000;
  const flux = stellarFlux(luminosity, distanceAu);
  const zone = zoneOf(luminosity, distanceAu);
  const planetId = orbit.body.kind === "planet" ? orbit.body.planetId : null;
  const title =
    orbit.body.kind === "planet"
      ? (props.planetName ?? m.star_system_planet_missing())
      : bodyKindText(orbit.body.kind);
  return (
    <section className="ss-card" aria-labelledby="ss-card-title" data-zone={zone}>
      <div className="ss-card-head">
        <h2 id="ss-card-title" className="ss-card-title">
          <span className="ss-card-kicker">{m.star_system_orbit_title({ number: String(index + 1) })}</span>
          {title}
        </h2>
        <button type="button" className="button-small" onClick={props.onClose}>
          {m.star_system_card_close()}
        </button>
      </div>
      <p className="ss-card-zone">{ZONE_TEXT[zone]()}</p>
      <p className="field-hint">
        {m.star_system_card_distance({ distance: formatAu(orbit.distanceMilliAu), flux: formatFlux(flux) })}
      </p>
      {planetId !== null && props.planetName !== null ? (
        <PlanetSuggestion key={planetId} planetId={planetId} flux={flux} {...props} />
      ) : null}
    </section>
  );
}

function PlanetSuggestion({
  planetId,
  flux,
  store,
  onApply,
  onOpenPlanet,
}: OrbitCardProps & { planetId: string; flux: number }) {
  const [load, setLoad] = useState<PlanetLoad>({ kind: "loading", id: planetId });
  /** 작업 사본이 바뀐 차례(적용한 뒤 지금 기온을 다시 읽게) */
  const [copyVersion, setCopyVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    libraryApi.get(planetId).then(
      (planet) => {
        if (!cancelled) setLoad({ kind: "ready", id: planetId, planet });
      },
      (error: unknown) => {
        if (!cancelled)
          setLoad({ kind: "failed", id: planetId, message: failureText(libraryFailure(error)) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [planetId]);

  const suggestion = suggestTemperatures(flux, EARTH_REFERENCE);
  const copy = copyVersion >= 0 ? store.read(planetId) : null;
  const current = (() => {
    if (load.kind !== "ready") return null;
    try {
      return entrySettings(copy?.entry ?? load.planet.definition);
    } catch {
      return null;
    }
  })();
  return (
    <div className="ss-suggest">
      <h3 className="ss-suggest-title">{m.star_system_card_suggest()}</h3>
      <p className="ss-suggest-temps" data-testid="ss-suggest-temps">
        {m.star_system_card_temps({
          equator: String(suggestion.equatorTemperatureC),
          pole: String(suggestion.poleTemperatureC),
        })}
      </p>
      <p className="field-hint">
        {m.star_system_card_offset({
          offset: signed(suggestion.offsetC),
          equator: String(EARTH_REFERENCE.equatorTemperatureC),
          pole: String(EARTH_REFERENCE.poleTemperatureC),
        })}
      </p>
      {current ? (
        <p className="field-hint">
          {m.star_system_card_current({
            equator: String(current.equatorTemperatureC),
            pole: String(current.poleTemperatureC),
          })}
        </p>
      ) : null}
      {load.kind === "failed" ? (
        <p className="field-hint ss-error" role="status">
          {m.star_system_card_failed({ reason: load.message })}
        </p>
      ) : null}
      <p className="field-hint">{m.star_system_card_note()}</p>
      <div className="form-actions ss-card-actions">
        <button type="button" onClick={() => onOpenPlanet(planetId)}>
          {m.star_system_card_open()}
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={load.kind !== "ready"}
          onClick={() => {
            if (load.kind !== "ready") return;
            onApply(load.planet, suggestion);
            setCopyVersion((count) => count + 1);
          }}
        >
          {m.star_system_card_apply()}
        </button>
      </div>
    </div>
  );
}
