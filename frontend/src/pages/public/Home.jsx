import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiClient } from "../../api/client";
import ProductCard from "../../components/public/ProductCard";
import VideoSlider from "../../components/public/VideoSlider";

const PROCESS_STEPS = ["Consultation", "Design & Custom Build", "Installation", "Fish Adding", "Maintenance"];

export default function Home() {
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [productsError, setProductsError] = useState(false);
  const [videos, setVideos] = useState([]);
  const [videosError, setVideosError] = useState(false);

  useEffect(() => {
    setFeaturedProducts([]);
    setProductsError(false);
    apiClient
      .get("/products/", { params: { is_featured: true } })
      .then((response) => {
        setFeaturedProducts(response.data.results);
      })
      .catch(() => setProductsError(true));
  }, []);

  useEffect(() => {
    setVideos([]);
    setVideosError(false);
    apiClient
      .get("/videos/")
      .then((response) => setVideos(response.data.results))
      .catch(() => setVideosError(true));
  }, []);

  return (
    <div>
      <section className="bg-brand-dark text-white px-4 py-16 text-center">
        <h1 className="text-3xl sm:text-5xl font-bold mb-4">FNB Aquatic Studio</h1>
        <p className="max-w-xl mx-auto mb-6">Custom aquariums, aquascaping, and exotic aquatic livestock in Chennai.</p>
        <Link to="/custom-tank-build" className="bg-brand-aqua text-brand-dark px-6 py-3 rounded font-semibold">
          Build Your Tank
        </Link>
      </section>

      <section className="px-4 py-12">
        <h2 className="text-2xl font-semibold mb-6">Featured Products</h2>
        {productsError && (
          <p className="text-red-600">Couldn't load featured products — please try again later.</p>
        )}
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="px-4 py-12">
        <h2 className="text-2xl font-semibold mb-6">Watch Us in Action</h2>
        {videosError && (
          <p className="text-red-600">Couldn't load videos — please try again later.</p>
        )}
        <VideoSlider videos={videos} />
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
