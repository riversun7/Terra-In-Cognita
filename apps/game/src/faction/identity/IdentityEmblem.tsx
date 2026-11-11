// 세력 마크 한 장 — 방금 자른 새 그림(아직 올리지 않은 data: 주소)이 있으면 그것, 아니면 올린 그림(해시)이나 만든 마크.
// 그리기는 NPC 국가와 같은 부품(ui/NationEmblem.tsx)이다.
import type { NationEmblemSpec } from "@terra/shared/nationEmblem";
import { NationEmblem } from "../../ui/NationEmblem.tsx";
import { type DraftUpload, pngDataUrl } from "./identityModel.ts";

export function IdentityEmblem({
  spec,
  color,
  upload,
  size,
  label,
  className,
}: {
  spec: NationEmblemSpec;
  color: string;
  upload: DraftUpload;
  size: number;
  label?: string | undefined;
  className?: string | undefined;
}) {
  if (upload.kind === "new")
    return (
      <img
        className={`nation-emblem nation-emblem-image ${className ?? ""}`}
        src={pngDataUrl(upload.pngBase64)}
        width={size}
        height={size}
        alt={label ?? ""}
        decoding="async"
        draggable={false}
      />
    );
  return (
    <NationEmblem
      spec={spec}
      color={color}
      uploaded={upload.kind === "keep" ? upload.hash : null}
      size={size}
      label={label}
      className={className}
    />
  );
}
