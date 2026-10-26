import Link from "next/link";
import { EVENT_DETAILS } from "@/data/event";

function ContactIcon({ type }: { type: "mail" | "whatsapp" | "instagram" }) {
  if (type === "mail") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path d="m4.5 7 7.5 6 7.5-6" />
      </svg>
    );
  }

  if (type === "whatsapp") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M20 11.7a8 8 0 0 1-11.8 7L4 20l1.3-4A8 8 0 1 1 20 11.7Z" />
        <path d="M9 8.5c.3-.5.6-.5.9-.5l.7 1.6c.1.3 0 .5-.2.7l-.5.5a6 6 0 0 0 2.8 2.8l.5-.5c.2-.2.4-.3.7-.2l1.6.7c.3.1.3.6.1.9-.4.6-1.2 1-1.9 1-2.5-.1-6.1-3.7-6.2-6.2 0-.3.3-.7.5-.8Z" />
      </svg>
    );
  }

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle className="contact-icon-fill" cx="17.5" cy="6.8" r="1" />
    </svg>
  );
}

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
          <a href="mailto:tlc.khi@nu.edu.pk">
            <ContactIcon type="mail" />
            tlc.khi@nu.edu.pk
          </a>
          <a href="https://wa.me/923143552058">
            <ContactIcon type="whatsapp" />
            0314 3552058
          </a>
          <a className="footer-social-link" href="https://www.instagram.com/tgd_nuces/" target="_blank" rel="noreferrer">
            <ContactIcon type="instagram" />
            @tgd_nuces
          </a>
          <a className="footer-social-link" href="https://www.instagram.com/tlc_nu/" target="_blank" rel="noreferrer">
            <ContactIcon type="instagram" />
            @tlc_nu
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
