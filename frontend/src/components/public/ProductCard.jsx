import { Link } from "react-router-dom";

export default function ProductCard({ product }) {
  const image = product.images?.[0];
  return (
    <Link to={`/product/${product.slug}`} className="border rounded-lg p-2 sm:p-4 hover:shadow-md transition">
      {image && (
        <img
          src={image.image}
          alt={image.alt_text || product.name}
          className="w-full h-24 sm:h-40 object-cover rounded mb-2 sm:mb-3"
        />
      )}
      <h3 className="font-semibold text-sm sm:text-base">{product.name}</h3>
      <p className="text-xs sm:text-sm text-gray-600">₹{product.price}</p>
    </Link>
  );
}
