import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

const LINKS = [
  { to: "/admin/categories", label: "Categories" },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/videos", label: "Videos" },
  { to: "/admin/inquiries", label: "Inquiries" },
];

export default function AdminLayout() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <nav className="bg-brand-dark text-white flex md:flex-col gap-2 p-4 md:w-56">
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} className="hover:text-yellow-400">
            {link.label}
          </NavLink>
        ))}
        <button onClick={logout} className="mt-auto text-left hover:text-yellow-400">Log out</button>
      </nav>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
