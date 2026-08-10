import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import InquiryForm from "../../components/public/InquiryForm";

export default function ProductDetail() {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [productError, setProductError] = useState(false);

  useEffect(() => {
    apiClient
      .get(`/products/${slug}/`)
      .then((response) => setProduct(response.data))
      .catch(() => setProductError(true));
  }, [slug]);

  if (productError) {
    return <div className="p-8 text-red-600">Couldn't load this product — please try again later.</div>;
  }

  if (!product) return <div className="p-8">Loading...</div>;

  return (
    <div className="px-4 py-8 grid gap-8 md:grid-cols-2">
      <div>
        {product.images?.[0] && (
          <img src={product.images[0].image} alt={product.name} className="w-full rounded-lg" />
        )}
      </div>
      <div>
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        <p className="text-lg text-gray-700 mt-1">₹{product.price}</p>
        <p className="mt-4">{product.description}</p>
        <h2 className="text-xl font-semibold mt-8 mb-3">Enquire about this product</h2>
        <InquiryForm type="product" product={product} />
      </div>
    </div>
  );
}
