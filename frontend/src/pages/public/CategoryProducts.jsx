import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import CategoryGrid from "../../components/public/CategoryGrid";
import ProductCard from "../../components/public/ProductCard";

const TOP_LEVEL_NAV_SLUGS = ["fish", "plants"];

export default function CategoryProducts({ fixedSlug, title }) {
  const params = useParams();
  const slug = fixedSlug || params.slug;
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [products, setProducts] = useState([]);
  const [productsError, setProductsError] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(slug));

  useEffect(() => {
    setCategories([]);
    setCategoriesError(false);
    apiClient
      .get("/categories/")
      .then((response) => {
        setCategories(response.data.results);
      })
      .catch(() => setCategoriesError(true));
  }, []);

  const subcategories = useMemo(() => {
    if (!slug) {
      // Generic /products page: show top-level categories other than
      // Fish/Plants, which already have their own dedicated nav routes.
      return categories.filter((category) => !category.parent && !TOP_LEVEL_NAV_SLUGS.includes(category.slug));
    }
    // /category/:slug (or a fixedSlug page): show the actual children of
    // the category currently being viewed.
    const currentCategory = categories.find((category) => category.slug === slug);
    if (!currentCategory) return [];
    return categories.filter((category) => category.parent === currentCategory.id);
  }, [categories, slug]);

  useEffect(() => {
    if (!slug) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setProducts([]);
    setProductsError(false);
    apiClient
      .get("/products/", { params: { category: slug } })
      .then((response) => {
        setProducts(response.data.results);
        setIsLoading(false);
      })
      .catch(() => {
        setProductsError(true);
        setIsLoading(false);
      });
  }, [slug]);

  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">{title}</h1>
      {categoriesError && (
        <p className="text-red-600">Couldn't load categories — please try again later.</p>
      )}
      {subcategories.length > 0 && (
        <div className="mb-8">
          <CategoryGrid categories={subcategories} />
        </div>
      )}
      {productsError && (
        <p className="text-red-600">Couldn't load products — please try again later.</p>
      )}
      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {!isLoading && products.length === 0 && !productsError && (
        <p className="text-gray-500">No products in this category yet.</p>
      )}
    </div>
  );
}
