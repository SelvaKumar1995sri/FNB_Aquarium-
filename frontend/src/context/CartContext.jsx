import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { customerApiClient } from "../api/customerClient";
import { useCustomerAuth } from "./CustomerAuthContext";

const CartContext = createContext(null);

const EMPTY_CART = { id: null, items: [], subtotal: "0.00" };

export function CartProvider({ children }) {
  const { isAuthenticated: isCustomerAuthenticated } = useCustomerAuth();
  const [cart, setCart] = useState(EMPTY_CART);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!isCustomerAuthenticated) {
      setCart(EMPTY_CART);
      return Promise.resolve();
    }
    setIsLoading(true);
    return customerApiClient
      .get("/cart/")
      .then((response) => setCart(response.data))
      .finally(() => setIsLoading(false));
  }, [isCustomerAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = async (productId, quantity = 1) => {
    const response = await customerApiClient.post("/cart/items/", { product: productId, quantity });
    setCart(response.data);
  };

  const updateItem = async (itemId, quantity) => {
    const response = await customerApiClient.patch(`/cart/items/${itemId}/`, { quantity });
    setCart(response.data);
  };

  const removeItem = async (itemId) => {
    const response = await customerApiClient.delete(`/cart/items/${itemId}/`);
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
