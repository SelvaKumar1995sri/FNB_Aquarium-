import { useState } from "react";

import { apiClient } from "../../api/client";

export default function InquiryForm({ type = "general", product = null, extraFields = [] }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [extra, setExtra] = useState({});
  const [status, setStatus] = useState("idle");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("submitting");
    try {
      await apiClient.post("/inquiries/", {
        ...form,
        ...extra,
        type,
        product: product?.id ?? null,
      });
      setStatus("success");
      setForm({ name: "", phone: "", email: "", message: "" });
      setExtra({});
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return <p className="text-green-700">Thanks! We'll get back to you shortly.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 max-w-md">
      <input
        required
        placeholder="Your name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className="border rounded px-3 py-2"
      />
      <input
        required
        placeholder="Phone number"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        className="border rounded px-3 py-2"
      />
      <input
        type="email"
        placeholder="Email (optional)"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        className="border rounded px-3 py-2"
      />
      {extraFields.map((field) => (
        <input
          key={field.name}
          required={field.required !== false}
          placeholder={field.label}
          value={extra[field.name] || ""}
          onChange={(e) => setExtra({ ...extra, [field.name]: e.target.value })}
          className="border rounded px-3 py-2"
        />
      ))}
      <textarea
        required
        placeholder="Message"
        value={form.message}
        onChange={(e) => setForm({ ...form, message: e.target.value })}
        className="border rounded px-3 py-2"
        rows={4}
      />
      <button type="submit" disabled={status === "submitting"} className="bg-brand-dark text-white rounded px-4 py-2">
        {status === "submitting" ? "Sending..." : "Send Inquiry"}
      </button>
      {status === "error" && <p className="text-red-600">Something went wrong. Please try again.</p>}
    </form>
  );
}
