import { Link } from "react-router-dom";

import { useCart } from "../../context/CartContext";

export default function Cart() {
  const { cart, isLoading, updateItem, removeItem } = useCart();

  if (isLoading && cart.items.length === 0) {
    return <div className="p-8">Loading your cart...</div>;
  }

  if (cart.items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-brand-dark mb-3">Your cart is empty</h1>
        <p className="text-gray-500 mb-6">Browse the catalog and add something you like.</p>
        <Link to="/products" className="text-brand-forest hover:underline">Browse products</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-brand-dark mb-6">Your cart</h1>
      <div className="grid gap-4 mb-8">
        {cart.items.map((item) => (
          <div key={item.id} className="border rounded-xl p-4 flex gap-4 items-center bg-white shadow-sm">
            {item.product_image && (
              <img src={item.product_image} alt={item.product_name} className="w-16 h-16 object-contain bg-gray-50 rounded" />
            )}
            <div className="flex-1">
              <Link to={`/product/${item.product_slug}`} className="font-medium text-brand-dark hover:underline">
                {item.product_name}
              </Link>
              <p className="text-sm text-gray-600">₹{item.product_price} each</p>
              {item.quantity >= item.product_stock_quantity && (
                <p className="text-xs text-amber-600 mt-1">Max available quantity reached</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateItem(item.id, item.quantity - 1)}
                disabled={item.quantity <= 1}
                className="border rounded w-8 h-8 disabled:opacity-40"
                aria-label={`Decrease quantity of ${item.product_name}`}
              >
                −
              </button>
              <span className="w-6 text-center">{item.quantity}</span>
              <button
                type="button"
                onClick={() => updateItem(item.id, item.quantity + 1)}
                disabled={item.quantity >= item.product_stock_quantity}
                className="border rounded w-8 h-8 disabled:opacity-40"
                aria-label={`Increase quantity of ${item.product_name}`}
              >
                +
              </button>
            </div>
            <p className="w-20 text-right font-medium">₹{item.line_total}</p>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="text-red-600 hover:underline text-sm"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="flex justify-end items-center gap-4 border-t pt-4">
        <span className="text-lg font-semibold text-brand-dark">Subtotal: ₹{cart.subtotal}</span>
      </div>
    </div>
  );
}
