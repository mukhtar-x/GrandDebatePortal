import Image from "next/image";
import Link from "next/link";
import { SiteNavigation } from "@/components/shared/site-navigation";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" href="/" aria-label="The Grand Debate home">
          <Image
            className="brand-mark"
            src="/assets/01_Logo/tgd_logo_gold_transparent_300px.png"
            alt=""
            width={300}
            height={218}
            priority
          />
          <span className="brand-copy">
            <span className="brand-title">The Grand Debate</span>
            <span className="brand-edition">16th Edition · FAST-NUCES Karachi</span>
          </span>
        </Link>

        <SiteNavigation />
      </div>
    </header>
  );
}
