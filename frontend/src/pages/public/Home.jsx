import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiClient } from "../../api/client";
import CategoryGrid from "../../components/public/CategoryGrid";
import ProductCard from "../../components/public/ProductCard";
import VideoSlider from "../../components/public/VideoSlider";

const PROCESS_STEPS = [
  { label: "Consultation", icon: "/consultation.png" },
  { label: "Design & Custom Build", icon: "/design-custom-build.png" },
  { label: "Installation", icon: "/installation.png" },
  { label: "Fish Adding", icon: "/fish-adding.png" },
  { label: "Maintenance", icon: "/maintenance.png" },
];

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [newArrivals, setNewArrivals] = useState([]);
  const [newArrivalsError, setNewArrivalsError] = useState(false);
  const [videos, setVideos] = useState([]);
  const [videosError, setVideosError] = useState(false);

  useEffect(() => {
    setCategories([]);
    setCategoriesError(false);
    apiClient
      .get("/categories/")
      .then((response) => setCategories(response.data.results.filter((category) => !category.parent)))
      .catch(() => setCategoriesError(true));
  }, []);

  useEffect(() => {
    setNewArrivals([]);
    setNewArrivalsError(false);
    apiClient
      .get("/products/")
      .then((response) => setNewArrivals(response.data.results.slice(0, 8)))
      .catch(() => setNewArrivalsError(true));
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
      <section className="relative px-4 py-16 text-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/aquascaping_underwater.jpg')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
        <div className="relative z-10 text-white">
          <h1 className="text-3xl sm:text-5xl font-bold mb-4">FNB Aquatic Studio</h1>
          <p className="max-w-xl mx-auto mb-6">Custom aquariums, aquascaping, and exotic aquatic livestock in Chennai.</p>
        </div>
      </section>

      <section className="px-4 py-12 bg-gray-50">
        <h2 className="text-2xl font-semibold mb-6 text-center">Shop by Category</h2>
        {categoriesError && (
          <p className="text-red-600 text-center">Couldn't load categories — please try again later.</p>
        )}
        <CategoryGrid categories={categories} />
      </section>

      <section className="px-4 py-12">
        <h2 className="text-2xl font-semibold mb-6 text-center">New Arrivals</h2>
        {newArrivalsError && (
          <p className="text-red-600">Couldn't load new arrivals — please try again later.</p>
        )}
        <div className="grid gap-6 grid-cols-4 sm:grid-cols-5 lg:grid-cols-6">
          {newArrivals.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="relative px-4 py-16 text-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/zoosnow-aquarium-5320392.jpg')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
        <div className="relative z-10 text-white">
          <h2 className="text-2xl sm:text-3xl font-semibold mb-4">Build Your Tank</h2>
          <p className="max-w-xl mx-auto mb-6 text-gray-300">
            Tell us the size and shape of the aquarium you want, and we'll get back to you with a
            customized quote — the easiest way to design your own tank and get expert pricing based on
            what you need.
          </p>
          <Link
            to="/custom-tank-build"
            className="bg-brand-aqua hover:bg-brand-aqua/90 text-brand-dark px-6 py-3 rounded font-semibold inline-block"
          >
            Build Your Perfect Tank
          </Link>
        </div>
      </section>

      <section className="px-4 py-12">
        <h2 className="text-2xl font-semibold mb-6 text-center">Our Process</h2>
        <div className="flex flex-wrap justify-center gap-4">
          {PROCESS_STEPS.map((step, index) => (
            <div
              key={step.label}
              className="bg-white border rounded-lg hover:shadow-md transition px-4 py-5 text-center w-56"
            >
              <div className="mb-3 aspect-[4/3] w-full overflow-hidden rounded">
                <img src={step.icon} alt={step.label} className="w-full h-full object-cover" />
              </div>
              <div className="text-sm text-gray-600 mb-1">STEP {index + 1}</div>
              <div className="font-medium">{step.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 py-12 bg-gray-50">
        <h2 className="text-2xl font-semibold mb-6">Watch Us in Action</h2>
        {videosError && (
          <p className="text-red-600">Couldn't load videos — please try again later.</p>
        )}
        <VideoSlider videos={videos} />
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
