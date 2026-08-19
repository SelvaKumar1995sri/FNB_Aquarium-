import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { apiClient } from "../../api/client";

const STATUS_LABELS = {
  placed: "Placed",
  packed: "Packed",
  transported: "Transported",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    apiClient
      .get(`/orders/${id}/`)
      .then((response) => {
        setOrder(response.data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [id]);

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-red-600">
        Couldn't load this order — please try again later.
      </div>
    );
  }

  if (!order) return <div className="max-w-3xl mx-auto px-4 py-10">Loading...</div>;

  const hasTracking = order.porter_name || order.courier_name;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-brand-dark mb-2">Order #{order.id}</h1>
      <p className="text-sm text-gray-600 mb-6">Placed on {new Date(order.created_at).toLocaleDateString()}</p>

      <div className="border rounded-xl p-4 bg-white shadow-sm mb-6">
        <p className="font-medium text-brand-dark mb-1">Status: {STATUS_LABELS[order.status]}</p>
        {hasTracking && (
          <div className="mt-3 text-sm text-gray-700">
            {order.porter_name ? (
              <p>Delivered by porter: {order.porter_name} ({order.porter_phone})</p>
            ) : (
              <p>Shipped via {order.courier_name} — tracking number {order.courier_tracking_number}</p>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-xl p-4 bg-white shadow-sm mb-6">
        <h2 className="font-medium text-brand-dark mb-2">Delivery address</h2>
        {order.address ? (
          <p className="text-sm text-gray-700">
            {order.address.full_name} — {order.address.phone}
            <br />
            {order.address.line1}{order.address.line2 && `, ${order.address.line2}`}, {order.address.city}, {order.address.state} {order.address.pincode}
          </p>
        ) : (
          <p className="text-sm text-gray-700">Address unavailable</p>
        )}
      </div>

      <div className="border rounded-xl p-4 bg-white shadow-sm">
        <h2 className="font-medium text-brand-dark mb-3">Items</h2>
        <div className="grid gap-2 mb-3">
          {(order.items || []).map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>{item.product_name} × {item.quantity}</span>
              <span>₹{(Number(item.unit_price) * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between font-semibold text-brand-dark border-t pt-3">
          <span>Total</span>
          <span>₹{order.total_amount}</span>
        </div>
      </div>
    </div>
  );
}
