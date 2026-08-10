import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiClient } from "../../api/client";
import ProductCard from "../../components/public/ProductCard";

const PROCESS_STEPS = ["Consultation", "Design & Custom Build", "Installation", "Fish Adding", "Maintenance"];

export default function Home() {
  const [featuredProducts, setFeaturedProducts] = useState([]);

  useEffect(() => {
    apiClient.get("/products/").then((response) => {
      setFeaturedProducts(response.data.results.filter((product) => product.is_featured));
    });
  }, []);

  return (
    <div>
      <section className="bg-brand-dark text-white px-4 py-16 text-center">
        <h1 className="text-3xl sm:text-5xl font-bold mb-4">FNB Aquatic Studio</h1>
        <p className="max-w-xl mx-auto mb-6">Custom aquariums, aquascaping, and exotic aquatic livestock in Chennai.</p>
        <Link to="/custom-tank-build" className="bg-yellow-400 text-brand-dark px-6 py-3 rounded font-semibold">
          Build Your Tank
        </Link>
      </section>

      <section className="px-4 py-12">
        <h2 className="text-2xl font-semibold mb-6">Featured Products</h2>
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="px-4 py-12 bg-gray-50">
        <h2 className="text-2xl font-semibold mb-6 text-center">Our Process</h2>
        <div className="flex flex-wrap justify-center gap-4">
          {PROCESS_STEPS.map((step) => (
            <div key={step} className="bg-white border rounded-lg px-6 py-4 text-center">{step}</div>
          ))}
        </div>
      </section>

      <section className="px-4 py-12">
        <h2 className="text-2xl font-semibold mb-4">About FNB Aquatic Studio</h2>
        <p className="max-w-2xl">
          We design, build, and maintain custom aquariums for homes and businesses, and stock a
          curated range of exotic fish, plants, and aquascaping equipment.
        </p>
      </section>
    </div>
  );
}
