import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import Breadcrumbs from "../../components/public/Breadcrumbs";
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

  const currentCategory = useMemo(() => {
    if (!slug) return null;
    return categories.find((category) => category.slug === slug) || null;
  }, [categories, slug]);

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

  const breadcrumbItems = useMemo(() => {
    if (!slug) {
      // Generic /products page: just "Home > Products".
      return [{ label: title }];
    }
    const currentCategory = categories.find((category) => category.slug === slug);
    const parentCategory = currentCategory?.parent
      ? categories.find((category) => category.id === currentCategory.parent)
      : null;
    if (parentCategory) {
      return [
        { label: parentCategory.name, to: `/category/${parentCategory.slug}` },
        { label: currentCategory?.name || title },
      ];
    }
    return [{ label: currentCategory?.name || title }];
  }, [categories, slug, title]);

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
    <div>
      <Breadcrumbs items={breadcrumbItems} />
      <div className="px-4 py-8">
        {currentCategory?.banner_image && (
          <div className="w-full aspect-[16/5] overflow-hidden rounded-lg mb-6">
            <img
              src={currentCategory.banner_image}
              alt={currentCategory.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}
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
        <div className="grid gap-6 grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        {!isLoading && products.length === 0 && !productsError && (
          <p className="text-gray-500">No products in this category yet.</p>
        )}
      </div>
    </div>
  );
}
