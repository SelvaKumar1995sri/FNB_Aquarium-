import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { apiClient } from "../../api/client";
import { describeError } from "../../api/describeError";
import AddressForm from "../../components/public/AddressForm";
import Breadcrumbs from "../../components/public/Breadcrumbs";
import { useAuth } from "../../context/AuthContext";

const STATUS_LABELS = {
  placed: "Placed",
  packed: "Packed",
  transported: "Transported",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const RECENT_ORDERS_LIMIT = 3;

export default function AccountAddresses() {
  const navigate = useNavigate();
  // Set only by Register.jsx's post-signup redirect to this page — once that
  // first address is saved, send the new customer on to home instead of
  // leaving them looking at the address list/form they just came from.
  // Later visits to this page (from "My Account") have no such state and
  // behave as a normal address manager.
  const redirectHomeAfterAdd = Boolean(useLocation().state?.redirectHomeAfterAdd);
  const { profile } = useAuth();
  const [addresses, setAddresses] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [recentOrders, setRecentOrders] = useState([]);
  const [ordersError, setOrdersError] = useState(false);

  const load = () =>
    apiClient
      .get("/addresses/")
      .then((response) => {
        setAddresses(response.data.results);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    apiClient
      .get("/orders/")
      .then((response) => {
        setRecentOrders(response.data.results.slice(0, RECENT_ORDERS_LIMIT));
        setOrdersError(false);
      })
      .catch(() => setOrdersError(true));
  }, []);

  const resetForm = () => {
    setEditingAddress(null);
    setFormError("");
  };

  const handleSubmit = async (values) => {
    setIsSaving(true);
    try {
      if (editingAddress) {
        await apiClient.patch(`/addresses/${editingAddress.id}/`, values);
      } else {
        await apiClient.post("/addresses/", values);
        if (redirectHomeAfterAdd) {
          navigate("/");
          return;
        }
      }
      resetForm();
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't save this address — please check the fields and try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this address?")) return;
    try {
      await apiClient.delete(`/addresses/${id}/`);
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't delete this address — please try again."));
    }
  };

  return (
    <div>
      <Breadcrumbs items={[{ label: "My Account" }]} />
      <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-brand-dark mb-6">Your account</h1>

      {profile && (
        <div className="border rounded-xl p-4 mb-8 bg-white shadow-sm">
          <h2 className="font-medium text-brand-dark mb-2">Basic details</h2>
          <p className="text-sm text-gray-700">{profile.name}</p>
          <p className="text-sm text-gray-600">{profile.email}</p>
          {profile.phone && <p className="text-sm text-gray-600">{profile.phone}</p>}
        </div>
      )}

      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-medium text-brand-dark">Recent orders</h2>
          <Link to="/account/orders" className="text-sm text-brand-forest hover:underline">
            View all orders
          </Link>
        </div>
        {ordersError && (
          <p className="text-red-600 text-sm mb-2">Couldn't load your orders — please try again later.</p>
        )}
        <div className="grid gap-3">
          {recentOrders.map((order) => (
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
              </div>
            </Link>
          ))}
          {recentOrders.length === 0 && !ordersError && (
            <p className="text-gray-500 text-sm">You haven't placed any orders yet.</p>
          )}
        </div>
      </div>

      <h2 className="font-medium text-brand-dark mb-2">Your addresses</h2>

      {loadError && <p className="text-red-600 mb-4">Couldn't load your addresses — please try again later.</p>}

      <div className="grid gap-4 mb-8">
        {addresses.map((address) => (
          <div key={address.id} className="border rounded-xl p-4 flex justify-between items-start gap-4 bg-white shadow-sm">
            <div>
              <p className="font-medium text-brand-dark">
                {address.full_name} {address.is_default && (
                  <span className="ml-2 text-xs bg-brand-aqua/20 text-brand-forest px-2 py-0.5 rounded-full align-middle">Default</span>
                )}
              </p>
              <p className="text-sm text-gray-600">{address.phone}</p>
              <p className="text-sm text-gray-600">
                {address.line1}{address.line2 && `, ${address.line2}`}, {address.city}, {address.state} {address.pincode}
              </p>
            </div>
            <div className="flex gap-3 shrink-0">
              <button onClick={() => setEditingAddress(address)} className="text-brand-forest hover:underline text-sm">Edit</button>
              <button onClick={() => handleDelete(address.id)} className="text-red-600 hover:underline text-sm">Delete</button>
            </div>
          </div>
        ))}
        {addresses.length === 0 && !loadError && (
          <p className="text-gray-500 text-sm">No saved addresses yet — add one below.</p>
        )}
      </div>

      <AddressForm
        key={editingAddress?.id ?? "new"}
        title={editingAddress ? "Edit address" : "Add a new address"}
        initialValues={
          editingAddress && {
            full_name: editingAddress.full_name, phone: editingAddress.phone,
            line1: editingAddress.line1, line2: editingAddress.line2,
            city: editingAddress.city, state: editingAddress.state,
            pincode: editingAddress.pincode, is_default: editingAddress.is_default,
          }
        }
        onSubmit={handleSubmit}
        onCancel={editingAddress ? resetForm : undefined}
        isSaving={isSaving}
        error={formError}
        submitLabel={editingAddress ? "Save changes" : "Add address"}
      />
      </div>
    </div>
  );
}
