import { Outlet } from "react-router-dom";

import Footer from "../components/public/Footer";
import Header from "../components/public/Header";

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
