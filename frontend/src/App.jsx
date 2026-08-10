import { BrowserRouter, Route, Routes } from "react-router-dom";

import PublicLayout from "./layouts/PublicLayout";
import About from "./pages/public/About";
import CategoryProducts from "./pages/public/CategoryProducts";
import CustomTankBuild from "./pages/public/CustomTankBuild";
import Home from "./pages/public/Home";
import ProductDetail from "./pages/public/ProductDetail";
import Services from "./pages/public/Services";

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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
