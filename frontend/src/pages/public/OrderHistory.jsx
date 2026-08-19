import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiClient } from "../../api/client";

const STATUS_LABELS = {
  placed: "Placed",
  packed: "Packed",
  transported: "Transported",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function OrderHistory() {
  const [orders, setOrders] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [nextUrl, setNextUrl] = useState(null);
  const [previousUrl, setPreviousUrl] = useState(null);
  const [count, setCount] = useState(0);

  const load = (url) => {
    const request = url ? apiClient.get(url) : apiClient.get("/orders/");
    request
      .then((response) => {
        setOrders(response.data.results);
        setNextUrl(response.data.next);
        setPreviousUrl(response.data.previous);
        setCount(response.data.count);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-brand-dark mb-6">Your orders</h1>
      {loadError && <p className="text-red-600 mb-4">Couldn't load your orders — please try again later.</p>}
      <div className="grid gap-4">
        {orders.map((order) => (
          <Link
            key={order.id}
            to={`/account/orders/${order.id}`}
            className="border rounded-xl p-4 flex justify-between items-center bg-white shadow-sm hover:shadow-md transition"
          >
            <div>
              <p className="font-medium text-brand-dark">Order #{order.id}</p>
              <p className="text-sm text-gray-600">{new Date(order.created_at).toLocaleDateString()}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-brand-forest">{STATUS_LABELS[order.status]}</p>
              <p className="text-sm text-gray-600">₹{order.total_amount}</p>
              {order.payment_method === "cod" && (
                <p className="text-xs text-amber-600">Cash on delivery</p>
              )}
            </div>
          </Link>
        ))}
        {orders.length === 0 && !loadError && (
          <p className="text-gray-500 text-sm">You haven't placed any orders yet.</p>
        )}
      </div>
      <div className="flex justify-between items-center mt-4 text-sm">
        <button
          type="button"
          onClick={() => load(previousUrl)}
          disabled={!previousUrl}
          className="border rounded px-3 py-1.5 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-gray-500">{count} order{count === 1 ? "" : "s"}</span>
        <button
          type="button"
          onClick={() => load(nextUrl)}
          disabled={!nextUrl}
          className="border rounded px-3 py-1.5 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
