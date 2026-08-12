import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";
import { describeError } from "../../api/describeError";

const STATUS_OPTIONS = ["new", "contacted", "closed"];

export default function InquiriesManager() {
  const [inquiries, setInquiries] = useState([]);
  const [inquiriesError, setInquiriesError] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [formError, setFormError] = useState("");

  const load = () =>
    apiClient
      .get("/inquiries/", { params: statusFilter ? { status: statusFilter } : {} })
      .then((response) => {
        setInquiries(response.data.results);
        setInquiriesError(false);
      })
      .catch(() => setInquiriesError(true));

  useEffect(() => {
    load();
  }, [statusFilter]);

  const updateStatus = async (id, status) => {
    try {
      await apiClient.patch(`/inquiries/${id}/`, { status });
      setFormError("");
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't update the inquiry status — please try again."));
    }
  };

  return (
    <div className="px-4 py-8">
      <h1 className="text-xl font-semibold mb-4">Inquiries</h1>
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded px-3 py-2 mb-4">
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>{status}</option>
        ))}
      </select>
      {formError && <p className="text-red-600 mb-4">{formError}</p>}
      {inquiriesError && (
        <p className="text-red-600">Couldn't load inquiries — please try again later.</p>
      )}
      <div className="grid gap-3">
        {inquiries.map((inquiry) => (
          <div key={inquiry.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold">{inquiry.name} — {inquiry.phone}</p>
                {inquiry.email && <p className="text-sm text-gray-600">{inquiry.email}</p>}
                <p className="text-sm text-gray-600">{inquiry.type} · {new Date(inquiry.created_at).toLocaleString()}</p>
                {inquiry.product_name && <p className="text-sm text-gray-600">Product: {inquiry.product_name}</p>}
              </div>
              <select value={inquiry.status} onChange={(e) => updateStatus(inquiry.id, e.target.value)} className="border rounded px-2 py-1">
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <p className="mt-2">{inquiry.message}</p>
            {inquiry.tank_size && <p className="text-sm text-gray-600">Tank: {inquiry.tank_size}, {inquiry.tank_shape}</p>}
          </div>
        ))}
        {inquiries.length === 0 && !inquiriesError && <p className="text-gray-500">No inquiries.</p>}
      </div>
    </div>
  );
}
