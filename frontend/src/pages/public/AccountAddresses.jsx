import { useEffect, useState } from "react";

import { customerApiClient } from "../../api/customerClient";
import { describeError } from "../../api/describeError";

const EMPTY_FORM = { full_name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", is_default: false };

export default function AccountAddresses() {
  const [addresses, setAddresses] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const load = () =>
    customerApiClient
      .get("/addresses/")
      .then((response) => {
        setAddresses(response.data.results);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError("");
  };

  const startEdit = (address) => {
    setForm({
      full_name: address.full_name, phone: address.phone, line1: address.line1, line2: address.line2,
      city: address.city, state: address.state, pincode: address.pincode, is_default: address.is_default,
    });
    setEditingId(address.id);
    setFormError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      if (editingId) {
        await customerApiClient.patch(`/addresses/${editingId}/`, form);
      } else {
        await customerApiClient.post("/addresses/", form);
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
      await customerApiClient.delete(`/addresses/${id}/`);
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't delete this address — please try again."));
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-brand-dark mb-6">Your addresses</h1>

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
              <button onClick={() => startEdit(address)} className="text-brand-forest hover:underline text-sm">Edit</button>
              <button onClick={() => handleDelete(address.id)} className="text-red-600 hover:underline text-sm">Delete</button>
            </div>
          </div>
        ))}
        {addresses.length === 0 && !loadError && (
          <p className="text-gray-500 text-sm">No saved addresses yet — add one below.</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-6 grid gap-3 shadow-sm">
        <h2 className="font-medium text-brand-dark">{editingId ? "Edit address" : "Add a new address"}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <input required placeholder="Full name" value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-aqua" />
          <input required type="tel" placeholder="Phone" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-aqua" />
        </div>
        <input required placeholder="Address line 1" value={form.line1}
          onChange={(e) => setForm({ ...form, line1: e.target.value })}
          className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-aqua" />
        <input placeholder="Address line 2 (optional)" value={form.line2}
          onChange={(e) => setForm({ ...form, line2: e.target.value })}
          className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-aqua" />
        <div className="grid sm:grid-cols-3 gap-3">
          <input required placeholder="City" value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-aqua" />
          <input required placeholder="State" value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-aqua" />
          <input required placeholder="Pincode" value={form.pincode}
            onChange={(e) => setForm({ ...form, pincode: e.target.value })}
            className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-aqua" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={form.is_default}
            onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
          Set as default address
        </label>
        {formError && <p className="text-red-600 text-sm">{formError}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={isSaving}
            className="bg-brand-forest hover:bg-brand-forest/90 disabled:opacity-60 text-white rounded-lg px-4 py-2 font-medium transition-colors">
            {isSaving ? "Saving..." : editingId ? "Save changes" : "Add address"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="border rounded-lg px-4 py-2">Cancel</button>
          )}
        </div>
      </form>
    </div>
  );
}
