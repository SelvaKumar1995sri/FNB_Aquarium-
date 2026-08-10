import { BrowserRouter, Route, Routes } from "react-router-dom";

import PublicLayout from "./layouts/PublicLayout";
import CategoryProducts from "./pages/public/CategoryProducts";
import Home from "./pages/public/Home";
import ProductDetail from "./pages/public/ProductDetail";

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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
