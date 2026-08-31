import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import Breadcrumbs from "../../components/public/Breadcrumbs";
import Modal from "../../components/common/Modal";
import InquiryForm from "../../components/public/InquiryForm";
import NotifyMeButton from "../../components/public/NotifyMeButton";
import ProductGallery from "../../components/public/ProductGallery";
import ShareButton from "../../components/public/ShareButton";
import SpecificationAccordion from "../../components/public/SpecificationAccordion";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";

export default function ProductDetail() {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [productError, setProductError] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState("idle"); // idle | adding | added | error
  const [cartError, setCartError] = useState("");
  const [isEnquiryOpen, setIsEnquiryOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    setProduct(null);
    setProductError(false);
    setQuantity(1);
    apiClient
      .get(`/products/${slug}/`)
      .then((response) => setProduct(response.data))
      .catch(() => setProductError(true));
  }, [slug]);

  const handleAddToCart = async () => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    setStatus("adding");
    setCartError("");
    try {
      await addItem(product.id, quantity);
      setStatus("added");
      setTimeout(() => setStatus("idle"), 1500);
    } catch (error) {
      setStatus("error");
      const quantityError = error.response?.data?.quantity;
      const message = Array.isArray(quantityError) ? quantityError[0] : quantityError;
      setCartError(message || "Couldn't add this to your cart — please try again.");
    }
  };

  if (productError) {
    return <div className="p-8 text-red-600">Couldn't load this product — please try again later.</div>;
  }

  if (!product) return <div className="p-8">Loading...</div>;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Products", to: "/products" }, { label: product.name }]} />
      <div className="px-4 py-8 grid gap-8 md:grid-cols-2">
        <div>
          <ProductGallery images={product.images} productName={product.name} />
        </div>
        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold">{product.name}</h1>
            <ShareButton title={product.name} />
          </div>
          <p className="text-lg text-gray-700 mt-1">₹{product.price}</p>
          <p className="mt-4">{product.description}</p>

          <div className="mt-6 flex items-center gap-3">
            {product.in_stock ? (
              <>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  Qty
                  <input
                    type="number"
                    min="1"
                    max={product.stock_quantity}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                    className="border rounded px-2 py-1 w-16"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={status === "adding"}
                  className="bg-brand-forest hover:bg-brand-forest/90 disabled:opacity-60 text-white rounded px-4 py-2 font-medium transition-colors"
                >
                  {status === "added" ? "Added to cart!" : "Add to Cart"}
                </button>
                <span className="text-sm text-gray-500">{product.stock_quantity} available</span>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-red-600 font-medium">Out of stock</span>
                <NotifyMeButton key={product.id} product={product} />
              </div>
            )}
          </div>
          {cartError && <p className="text-red-600 text-sm mt-2">{cartError}</p>}

          {product.note && (
            <div className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
              <span className="font-semibold">Note: </span>
              {product.note}
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsEnquiryOpen(true)}
            className="mt-6 border border-brand-dark rounded px-4 py-2 font-medium hover:bg-brand-dark hover:text-white transition-colors"
          >
            Enquire about this product
          </button>
          {isEnquiryOpen && (
            <Modal title="Enquire about this product" onClose={() => setIsEnquiryOpen(false)}>
              <InquiryForm type="product" product={product} />
            </Modal>
          )}

          <SpecificationAccordion content={product.specification} />
        </div>
      </div>
    </div>
  );
}
