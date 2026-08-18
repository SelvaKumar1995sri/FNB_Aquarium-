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

  useEffect(() => {
    apiClient
      .get("/admin/orders/", { params: statusFilter ? { status: statusFilter } : {} })
      .then((response) => {
        setOrders(response.data.results);
        setOrdersError(false);
      })
      .catch(() => setOrdersError(true));
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
        <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Placed</th><th></th></tr></thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-t">
              <td>#{order.id}</td>
              <td>{order.customer_name || order.customer_email}</td>
              <td>₹{order.total_amount}</td>
              <td>{STATUS_LABELS[order.status]}</td>
              <td>{new Date(order.created_at).toLocaleDateString()}</td>
              <td><Link to={`/admin/orders/${order.id}`} className="text-brand-forest hover:underline">View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && !ordersError && <p className="text-gray-500 mt-4">No orders.</p>}
    </div>
  );
}
