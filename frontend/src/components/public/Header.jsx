import { useState } from "react";
import { NavLink } from "react-router-dom";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/fish", label: "Fish" },
  { to: "/plants", label: "Plants" },
  { to: "/products", label: "Products" },
  { to: "/custom-tank-build", label: "Custom Tank Build" },
  { to: "/services", label: "Services" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/blog", label: "Blog" },
  { to: "/about", label: "About Us" },
  { to: "/contact", label: "Contact Us" },
];

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="bg-brand-dark text-white sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 py-3">
        <NavLink to="/" className="font-bold text-lg">FNB Aquatic Studio</NavLink>
        <button
          className="md:hidden p-2"
          aria-label="Toggle navigation"
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className="block w-6 h-0.5 bg-white mb-1" />
          <span className="block w-6 h-0.5 bg-white mb-1" />
          <span className="block w-6 h-0.5 bg-white" />
        </button>
        <nav className="hidden md:flex gap-6">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className="hover:text-yellow-400">
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
      {isOpen && (
        <nav className="md:hidden flex flex-col gap-3 px-4 pb-4">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} onClick={() => setIsOpen(false)} className="hover:text-yellow-400">
              {link.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
