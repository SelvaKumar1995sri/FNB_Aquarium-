import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AdminGuard from "./components/admin/AdminGuard";
import ScrollToTop from "./components/ScrollToTop";
import PublicLayout from "./layouts/PublicLayout";
import CategoriesManager from "./pages/admin/CategoriesManager";
import InquiriesManager from "./pages/admin/InquiriesManager";
import Login from "./pages/admin/Login";
import ProductsManager from "./pages/admin/ProductsManager";
import VideosManager from "./pages/admin/VideosManager";
import About from "./pages/public/About";
import Blog from "./pages/public/Blog";
import CategoryProducts from "./pages/public/CategoryProducts";
import Contact from "./pages/public/Contact";
import CustomTankBuild from "./pages/public/CustomTankBuild";
import Home from "./pages/public/Home";
import NotFound from "./pages/public/NotFound";
import Portfolio from "./pages/public/Portfolio";
import ProductDetail from "./pages/public/ProductDetail";
import SearchResults from "./pages/public/SearchResults";
import Services from "./pages/public/Services";
import StaticPage from "./pages/public/StaticPage";

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/fish" element={<CategoryProducts fixedSlug="fish" title="Fish" />} />
          <Route path="/plants" element={<CategoryProducts fixedSlug="plants" title="Plants" />} />
          <Route path="/products" element={<CategoryProducts title="Products" />} />
          <Route path="/category/:slug" element={<CategoryProducts title="Category" />} />
          <Route path="/product/:slug" element={<ProductDetail />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/custom-tank-build" element={<CustomTankBuild />} />
          <Route path="/services" element={<Services />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/policies/:slug" element={<StaticPage />} />
          <Route path="/admin" element={<AdminGuard />}>
            <Route index element={<Navigate to="/admin/categories" replace />} />
            <Route path="categories" element={<CategoriesManager />} />
            <Route path="products" element={<ProductsManager />} />
            <Route path="videos" element={<VideosManager />} />
            <Route path="inquiries" element={<InquiriesManager />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="/admin/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
}
