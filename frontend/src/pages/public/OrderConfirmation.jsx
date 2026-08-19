import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import { useCart } from "../../context/CartContext";

export default function OrderConfirmation({ pollIntervalMs = 1500, pollTimeoutMs = 15000 }) {
  const { razorpayOrderId } = useParams();
  const { refresh: refreshCart } = useCart();
  const [order, setOrder] = useState(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const poll = () => {
      apiClient
        .get(`/orders/by-razorpay-order/${razorpayOrderId}/`)
        .then((response) => {
          if (cancelled) return;
          setOrder(response.data);
          refreshCart();
        })
        .catch(() => {
          if (cancelled) return;
          if (Date.now() - startedAt >= pollTimeoutMs) {
            setTimedOut(true);
            return;
          }
          setTimeout(poll, pollIntervalMs);
        });
    };

    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [razorpayOrderId]);

  if (order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-brand-dark mb-3">Thank you for your order!</h1>
        <div className="mb-6">
          <p className="text-gray-600">Order #{order.id} — ₹{order.total_amount}</p>
          {order.payment_method === "cod" && (
            <p className="text-brand-dark font-medium mt-1">
              Pay ₹{order.cod_amount_due} plus delivery charges in cash when your order is delivered.
            </p>
          )}
        </div>
        <Link to="/products" className="text-brand-forest hover:underline">Continue shopping</Link>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-brand-dark mb-3">Payment received</h1>
        <p className="text-gray-600">
          Your order will appear in My Orders shortly; contact us if it doesn't within a few minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p className="text-gray-600">Confirming your payment…</p>
    </div>
  );
}
