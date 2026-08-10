import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import CategoryGrid from "../../components/public/CategoryGrid";
import ProductCard from "../../components/public/ProductCard";

export default function CategoryProducts({ fixedSlug, title }) {
  const params = useParams();
  const slug = fixedSlug || params.slug;
  const [subcategories, setSubcategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [products, setProducts] = useState([]);
  const [productsError, setProductsError] = useState(false);

  useEffect(() => {
    apiClient
      .get("/categories/")
      .then((response) => {
        setSubcategories(response.data.results.filter((category) => category.parent && String(category.parent) !== ""));
      })
      .catch(() => setCategoriesError(true));
  }, []);

  useEffect(() => {
    if (!slug) return;
    apiClient
      .get("/products/", { params: { category: slug } })
      .then((response) => {
        setProducts(response.data.results);
      })
      .catch(() => setProductsError(true));
  }, [slug]);

  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">{title}</h1>
      {!fixedSlug && (
        <>
          {categoriesError && (
            <p className="text-red-600">Couldn't load categories — please try again later.</p>
          )}
          {subcategories.length > 0 && (
            <div className="mb-8">
              <CategoryGrid categories={subcategories} />
            </div>
          )}
        </>
      )}
      {productsError && (
        <p className="text-red-600">Couldn't load products — please try again later.</p>
      )}
      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {products.length === 0 && !productsError && <p className="text-gray-500">No products in this category yet.</p>}
    </div>
  );
}
