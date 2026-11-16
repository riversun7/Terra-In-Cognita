// 국가 편집기 성향 칸 — 기획 D-573 1991(사용자 답 "나" — "국가 편집기에 성향 칸, 비어 있으면 무작위"). 세력 성향 4축(공격·상업·신앙·정거장 태도 0~1000,
// D-327)과 지도자 기질(−1000~1000‰ — 설정 칸 npc_gather_tier_leader 폭 안 위치). 비운 칸은 서버가 (세계 시드, 세력)으로 굴린다. 채집 티어 성향·도시 성장
// 성향·NPC 판단이 읽는다(서버 npc/presetTemper.ts, @terra/sim leaderTemperOf). 바꾼 값은 서버를 다시 켤 때부터 든다.
import type { NationPresetJson, NationTemperJson } from "@terra/shared/nationEditor";
import { setTemper } from "./nationModel.ts";
import { m } from "../../paraglide/messages.js";
import { NumberField } from "../content/contentEditorFields.tsx";
import { FormSection } from "../content/contentEditorLayout.tsx";

type TemperKey = keyof NationTemperJson;

export function NationTemperSection({
  title,
  draft,
  onEdit,
}: {
  readonly title: string;
  readonly draft: NationPresetJson;
  readonly onEdit: (next: NationPresetJson) => void;
}) {
  const axes: readonly { key: TemperKey; label: string }[] = [
    { key: "aggression", label: m.dev_nations_temper_aggression() },
    { key: "commerce", label: m.dev_nations_temper_commerce() },
    { key: "faith", label: m.dev_nations_temper_faith() },
    { key: "station", label: m.dev_nations_temper_station() },
  ];
  return (
    <FormSection
      name="temper"
      title={title}
      desc={m.dev_nations_section_temper_desc()}
      source="D-573 1991 · D-327 · D-554"
      paths={["temper"]}
    >
      <div className="ne-grid">
        {axes.map((axis) => (
          <NumberField
            key={axis.key}
            label={axis.label}
            value={draft.temper?.[axis.key]}
            min={0}
            max={1000}
            optional
            onChange={(value) => onEdit(setTemper(draft, axis.key, value))}
            hint={m.dev_nations_temper_random()}
            path={`temper.${axis.key}`}
          />
        ))}
        <NumberField
          label={m.dev_nations_temper_leader()}
          value={draft.temper?.leader}
          min={-1000}
          max={1000}
          unit="‰"
          optional
          onChange={(value) => onEdit(setTemper(draft, "leader", value))}
          hint={m.dev_nations_temper_random()}
          desc={m.dev_nations_temper_leader_desc()}
          path="temper.leader"
        />
      </div>
    </FormSection>
  );
}
