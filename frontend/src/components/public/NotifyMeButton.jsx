import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiClient } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

export default function NotifyMeButton({ product }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(product.stock_alert_subscribed ? "subscribed" : "idle");

  const handleClick = async () => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    setStatus("submitting");
    try {
      await apiClient.post("/notifications/stock-alerts/", { product: product.id });
      setStatus("subscribed");
    } catch {
      setStatus("idle");
    }
  };

  if (status === "subscribed") {
    return (
      <button
        type="button"
        disabled
        className="bg-gray-200 text-gray-600 rounded px-4 py-2 font-medium cursor-not-allowed"
      >
        You'll be notified
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "submitting"}
      className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded px-4 py-2 font-medium"
    >
      Notify Me
    </button>
  );
}
