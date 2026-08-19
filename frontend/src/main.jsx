import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { AdminNotificationsProvider } from "./context/AdminNotificationsContext";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <AdminNotificationsProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </AdminNotificationsProvider>
    </AuthProvider>
  </StrictMode>,
);
