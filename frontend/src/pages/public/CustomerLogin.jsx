import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useCustomerAuth } from "../../context/CustomerAuthContext";

export default function CustomerLogin() {
  const { login, isAuthenticated } = useCustomerAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to="/account/addresses" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate("/account/addresses");
    } catch {
      setError("Invalid email or password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-brand-light px-4 py-12">
      <form
        onSubmit={handleSubmit}
        className="relative bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm grid gap-4 border border-black/5"
      >
        <Link
          to="/"
          aria-label="Close"
          className="absolute top-3 right-3 p-2 text-xl leading-none text-gray-400 hover:text-brand-dark"
        >
          &times;
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-brand-dark">Welcome back</h1>
          <p className="text-sm text-gray-500 mt-1">Log in to manage your addresses and orders.</p>
        </div>
        <input
          required
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-aqua"
        />
        <input
          required
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-aqua"
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-brand-forest hover:bg-brand-forest/90 disabled:opacity-60 text-white rounded-lg px-4 py-2.5 font-medium transition-colors"
        >
          {isSubmitting ? "Logging in..." : "Log in"}
        </button>
        <p className="text-sm text-gray-500 text-center">
          New here? <Link to="/register" className="text-brand-forest hover:underline">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
