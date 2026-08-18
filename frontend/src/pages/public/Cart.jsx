import { useState } from "react";
import { Link } from "react-router-dom";

import { useCart } from "../../context/CartContext";

export default function Cart() {
  const { cart, isLoading, updateItem, removeItem } = useCart();
  const [pendingItems, setPendingItems] = useState(new Set());
  const [itemErrors, setItemErrors] = useState({});

  const handleUpdateQuantity = async (itemId, newQuantity) => {
    setPendingItems((prev) => new Set([...prev, itemId]));
    setItemErrors((prev) => ({ ...prev, [itemId]: "" }));
    try {
      await updateItem(itemId, newQuantity);
    } catch (error) {
      const quantityError = error.response?.data?.quantity;
      const message = Array.isArray(quantityError) ? quantityError[0] : quantityError;
      setItemErrors((prev) => ({
        ...prev,
        [itemId]: message || "Couldn't update this item — please try again.",
      }));
    } finally {
      setPendingItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const handleRemoveItem = async (itemId) => {
    setPendingItems((prev) => new Set([...prev, itemId]));
    setItemErrors((prev) => ({ ...prev, [itemId]: "" }));
    try {
      await removeItem(itemId);
    } catch (error) {
      const quantityError = error.response?.data?.quantity;
      const message = Array.isArray(quantityError) ? quantityError[0] : quantityError;
      setItemErrors((prev) => ({
        ...prev,
        [itemId]: message || "Couldn't remove this item — please try again.",
      }));
    } finally {
      setPendingItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

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
        {cart.items.map((item) => {
          const isPending = pendingItems.has(item.id);
          const itemError = itemErrors[item.id];
          return (
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
                {itemError && <p className="text-xs text-red-600 mt-1">{itemError}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                  disabled={item.quantity <= 1 || isPending}
                  className="border rounded w-8 h-8 disabled:opacity-40"
                  aria-label={`Decrease quantity of ${item.product_name}`}
                >
                  −
                </button>
                <span className="w-6 text-center">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                  disabled={item.quantity >= item.product_stock_quantity || isPending}
                  className="border rounded w-8 h-8 disabled:opacity-40"
                  aria-label={`Increase quantity of ${item.product_name}`}
                >
                  +
                </button>
              </div>
              <p className="w-20 text-right font-medium">₹{item.line_total}</p>
              <button
                type="button"
                onClick={() => handleRemoveItem(item.id)}
                disabled={isPending}
                className="text-red-600 hover:underline text-sm disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end items-center gap-4 border-t pt-4">
        <span className="text-lg font-semibold text-brand-dark">Subtotal: ₹{cart.subtotal}</span>
      </div>
    </div>
  );
}
