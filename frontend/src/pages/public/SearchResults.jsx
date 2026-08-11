import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import ProductCard from "../../components/public/ProductCard";

export default function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [inputValue, setInputValue] = useState(query);
  const [products, setProducts] = useState([]);
  const [productsError, setProductsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setInputValue(query);
  }, [query]);

  useEffect(() => {
    if (!query) {
      setProducts([]);
      setProductsError(false);
      setIsLoading(false);
      return;
    }
    setProducts([]);
    setProductsError(false);
    setIsLoading(true);
    apiClient
      .get("/products/", { params: { search: query } })
      .then((response) => setProducts(response.data.results))
      .catch(() => setProductsError(true))
      .finally(() => setIsLoading(false));
  }, [query]);

  const handleSubmit = (event) => {
    event.preventDefault();
    setSearchParams(inputValue ? { q: inputValue } : {});
  };

  return (
    <div className="px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Search</h1>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-8 max-w-md">
        <input
          type="search"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="Search products..."
          aria-label="Search products"
          className="border rounded px-3 py-2 flex-1"
        />
        <button type="submit" className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2">
          Search
        </button>
      </form>

      {productsError && <p className="text-red-600">Couldn't load search results — please try again later.</p>}

      {!query && !productsError && (
        <p className="text-gray-500">Enter a search term to find products.</p>
      )}

      {query && !isLoading && !productsError && products.length === 0 && (
        <p className="text-gray-600">No results for &quot;{query}&quot;.</p>
      )}

      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
