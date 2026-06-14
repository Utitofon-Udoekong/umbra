import { Logo } from "./Logo";
import { WalletConnect } from "./WalletConnect";

export function Header() {
  return (
    <header className="mb-10 flex items-center justify-between border-b border-umbra-border pb-5">
      <div className="flex items-center gap-3">
        <Logo className="h-7 w-7 text-umbra-accent" />
        <span className="text-lg font-medium tracking-tight text-umbra-accent">umbra</span>
      </div>

      <nav className="hidden items-center gap-6 text-xs text-umbra-muted sm:flex">
        <span className="text-umbra-muted">base sepolia</span>
        <span className="text-umbra-muted">·</span>
        <span className="text-umbra-muted">t3 tee</span>
      </nav>

      <WalletConnect />
    </header>
  );
}
