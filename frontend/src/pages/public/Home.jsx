import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiClient } from "../../api/client";
import CategoryGrid from "../../components/public/CategoryGrid";
import ProductCard from "../../components/public/ProductCard";
import VideoSlider from "../../components/public/VideoSlider";

const PROCESS_ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-6 w-6",
  "aria-hidden": "true",
};

const PROCESS_STEPS = [
  {
    label: "Consultation",
    icon: (
      <svg {...PROCESS_ICON_PROPS}>
        <rect x="4" y="4.5" width="16" height="11" rx="2" />
        <path d="M8 15.5v3.5l4-3.5" />
      </svg>
    ),
  },
  {
    label: "Design & Custom Build",
    icon: (
      <svg {...PROCESS_ICON_PROPS}>
        <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" />
        <path d="M14 7l3 3" />
      </svg>
    ),
  },
  {
    label: "Installation",
    icon: (
      <svg {...PROCESS_ICON_PROPS}>
        <path d="M13 5.5a3 3 0 1 0-3 3l-6 6a1.5 1.5 0 1 0 2 2l6-6a3 3 0 0 0 3-3Z" />
      </svg>
    ),
  },
  {
    label: "Fish Adding",
    icon: (
      <svg {...PROCESS_ICON_PROPS}>
        <path d="M2 12c2-4 6-6 10-6s8 2 10 6c-2 4-6 6-10 6S4 16 2 12Z" />
        <path d="M18 9l4 3-4 3" />
        <circle cx="7" cy="11" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: "Maintenance",
    icon: (
      <svg {...PROCESS_ICON_PROPS}>
        <circle cx="12" cy="12" r="5.5" />
        <circle cx="12" cy="12" r="2" />
        <rect x="10.8" y="4" width="2.4" height="2.5" />
        <rect x="10.8" y="4" width="2.4" height="2.5" transform="rotate(45 12 12)" />
        <rect x="10.8" y="4" width="2.4" height="2.5" transform="rotate(90 12 12)" />
        <rect x="10.8" y="4" width="2.4" height="2.5" transform="rotate(135 12 12)" />
        <rect x="10.8" y="4" width="2.4" height="2.5" transform="rotate(180 12 12)" />
        <rect x="10.8" y="4" width="2.4" height="2.5" transform="rotate(225 12 12)" />
        <rect x="10.8" y="4" width="2.4" height="2.5" transform="rotate(270 12 12)" />
        <rect x="10.8" y="4" width="2.4" height="2.5" transform="rotate(315 12 12)" />
      </svg>
    ),
  },
];

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [newArrivals, setNewArrivals] = useState([]);
  const [newArrivalsError, setNewArrivalsError] = useState(false);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [productsError, setProductsError] = useState(false);
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
      <section className="relative px-4 py-16 text-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/aquascaping_underwater.jpg')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-black/70" aria-hidden="true" />
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
        <h2 className="text-2xl font-semibold mb-6">New Arrivals</h2>
        {newArrivalsError && (
          <p className="text-red-600">Couldn't load new arrivals — please try again later.</p>
        )}
        <div className="grid gap-6 grid-cols-3 lg:grid-cols-4">
          {newArrivals.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="px-4 py-12 bg-gray-50">
        <h2 className="text-2xl font-semibold mb-6">Featured Products</h2>
        {productsError && (
          <p className="text-red-600">Couldn't load featured products — please try again later.</p>
        )}
        <div className="grid gap-6 grid-cols-3 lg:grid-cols-4">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="px-4 py-16 bg-brand-dark text-white text-center">
        <h2 className="text-2xl sm:text-3xl font-semibold mb-4">Build Your Tank</h2>
        <p className="max-w-xl mx-auto mb-6 text-gray-300">
          Tell us the size and shape of the aquarium you want, and we'll get back to you with a
          customized quote — the easiest way to design your own tank and get expert pricing based on
          what you need.
        </p>
        <Link
          to="/custom-tank-build"
          className="bg-brand-forest hover:bg-brand-forest/90 text-white px-6 py-3 rounded font-semibold inline-block"
        >
          Build Your Perfect Tank
        </Link>
      </section>

      <section className="px-4 py-12">
        <h2 className="text-2xl font-semibold mb-6 text-center">Our Process</h2>
        <div className="flex flex-wrap justify-center gap-4">
          {PROCESS_STEPS.map((step, index) => (
            <div
              key={step.label}
              className="bg-white border-t-4 border-brand-aqua shadow-sm rounded-lg px-6 py-5 text-center w-40"
            >
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-brand-aqua/10 text-brand-aqua">
                {step.icon}
              </div>
              <div className="text-brand-aqua font-bold text-sm mb-1">STEP {index + 1}</div>
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
