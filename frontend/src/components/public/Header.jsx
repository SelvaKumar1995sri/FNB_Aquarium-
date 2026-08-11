import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <header className="bg-brand-dark text-white sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="FNB Aquatic Studio" className="h-10 w-auto" />
          </NavLink>
          <button
            type="button"
            className="p-2"
            aria-label="Open navigation menu"
            aria-expanded={isOpen}
            aria-controls="main-sidebar-nav"
            onClick={() => setIsOpen((open) => !open)}
          >
            <span className="block w-6 h-0.5 bg-white mb-1" />
            <span className="block w-6 h-0.5 bg-white mb-1" />
            <span className="block w-6 h-0.5 bg-white" />
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 bg-black/60 transition-opacity duration-300 z-40 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      <nav
        id="main-sidebar-nav"
        aria-label="Main navigation"
        className={`fixed top-0 left-0 h-full w-64 bg-brand-dark text-white z-50 shadow-xl transform transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <NavLink to="/" className="flex items-center gap-2" onClick={() => setIsOpen(false)}>
            <img src="/logo.png" alt="FNB Aquatic Studio" className="h-8 w-auto" />
          </NavLink>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close navigation menu"
            className="p-2 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="flex flex-col gap-1 p-4">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setIsOpen(false)}
              className="px-2 py-2 rounded hover:bg-white/10 hover:text-brand-aqua"
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
