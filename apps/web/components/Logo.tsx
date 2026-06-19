import Image from "next/image";

export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <Image
      src="/umbra-logo.png"
      alt="Umbra"
      width={480}
      height={480}
      className={className}
      priority
    />
  );
}
