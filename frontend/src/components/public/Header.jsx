import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";

import { useAdminNotifications } from "../../context/AdminNotificationsContext";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";

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
  { to: "/admin/orders", label: "Orders" },
];

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <line x1="15.5" y1="15.5" x2="20" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CartIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 4h2l2.4 12h9.2L20 8H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="20" r="1.4" fill="currentColor" />
      <circle cx="17" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}

function BellIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M6 9a6 6 0 1 1 12 0v5l1.5 3h-15L6 14V9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifSnapshot, setNotifSnapshot] = useState({ orders: [], inquiries: [] });
  const { isAuthenticated, isStaff, profile, logout } = useAuth();
  const isCustomerAuthenticated = isAuthenticated && !isStaff;
  const { itemCount } = useCart();
  const { unreadOrdersCount, unreadInquiriesCount, latestOrders, latestInquiries, markSeen } = useAdminNotifications();

  const totalUnread = unreadOrdersCount + unreadInquiriesCount;
  const sidebarBadgeCounts = {
    "/admin/orders": unreadOrdersCount,
    "/admin/inquiries": unreadInquiriesCount,
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const toggleNotifDropdown = () => {
    const opening = !isNotifOpen;
    if (opening) {
      setNotifSnapshot({ orders: latestOrders, inquiries: latestInquiries });
    }
    setIsNotifOpen(opening);
    if (opening && totalUnread > 0) markSeen();
  };

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
            {isAuthenticated && (
              <Link
                to="/cart"
                aria-label={`Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
                className="relative p-2 hover:text-brand-aqua"
              >
                <CartIcon className="h-5 w-5" />
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-brand-aqua text-brand-dark text-[10px] font-semibold rounded-full w-4 h-4 flex items-center justify-center">
                    {itemCount > 9 ? "9+" : itemCount}
                  </span>
                )}
              </Link>
            )}
            {isCustomerAuthenticated && (
              <Link
                to="/account/addresses"
                className="hidden sm:inline whitespace-nowrap text-sm px-3 py-1.5 hover:text-brand-aqua transition-colors"
              >
                Hi, {profile?.name?.split(" ")[0] || "there"}
              </Link>
            )}
            {isAuthenticated && isStaff && (
              <div className="relative">
                <button
                  type="button"
                  aria-label={`Notifications, ${totalUnread} unread`}
                  className="relative p-2 hover:text-brand-aqua"
                  onClick={toggleNotifDropdown}
                >
                  <BellIcon className="h-5 w-5" />
                  {totalUnread > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-semibold rounded-full w-4 h-4 flex items-center justify-center">
                      {totalUnread > 9 ? "9+" : totalUnread}
                    </span>
                  )}
                </button>
                {isNotifOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-white text-brand-dark rounded-lg shadow-xl border z-50 max-h-96 overflow-y-auto">
                    <div className="p-3 border-b font-semibold text-sm">Notifications</div>
                    {notifSnapshot.orders.length === 0 && notifSnapshot.inquiries.length === 0 && (
                      <p className="p-3 text-sm text-gray-500">No new notifications.</p>
                    )}
                    {notifSnapshot.orders.map((order) => (
                      <Link
                        key={`order-${order.id}`}
                        to={`/admin/orders/${order.id}`}
                        onClick={() => setIsNotifOpen(false)}
                        className="block p-3 text-sm border-b hover:bg-gray-50"
                      >
                        New order #{order.id} — {order.customer_name || order.customer_email}
                      </Link>
                    ))}
                    {notifSnapshot.inquiries.map((inquiry) => (
                      <Link
                        key={`inquiry-${inquiry.id}`}
                        to="/admin/inquiries"
                        onClick={() => setIsNotifOpen(false)}
                        className="block p-3 text-sm border-b hover:bg-gray-50"
                      >
                        New inquiry from {inquiry.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            {isAuthenticated ? (
              <button
                type="button"
                onClick={logout}
                aria-label="Logout"
                className="whitespace-nowrap text-sm px-3 py-1.5 border border-white/30 rounded hover:border-brand-aqua hover:text-brand-aqua transition-colors"
              >
                Logout
              </button>
            ) : (
              <Link
                to="/login"
                aria-label="Login"
                className="whitespace-nowrap text-sm px-3 py-1.5 border border-white/30 rounded hover:border-brand-aqua hover:text-brand-aqua transition-colors"
              >
                Login
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
          {isAuthenticated && (
            <>
              <hr className="border-white/10 my-2" />
              <span className="px-2 text-xs uppercase tracking-wide text-white/50">Account</span>
              <NavLink
                to="/account/addresses"
                onClick={() => setIsOpen(false)}
                className="px-2 py-2 rounded hover:bg-white/10 hover:text-brand-aqua"
              >
                My Account
              </NavLink>
              <NavLink
                to="/account/orders"
                onClick={() => setIsOpen(false)}
                className="px-2 py-2 rounded hover:bg-white/10 hover:text-brand-aqua"
              >
                My Orders
              </NavLink>
              <NavLink
                to="/cart"
                onClick={() => setIsOpen(false)}
                className="px-2 py-2 rounded hover:bg-white/10 hover:text-brand-aqua"
              >
                Cart{itemCount > 0 ? ` (${itemCount})` : ""}
              </NavLink>
            </>
          )}
          {isAuthenticated && isStaff && (
            <>
              <hr className="border-white/10 my-2" />
              <span className="px-2 text-xs uppercase tracking-wide text-white/50">Admin</span>
              {ADMIN_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setIsOpen(false)}
                  className="px-2 py-2 rounded hover:bg-white/10 hover:text-brand-aqua flex items-center justify-between"
                >
                  <span>{link.label}</span>
                  {sidebarBadgeCounts[link.to] > 0 && (
                    <span className="bg-red-600 text-white text-[10px] font-semibold rounded-full w-4 h-4 flex items-center justify-center">
                      {sidebarBadgeCounts[link.to] > 9 ? "9+" : sidebarBadgeCounts[link.to]}
                    </span>
                  )}
                </NavLink>
              ))}
            </>
          )}
        </div>
      </nav>
    </>
  );
}
