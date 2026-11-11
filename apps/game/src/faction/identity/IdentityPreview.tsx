// "게임에서 보이는 모습" — 시작 국가 설정 편집기의 미리 보기와 같은 구성: 마크 크기 셋(24·48·128), 세력 카드 줄(마크·이름·약어 표지),
// 지도 이름표(밝은·어두운 지도 바탕). 지도 바탕 두 색과 시그니처 컬러는 그림 자료다(테마와 무관하게 나란히 보인다).
import { MAP_LABEL_DARK, MAP_LABEL_LIGHT, labelTextOn } from "@terra/shared/factionIdentity";
import { m } from "../../paraglide/messages.js";
import { IdentityEmblem } from "./IdentityEmblem.tsx";
import type { IdentityDraft } from "./identityModel.ts";

const SIZES = [24, 48, 128] as const;

export function IdentityPreview({ draft }: { draft: IdentityDraft }) {
  const name = draft.name.trim();
  const short = draft.shortName.trim();
  const shownName = name === "" ? m.fid_preview_name_empty() : name;
  const emblem = { spec: draft.emblem, color: draft.color, upload: draft.upload };
  return (
    <section className="panel fid-preview" aria-labelledby="fid-preview-title" data-testid="fid-preview">
      <h2 id="fid-preview-title" className="fid-section-title">
        {m.fid_preview_title()}
      </h2>
      <div className="fid-preview-body">
        <div className="fid-preview-sizes" role="img" aria-label={m.fid_preview_sizes()}>
          {SIZES.map((size) => (
            <IdentityEmblem key={size} {...emblem} size={size} className={`fid-emblem-${size}`} />
          ))}
        </div>
        <div className="fid-preview-rows">
          <p className="fid-preview-caption">{m.fid_preview_card()}</p>
          <p className="fid-preview-card" data-empty={name === "" ? "" : undefined}>
            <IdentityEmblem {...emblem} size={40} />
            <span className="fid-preview-name" translate="no">
              {shownName}
            </span>
            <span
              className="fid-preview-short"
              style={{ backgroundColor: draft.color, color: labelTextOn(draft.color) }}
              translate="no"
            >
              {short === "" ? m.fid_preview_short_empty() : short}
            </span>
          </p>
          <p className="fid-preview-caption">{m.fid_preview_map()}</p>
          <p className="fid-preview-maps">
            {[MAP_LABEL_LIGHT, MAP_LABEL_DARK].map((background) => (
              <span
                key={background}
                className="fid-map-label"
                style={{
                  backgroundColor: background,
                  color: background === MAP_LABEL_LIGHT ? MAP_LABEL_DARK : MAP_LABEL_LIGHT,
                }}
              >
                <IdentityEmblem {...emblem} size={16} />
                <span className="fid-map-chip" style={{ backgroundColor: draft.color }} aria-hidden="true" />
                <span translate="no">{shownName}</span>
              </span>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}
