import Link from "next/link";
import { EVENT_DETAILS } from "@/data/event";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <span className="footer-kicker">The Grand Debate &apos;26</span>
          <p>Three days of debate, diplomacy and dialogue.</p>
          <p className="footer-organizer">{EVENT_DETAILS.organizer}</p>
        </div>
        <div className="footer-contact">
          <span className="footer-kicker">Get in touch</span>
          <a href="mailto:tlc.khi@nu.edu.pk">tlc.khi@nu.edu.pk</a>
          <a href="https://wa.me/923143552058">WhatsApp · 0314 3552058</a>
          <a href="https://www.instagram.com/tgd_nuces/" target="_blank" rel="noreferrer">
            Instagram · @tgd_nuces
          </a>
          <a href="https://www.instagram.com/tlc_nu/" target="_blank" rel="noreferrer">
            Instagram · @tlc_nu
          </a>
        </div>
        <div className="footer-links">
          <span className="footer-kicker">Explore</span>
          <Link href="/register">Registration</Link>
          <Link href="/portal">Application portal</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 TLC · FAST-NUCES Karachi</span>
        <span>Ideas deserve a stage.</span>
      </div>
    </footer>
  );
}
