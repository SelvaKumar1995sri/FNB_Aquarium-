import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiClient } from "../../api/client";

const STATUS_OPTIONS = ["placed", "packed", "transported", "delivered", "cancelled"];
const STATUS_LABELS = {
  placed: "Placed",
  packed: "Packed",
  transported: "Transported",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function OrdersManager() {
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [nextUrl, setNextUrl] = useState(null);
  const [previousUrl, setPreviousUrl] = useState(null);
  const [count, setCount] = useState(0);

  const load = (url) => {
    const request = url
      ? apiClient.get(url)
      : apiClient.get("/admin/orders/", { params: statusFilter ? { status: statusFilter } : {} });
    request
      .then((response) => {
        setOrders(response.data.results);
        setNextUrl(response.data.next);
        setPreviousUrl(response.data.previous);
        setCount(response.data.count);
        setOrdersError(false);
      })
      .catch(() => setOrdersError(true));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <div className="px-4 py-8">
      <h1 className="text-xl font-semibold mb-4">Orders</h1>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="border rounded px-3 py-2 mb-4"
      >
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>{STATUS_LABELS[status]}</option>
        ))}
      </select>
      {ordersError && <p className="text-red-600 mb-4">Couldn't load orders — please try again later.</p>}
      <table className="w-full text-left">
        <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>COD Due</th><th>Status</th><th>Placed</th><th></th></tr></thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-t">
              <td>#{order.id}</td>
              <td>{order.customer_name || order.customer_email}</td>
              <td>₹{order.total_amount}</td>
              <td>{order.payment_method === "cod" ? `₹${order.cod_amount_due}` : "—"}</td>
              <td>{STATUS_LABELS[order.status]}</td>
              <td>{new Date(order.created_at).toLocaleDateString()}</td>
              <td><Link to={`/admin/orders/${order.id}`} className="text-brand-forest hover:underline">View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && !ordersError && <p className="text-gray-500 mt-4">No orders.</p>}
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
