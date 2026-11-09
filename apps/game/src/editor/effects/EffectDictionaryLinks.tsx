// 효과 사전으로 가는 고리(아이템·스킬 편집기의 효과 고르기 옆) — docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-09)"(사용자 결정 B).
// 효과 줄마다 [효과 사전에서 열기](/dev/effects?effect=<ID>), 줄 묶음 아래 [새 효과 만들기](/dev/effects?create=1)와 안내 한 줄.
// 두 편집기 조각이 같이 쓰므로 따로 조각이 될 수 있다: 파일 이름 앞머리를 미리 캐시 규칙([Ee]ffectDictionary)에 맞춘다(scripts/pwa-build.mjs).
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import "./effectDictionaryLinks.css";

/** 효과 줄 하나: 그 효과를 효과 사전에서 연다 */
export function EffectDictionaryOpenLink({ effect, name }: { effect: string; name: string }) {
  return (
    <AppLink
      className="fx-dict-link"
      data-effect-link={effect}
      aria-label={m.dev_effects_open_in_dictionary_named({ name })}
      to={{ route: "dev_effects", search: { effect } }}
    >
      {m.dev_effects_open_in_dictionary()}
    </AppLink>
  );
}

/** 효과 줄 묶음 아래: 새 효과 만들기(효과 사전의 새 효과 칸) + 옮기면 담은 변경이 남지 않는다는 안내 */
export function EffectDictionaryFooter() {
  return (
    <p className="fx-dict-footer">
      <AppLink className="fx-dict-link fx-dict-create" to={{ route: "dev_effects", search: { create: "1" } }}>
        {m.dev_effects_create_link()}
      </AppLink>
      <span className="field-hint">{m.dev_effects_link_hint()}</span>
    </p>
  );
}
