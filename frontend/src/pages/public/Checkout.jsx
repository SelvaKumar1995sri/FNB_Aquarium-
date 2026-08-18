import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { customerApiClient } from "../../api/customerClient";
import { describeError } from "../../api/describeError";
import { useCart } from "../../context/CartContext";

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function Checkout() {
  const { cart, isLoading } = useCart();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState([]);
  const [addressesError, setAddressesError] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | paying | error
  const [error, setError] = useState("");

  useEffect(() => {
    customerApiClient
      .get("/addresses/")
      .then((response) => {
        const results = response.data.results;
        setAddresses(results);
        const defaultAddress = results.find((address) => address.is_default) || results[0];
        if (defaultAddress) setSelectedAddressId(defaultAddress.id);
      })
      .catch(() => setAddressesError(true));
  }, []);

  const handlePayNow = async () => {
    setStatus("paying");
    setError("");
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setError("Couldn't load the payment window — please check your connection and try again.");
        setStatus("error");
        return;
      }

      const response = await customerApiClient.post("/checkout/", { address: selectedAddressId });
      const { razorpay_order_id, razorpay_key_id, amount } = response.data;

      const razorpay = new window.Razorpay({
        key: razorpay_key_id,
        amount: Math.round(Number(amount) * 100),
        currency: "INR",
        order_id: razorpay_order_id,
        name: "FNB Aquatic Studio",
        handler: () => {
          navigate(`/order-confirmation/${razorpay_order_id}`);
        },
        modal: {
          ondismiss: () => {
            setStatus("idle");
          },
        },
      });
      razorpay.open();
    } catch (err) {
      setError(describeError(err, "Couldn't start checkout — please try again."));
      setStatus("error");
    }
  };

  if (isLoading && cart.items.length === 0) {
    return <div className="p-8">Loading your cart...</div>;
  }

  if (cart.items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-brand-dark mb-3">Your cart is empty</h1>
        <p className="text-gray-500 mb-6">Add something to your cart before checking out.</p>
        <Link to="/products" className="text-brand-forest hover:underline">Browse products</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-brand-dark mb-6">Checkout</h1>

      <section className="mb-8">
        <h2 className="font-medium text-brand-dark mb-3">Delivery address</h2>
        {addressesError && (
          <p className="text-red-600 text-sm mb-2">Couldn't load your addresses — please try again later.</p>
        )}
        {addresses.length === 0 && !addressesError && (
          <p className="text-gray-500 text-sm">
            You don't have any saved addresses yet.{" "}
            <a href="/account/addresses" className="text-brand-forest hover:underline">Add one</a> before checking out.
          </p>
        )}
        <div className="grid gap-2">
          {addresses.map((address) => (
            <label key={address.id} className="border rounded-lg p-3 flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="address"
                checked={selectedAddressId === address.id}
                onChange={() => setSelectedAddressId(address.id)}
                className="mt-1"
              />
              <span className="text-sm">
                <span className="font-medium text-brand-dark">{address.full_name}</span> — {address.phone}
                <br />
                {address.line1}{address.line2 && `, ${address.line2}`}, {address.city}, {address.state} {address.pincode}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-medium text-brand-dark mb-3">Order summary</h2>
        <div className="grid gap-2 mb-3">
          {cart.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>{item.product_name} × {item.quantity}</span>
              <span>₹{item.line_total}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between font-semibold text-brand-dark border-t pt-3">
          <span>Total</span>
          <span>₹{cart.subtotal}</span>
        </div>
      </section>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <button
        type="button"
        onClick={handlePayNow}
        disabled={status === "paying" || !selectedAddressId}
        className="w-full bg-brand-forest hover:bg-brand-forest/90 disabled:opacity-60 text-white rounded-lg px-4 py-3 font-medium transition-colors"
      >
        {status === "paying" ? "Opening payment window..." : "Pay Now"}
      </button>
    </div>
  );
}
