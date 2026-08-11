import { Link } from "react-router-dom";

import { SHOP_INFO } from "../../content/shopInfo";

const EXPLORE_LINKS = [
  { label: "Home", to: "/" },
  { label: "Fish", to: "/fish" },
  { label: "Plants", to: "/plants" },
  { label: "Products", to: "/products" },
  { label: "Custom Tank Build", to: "/custom-tank-build" },
];

const COMPANY_LINKS = [
  { label: "Services", to: "/services" },
  { label: "Portfolio", to: "/portfolio" },
  { label: "Blog", to: "/blog" },
  { label: "About Us", to: "/about" },
  { label: "Contact Us", to: "/contact" },
];

const POLICY_LINKS = [
  { label: "Privacy Policy", to: "/policies/privacy-policy" },
  { label: "Shipping Policy", to: "/policies/shipping-policy" },
  { label: "Terms & Conditions", to: "/policies/terms-conditions" },
  { label: "Return Policy", to: "/policies/return-policy" },
];

function YoutubeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="2" y="5" width="20" height="14" rx="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 9.5v5l4.5-2.5-4.5-2.5Z" fill="currentColor" />
    </svg>
  );
}

function InstagramIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="bg-brand-dark text-white px-4 py-8 mt-auto">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <img src="/logo.png" alt="FNB Aquatic Studio" className="h-12 w-auto mb-3" />
          <p>Custom aquariums, aquascaping, and aquatic livestock &mdash; built and maintained with care.</p>
          <h3 className="font-semibold mt-4 mb-2">Follow Us</h3>
          <div className="flex gap-3">
            <a
              href="https://www.youtube.com/channel/UCqSYyMVIKnmtbUbATkNER3w"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="FNB Aquatic Studio on YouTube"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 hover:border-brand-aqua hover:text-brand-aqua transition-colors"
            >
              <YoutubeIcon className="h-5 w-5" />
            </a>
            <a
              href="https://www.instagram.com/fnb_aquatics/?hl=en"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="FNB Aquatic Studio on Instagram"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 hover:border-brand-aqua hover:text-brand-aqua transition-colors"
            >
              <InstagramIcon className="h-5 w-5" />
            </a>
          </div>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Explore</h3>
          <ul className="grid gap-1">
            {EXPLORE_LINKS.map(({ label, to }) => (
              <li key={to}><Link to={to}>{label}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Company</h3>
          <ul className="grid gap-1">
            {COMPANY_LINKS.map(({ label, to }) => (
              <li key={to}><Link to={to}>{label}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Visit Us</h3>
          <p>{SHOP_INFO.address}</p>
          <p className="mt-2">Phone: {SHOP_INFO.phone}</p>
          <ul className="mt-3">
            {SHOP_INFO.hoursByDay.map(([day, time]) => (
              <li key={day} className="flex justify-between max-w-xs">
                <span>{day}</span>
                <span>{time}</span>
              </li>
            ))}
          </ul>
          <p className="text-brand-aqua text-sm mt-1">{SHOP_INFO.holidayNote}</p>
          <ul className="grid gap-1 mt-4">
            {POLICY_LINKS.map(({ label, to }) => (
              <li key={to}><Link to={to}>{label}</Link></li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
