import { BrowserRouter, Route, Routes } from "react-router-dom";

import AdminGuard from "./components/admin/AdminGuard";
import PublicLayout from "./layouts/PublicLayout";
import Login from "./pages/admin/Login";
import About from "./pages/public/About";
import Blog from "./pages/public/Blog";
import CategoryProducts from "./pages/public/CategoryProducts";
import Contact from "./pages/public/Contact";
import CustomTankBuild from "./pages/public/CustomTankBuild";
import Home from "./pages/public/Home";
import Portfolio from "./pages/public/Portfolio";
import ProductDetail from "./pages/public/ProductDetail";
import Services from "./pages/public/Services";
import StaticPage from "./pages/public/StaticPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/fish" element={<CategoryProducts fixedSlug="fish" title="Fish" />} />
          <Route path="/plants" element={<CategoryProducts fixedSlug="plants" title="Plants" />} />
          <Route path="/products" element={<CategoryProducts title="Products" />} />
          <Route path="/category/:slug" element={<CategoryProducts title="Category" />} />
          <Route path="/product/:slug" element={<ProductDetail />} />
          <Route path="/custom-tank-build" element={<CustomTankBuild />} />
          <Route path="/services" element={<Services />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/policies/:slug" element={<StaticPage />} />
        </Route>
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin" element={<AdminGuard />}>
          <Route index element={<div className="p-8">Admin Dashboard (Task 23)</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
