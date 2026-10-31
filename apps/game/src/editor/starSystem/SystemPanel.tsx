// 항성계 판 — 항성 종류 고르기와 궤도 목록(더하기·거리·천체·빼기). ADR 2026-10-31-star-system-editor.
// - 궤도 줄을 누르면 그 궤도를 고른다(그림의 천체를 누른 것과 같다). 고른 줄만 고치는 칸을 편다(휴대폰에서 목록이 짧게).
// - 거리 칸은 다 적은 뒤(Enter·칸 떠남) 바꾼다. 범위 밖·다른 궤도와 같은 거리면 바꾸지 않고 원래 값으로 돌린다.
// - 천체를 "보관함 행성"으로 바꾸면 목록 첫 행성을 놓는다. 보관함이 비면 그 선택지는 막힌다.
import {
  STAR_SYSTEM_BODY_KINDS,
  STAR_SYSTEM_DISTANCE_RANGE,
  STAR_SYSTEM_MAX_ORBITS,
  STAR_TYPES,
  type StarSystemBody,
  type StarSystemBodyKind,
  type StarSystemDefinition,
  type StarTypeId,
  habitableZone,
  starType,
} from "@terra/shared";
import { type KeyboardEvent, useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import type { LibrarySummary } from "../planet/libraryClient.ts";
import { formatAu, parseAu } from "./systemEdit.ts";
import { bodyKindText, formatLuminosity, formatValue, starTypeName } from "./systemMessages.ts";

export interface SystemPanelProps {
  readonly definition: StarSystemDefinition;
  readonly library: readonly LibrarySummary[];
  readonly selected: number | null;
  readonly orbitLabel: (index: number) => string;
  readonly onSelect: (index: number) => void;
  readonly onStarType: (type: StarTypeId) => void;
  readonly onAddOrbit: () => void;
  /** 바꿨으면 true(맞지 않는 거리면 false) */
  readonly onDistance: (index: number, distanceMilliAu: number) => boolean;
  readonly onBody: (index: number, body: StarSystemBody) => void;
  readonly onRemoveOrbit: (index: number) => void;
}

function isStarTypeId(value: string): value is StarTypeId {
  return STAR_TYPES.some((type) => type.id === value);
}

function isBodyKind(value: string): value is StarSystemBodyKind {
  const kinds: readonly string[] = STAR_SYSTEM_BODY_KINDS;
  return kinds.includes(value);
}

export function SystemPanel(props: SystemPanelProps) {
  const id = useId();
  const star = starType(props.definition.star.type);
  const zone = habitableZone(star?.luminosity ?? 1);
  const full = props.definition.orbits.length >= STAR_SYSTEM_MAX_ORBITS;
  return (
    <div className="ss-panel-body">
      <section className="ss-section" aria-labelledby={`${id}-star`}>
        <h2 id={`${id}-star`} className="ss-section-title">
          {m.star_system_star()}
        </h2>
        <label className="field-label" htmlFor={`${id}-type`}>
          {m.star_system_star_type()}
        </label>
        <select
          id={`${id}-type`}
          className="ss-star-select"
          value={props.definition.star.type}
          onChange={(event) => {
            if (isStarTypeId(event.target.value)) props.onStarType(event.target.value);
          }}
        >
          {STAR_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {starTypeName(type.id)}
            </option>
          ))}
        </select>
        <p className="field-hint">
          {m.star_system_star_facts({
            luminosity: formatLuminosity(star?.luminosity ?? 1),
            inner: formatValue(zone.inner, 2),
            outer: formatValue(zone.outer, 2),
          })}
        </p>
        <p className="field-hint">{m.star_system_hz_legend()}</p>
      </section>
      <section className="ss-section" aria-labelledby={`${id}-orbits`}>
        <h2 id={`${id}-orbits`} className="ss-section-title">
          {m.star_system_orbits()}
        </h2>
        {props.definition.orbits.length === 0 ? (
          <p className="field-hint">{m.star_system_orbits_empty()}</p>
        ) : (
          <ol className="ss-orbits">
            {props.definition.orbits.map((orbit, index) => (
              // 줄은 차례로 둔다(거리를 바꿔도 칸이 다시 만들어지지 않게). 고치는 칸은 거리로 새로 만든다(글을 맞춘다)
              <li
                key={`orbit-${index}`}
                className="ss-orbit"
                data-selected={props.selected === index ? "" : undefined}
              >
                <button
                  type="button"
                  className="ss-orbit-pick"
                  aria-pressed={props.selected === index}
                  onClick={() => props.onSelect(index)}
                >
                  {props.orbitLabel(index)}
                </button>
                {props.selected === index ? (
                  <OrbitFields key={orbit.distanceMilliAu} index={index} {...props} />
                ) : null}
              </li>
            ))}
          </ol>
        )}
        <div className="form-actions">
          <button type="button" className="ss-add-orbit" disabled={full} onClick={props.onAddOrbit}>
            {m.star_system_add_orbit()}
          </button>
        </div>
        {full ? (
          <p className="field-hint">{m.star_system_orbits_full({ max: String(STAR_SYSTEM_MAX_ORBITS) })}</p>
        ) : null}
      </section>
    </div>
  );
}

function OrbitFields({ index, ...props }: SystemPanelProps & { index: number }) {
  const id = useId();
  const orbit = props.definition.orbits[index];
  const [text, setText] = useState(orbit ? formatAu(orbit.distanceMilliAu) : "");
  if (!orbit) return null;
  const [min, max] = STAR_SYSTEM_DISTANCE_RANGE;
  const commit = (): void => {
    const milli = parseAu(text);
    if (milli === null || milli === orbit.distanceMilliAu || !props.onDistance(index, milli)) {
      setText(formatAu(orbit.distanceMilliAu));
    }
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  };
  const firstPlanet = props.library[0];
  const planetId = orbit.body.kind === "planet" ? orbit.body.planetId : null;
  const missing = planetId !== null && !props.library.some((item) => item.id === planetId);
  return (
    <div className="ss-orbit-fields">
      <div className="ss-field">
        <label className="field-label" htmlFor={`${id}-distance`}>
          {m.star_system_distance()}
        </label>
        <input
          id={`${id}-distance`}
          className="input ss-distance"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-describedby={`${id}-distance-hint`}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
        />
        <p id={`${id}-distance-hint`} className="field-hint">
          {m.star_system_distance_hint({ min: formatAu(min), max: formatAu(max) })}
        </p>
      </div>
      <div className="ss-field">
        <label className="field-label" htmlFor={`${id}-kind`}>
          {m.star_system_body()}
        </label>
        <select
          id={`${id}-kind`}
          className="ss-kind"
          value={orbit.body.kind}
          onChange={(event) => {
            const kind = event.target.value;
            if (!isBodyKind(kind)) return;
            if (kind === "planet") {
              if (firstPlanet) props.onBody(index, { kind, planetId: firstPlanet.id });
            } else props.onBody(index, { kind });
          }}
        >
          {STAR_SYSTEM_BODY_KINDS.map((kind) => (
            <option key={kind} value={kind} disabled={kind === "planet" && !firstPlanet}>
              {bodyKindText(kind)}
            </option>
          ))}
        </select>
        {!firstPlanet ? <p className="field-hint">{m.star_system_library_empty()}</p> : null}
      </div>
      {planetId !== null ? (
        <div className="ss-field">
          <label className="field-label" htmlFor={`${id}-planet`}>
            {m.star_system_planet()}
          </label>
          <select
            id={`${id}-planet`}
            className="ss-planet"
            value={planetId}
            onChange={(event) => props.onBody(index, { kind: "planet", planetId: event.target.value })}
          >
            {missing ? <option value={planetId}>{m.star_system_planet_missing()}</option> : null}
            {props.library.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="form-actions">
        <button
          type="button"
          className="button-small ss-remove-orbit"
          onClick={() => props.onRemoveOrbit(index)}
        >
          {m.star_system_remove_orbit()}
        </button>
      </div>
    </div>
  );
}
