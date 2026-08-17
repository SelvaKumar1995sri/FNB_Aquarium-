import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";

const NAV_LINKS = [
  { to: "/fish", label: "Fish" },
  { to: "/plants", label: "Plants" },
  { to: "/products", label: "Products" },
  { to: "/services", label: "Services" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/blog", label: "Blog" },
];

const ADMIN_LINKS = [
  { to: "/admin/categories", label: "Categories" },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/videos", label: "Videos" },
  { to: "/admin/inquiries", label: "Inquiries" },
];

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <line x1="15.5" y1="15.5" x2="20" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const { isAuthenticated, isStaff, logout } = useAuth();
  const { isAuthenticated: isCustomerAuthenticated, profile, logout: customerLogout } = useCustomerAuth();

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
        <div className="grid grid-cols-3 items-center px-4 py-3">
          <div className="flex items-center">
            <button
              type="button"
              className="p-2"
              aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isOpen}
              aria-controls="main-sidebar-nav"
              onClick={() => setIsOpen((open) => !open)}
            >
              <span className="block w-6 h-0.5 bg-white mb-1" />
              <span className="block w-6 h-0.5 bg-white mb-1" />
              <span className="block w-6 h-0.5 bg-white" />
            </button>
          </div>

          <NavLink to="/" className="flex items-center justify-center">
            <img src="/logo.png" alt="FNB Aquatic Studio" className="h-10 w-auto" />
          </NavLink>

          <div className="flex items-center justify-end gap-3">
            <Link to="/search" aria-label="Search" className="p-2 hover:text-brand-aqua">
              <SearchIcon className="h-5 w-5" />
            </Link>
            {isCustomerAuthenticated ? (
              <>
                <Link
                  to="/account/addresses"
                  className="hidden sm:inline whitespace-nowrap text-sm px-3 py-1.5 hover:text-brand-aqua transition-colors"
                >
                  Hi, {profile?.name?.split(" ")[0] || "there"}
                </Link>
                <button
                  type="button"
                  onClick={customerLogout}
                  className="whitespace-nowrap text-sm px-3 py-1.5 border border-white/30 rounded hover:border-brand-aqua hover:text-brand-aqua transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="whitespace-nowrap text-sm px-3 py-1.5 border border-white/30 rounded hover:border-brand-aqua hover:text-brand-aqua transition-colors"
              >
                Login
              </Link>
            )}
            {isAuthenticated && isStaff ? (
              <button
                type="button"
                onClick={logout}
                className="whitespace-nowrap text-sm px-3 py-1.5 border border-white/30 rounded hover:border-brand-aqua hover:text-brand-aqua transition-colors"
              >
                Logout
              </button>
            ) : (
              <Link
                to="/admin/login"
                className="whitespace-nowrap text-sm px-3 py-1.5 border border-white/30 rounded hover:border-brand-aqua hover:text-brand-aqua transition-colors"
              >
                <span className="hidden sm:inline">Admin </span>Login
              </Link>
            )}
          </div>
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
        inert={!isOpen}
        className={`fixed top-0 left-0 h-full w-64 bg-brand-dark text-white z-50 shadow-xl transition-transform duration-300 ${
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
          {isAuthenticated && isStaff && (
            <>
              <hr className="border-white/10 my-2" />
              <span className="px-2 text-xs uppercase tracking-wide text-white/50">Admin</span>
              {ADMIN_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setIsOpen(false)}
                  className="px-2 py-2 rounded hover:bg-white/10 hover:text-brand-aqua"
                >
                  {link.label}
                </NavLink>
              ))}
            </>
          )}
        </div>
      </nav>
    </>
  );
}
