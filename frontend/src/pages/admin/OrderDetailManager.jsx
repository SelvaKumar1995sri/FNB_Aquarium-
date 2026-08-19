import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import { describeError } from "../../api/describeError";

const STATUS_LABELS = {
  placed: "Placed",
  packed: "Packed",
  transported: "Transported",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const NEXT_STATUSES = {
  placed: ["packed", "cancelled"],
  packed: ["transported", "cancelled"],
  transported: ["delivered"],
  delivered: [],
  cancelled: [],
};

export default function OrderDetailManager() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [trackingMethod, setTrackingMethod] = useState("porter");
  const [porterName, setPorterName] = useState("");
  const [porterPhone, setPorterPhone] = useState("");
  const [courierName, setCourierName] = useState("");
  const [courierTrackingNumber, setCourierTrackingNumber] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const load = () =>
    apiClient
      .get(`/admin/orders/${id}/`)
      .then((response) => {
        setOrder(response.data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const resetForm = () => {
    setSelectedStatus("");
    setTrackingMethod("porter");
    setPorterName("");
    setPorterPhone("");
    setCourierName("");
    setCourierTrackingNumber("");
  };

  const handleTransition = async (event) => {
    event.preventDefault();
    if (!selectedStatus) return;
    setIsSaving(true);
    setFormError("");
    const payload = { status: selectedStatus };
    if (selectedStatus === "transported") {
      if (trackingMethod === "porter") {
        payload.porter_name = porterName;
        payload.porter_phone = porterPhone;
      } else {
        payload.courier_name = courierName;
        payload.courier_tracking_number = courierTrackingNumber;
      }
    }
    try {
      await apiClient.patch(`/admin/orders/${id}/`, payload);
      resetForm();
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't update the order — please check the fields and try again."));
    } finally {
      setIsSaving(false);
    }
  };

  if (loadError) {
    return <div className="px-4 py-8 text-red-600">Couldn't load this order — please try again later.</div>;
  }

  if (!order) return <div className="px-4 py-8">Loading...</div>;

  const nextStatuses = NEXT_STATUSES[order.status] || [];

  return (
    <div className="px-4 py-8 max-w-2xl">
      <h1 className="text-xl font-semibold mb-2">Order #{order.id}</h1>
      <p className="text-sm text-gray-600 mb-6">Placed on {new Date(order.created_at).toLocaleDateString()}</p>

      <div className="border rounded-lg p-4 mb-6">
        <h2 className="font-medium mb-2">Customer</h2>
        <p className="text-sm">{order.customer_name} — {order.customer_email}</p>
      </div>

      <div className="border rounded-lg p-4 mb-6">
        <h2 className="font-medium mb-2">Delivery address</h2>
        <p className="text-sm">
          {order.address.full_name} — {order.address.phone}
          <br />
          {order.address.line1}{order.address.line2 && `, ${order.address.line2}`}, {order.address.city}, {order.address.state} {order.address.pincode}
        </p>
      </div>

      <div className="border rounded-lg p-4 mb-6">
        <h2 className="font-medium mb-2">Items</h2>
        <div className="grid gap-1 mb-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>{item.product_name} × {item.quantity}</span>
              <span>₹{(Number(item.unit_price) * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between font-semibold border-t pt-2">
          <span>Total</span>
          <span>₹{order.total_amount}</span>
        </div>
        {order.payment_method === "cod" && (
          <div className="text-sm text-amber-600 mt-1">
            <div className="flex justify-between">
              <span>Cash to collect on delivery</span>
              <span>₹{order.cod_amount_due}</span>
            </div>
            <p>Plus the porter/delivery charge — add it when dispatching this order.</p>
          </div>
        )}
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="font-medium mb-3">Status: {STATUS_LABELS[order.status]}</h2>
        {(order.porter_name || order.courier_name) && (
          <p className="text-sm text-gray-600 mb-3">
            {order.porter_name
              ? `Porter: ${order.porter_name} (${order.porter_phone})`
              : `Courier: ${order.courier_name} — ${order.courier_tracking_number}`}
          </p>
        )}
        {nextStatuses.length > 0 && (
          <form onSubmit={handleTransition} className="grid gap-3">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="border rounded px-3 py-2"
            >
              <option value="">Select next status</option>
              {nextStatuses.map((status) => (
                <option key={status} value={status}>{STATUS_LABELS[status]}</option>
              ))}
            </select>
            {selectedStatus === "transported" && (
              <div className="grid gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={trackingMethod === "porter"}
                    onChange={() => setTrackingMethod("porter")}
                  />
                  Porter
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={trackingMethod === "courier"}
                    onChange={() => setTrackingMethod("courier")}
                  />
                  Courier
                </label>
                {trackingMethod === "porter" ? (
                  <>
                    <input
                      required
                      placeholder="Porter name"
                      value={porterName}
                      onChange={(e) => setPorterName(e.target.value)}
                      className="border rounded px-3 py-2"
                    />
                    <input
                      required
                      placeholder="Porter phone"
                      value={porterPhone}
                      onChange={(e) => setPorterPhone(e.target.value)}
                      className="border rounded px-3 py-2"
                    />
                  </>
                ) : (
                  <>
                    <input
                      required
                      placeholder="Courier name"
                      value={courierName}
                      onChange={(e) => setCourierName(e.target.value)}
                      className="border rounded px-3 py-2"
                    />
                    <input
                      required
                      placeholder="Tracking number"
                      value={courierTrackingNumber}
                      onChange={(e) => setCourierTrackingNumber(e.target.value)}
                      className="border rounded px-3 py-2"
                    />
                  </>
                )}
              </div>
            )}
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <button
              type="submit"
              disabled={isSaving || !selectedStatus}
              className="bg-brand-forest hover:bg-brand-forest/90 disabled:opacity-60 text-white rounded px-4 py-2 w-fit"
            >
              {isSaving ? "Saving..." : "Update status"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
