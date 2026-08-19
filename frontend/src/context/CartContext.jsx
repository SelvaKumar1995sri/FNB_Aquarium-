import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { apiClient } from "../api/client";
import { useAuth } from "./AuthContext";

const CartContext = createContext(null);

const EMPTY_CART = { id: null, items: [], subtotal: "0.00" };

export function CartProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [cart, setCart] = useState(EMPTY_CART);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!isAuthenticated) {
      setCart(EMPTY_CART);
      return Promise.resolve();
    }
    setIsLoading(true);
    return apiClient
      .get("/cart/")
      .then((response) => setCart(response.data))
      .catch(() => setCart(EMPTY_CART))
      .finally(() => setIsLoading(false));
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = async (productId, quantity = 1) => {
    const response = await apiClient.post("/cart/items/", { product: productId, quantity });
    setCart(response.data);
  };

  const updateItem = async (itemId, quantity) => {
    const response = await apiClient.patch(`/cart/items/${itemId}/`, { quantity });
    setCart(response.data);
  };

  const removeItem = async (itemId) => {
    const response = await apiClient.delete(`/cart/items/${itemId}/`);
    setCart(response.data);
  };

  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, itemCount, isLoading, addItem, updateItem, removeItem, refresh }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
