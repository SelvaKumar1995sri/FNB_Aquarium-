import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";

export default function ProductCard({ product }) {
  const image = product.images?.[0];
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();
  const navigate = useNavigate();
  const [status, setStatus] = useState("idle"); // idle | adding | added | error

  const handleAddToCart = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    setStatus("adding");
    try {
      await addItem(product.id, 1);
      setStatus("added");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 1500);
    }
  };

  return (
    <Link to={`/product/${product.slug}`} className="border rounded-lg p-2 sm:p-4 hover:shadow-md transition flex flex-col">
      {image && (
        <div className="w-full aspect-square bg-gray-50 rounded mb-2 sm:mb-3 flex items-center justify-center overflow-hidden p-2">
          <img
            src={image.image}
            alt={image.alt_text || product.name}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
      <h3 className="font-semibold text-sm sm:text-base">{product.name}</h3>
      <p className="text-xs sm:text-sm text-gray-600">₹{product.price}</p>
      {product.in_stock && <p className="text-xs text-gray-500">{product.stock_quantity} in stock</p>}
      <div className="mt-auto pt-2">
        {product.in_stock ? (
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={status === "adding"}
            className="w-full text-xs sm:text-sm bg-brand-forest hover:bg-brand-forest/90 disabled:opacity-60 text-white rounded px-2 py-1.5 transition-colors"
          >
            {status === "added" ? "Added!" : status === "error" ? "Couldn't add" : "Add to Cart"}
          </button>
        ) : (
          <span className="block text-center text-xs sm:text-sm text-red-600 border border-red-200 rounded px-2 py-1.5">
            Out of stock
          </span>
        )}
      </div>
    </Link>
  );
}
