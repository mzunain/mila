import Image from "next/image";

interface BrandLogoProps {
  compact?: boolean;
}

export function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <div className="flex items-center gap-3">
      <Image src="/mila-mark.svg" alt="Mila" width={36} height={36} priority />
      {!compact && (
        <div className="leading-none">
          <div className="text-[1.05rem] font-semibold tracking-normal text-[var(--foreground)]">
            Mila
          </div>
          <div className="mila-muted mt-1 text-xs font-medium">
            Multilingual meeting memory
          </div>
        </div>
      )}
    </div>
  );
}
