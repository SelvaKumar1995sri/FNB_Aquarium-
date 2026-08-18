import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { AdminNotificationsProvider } from "./context/AdminNotificationsContext";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { CustomerAuthProvider } from "./context/CustomerAuthContext";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <AdminNotificationsProvider>
        <CustomerAuthProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </CustomerAuthProvider>
      </AdminNotificationsProvider>
    </AuthProvider>
  </StrictMode>,
);
