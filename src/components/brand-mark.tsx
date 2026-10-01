import Image from "next/image";

export function BrandMark({ size = 42, priority = false }: { size?: number; priority?: boolean }) {
  return (
    <Image
      src="/logo-compta-sycebnl.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      priority={priority}
      className="brand-mark-image"
      style={{ width: size, height: size }}
    />
  );
}
