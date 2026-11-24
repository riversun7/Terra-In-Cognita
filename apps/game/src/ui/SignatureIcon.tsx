// 메뉴·시스템·2차맵·상태 요약용 전용 컬러 게임 아이콘(apps/game/public/icons/nav/*.png).
// 다크·라이트·네온 테마 어디서나 색과 실루엣이 즉시 구분되도록 어두운 외곽선과 고유 팔레트를 가진 96×96 투명 PNG를 쓴다.
export type SignatureIconName =
  | "home"
  | "map"
  | "globe"
  | "units"
  | "economy"
  | "faction"
  | "cyborg"
  | "inventory"
  | "city"
  | "nearby"
  | "inbox"
  | "mail"
  | "edit"
  | "settings"
  | "dev"
  | "admin"
  | "ops"
  | "logout"
  | "chat"
  | "credit"
  | "facility";

export function SignatureIcon({
  name,
  className,
}: {
  readonly name: SignatureIconName;
  readonly className?: string;
}) {
  return (
    <img
      src={`/icons/nav/${name}.png`}
      alt=""
      width={96}
      height={96}
      aria-hidden="true"
      decoding="async"
      draggable={false}
      className={className ? `sig-icon ${className}` : "sig-icon"}
    />
  );
}
