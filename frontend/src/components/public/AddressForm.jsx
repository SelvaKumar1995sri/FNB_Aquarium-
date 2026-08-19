import { useState } from "react";

const EMPTY_FORM = { full_name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", is_default: false };

export default function AddressForm({ title, initialValues, onSubmit, onCancel, isSaving, error, submitLabel }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initialValues });

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-6 grid gap-3 shadow-sm">
      {title && <h2 className="font-medium text-brand-dark">{title}</h2>}
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
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={isSaving}
          className="bg-brand-forest hover:bg-brand-forest/90 disabled:opacity-60 text-white rounded-lg px-4 py-2 font-medium transition-colors">
          {isSaving ? "Saving..." : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="border rounded-lg px-4 py-2">Cancel</button>
        )}
      </div>
    </form>
  );
}
