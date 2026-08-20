import { useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { describeError } from "../../api/describeError";
import { useAuth } from "../../context/AuthContext";

export default function Register() {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // register() flips isAuthenticated to true, which re-renders this component
  // before handleSubmit's own navigate() below takes effect. Without this
  // guard, that extra render hits the isAuthenticated check and fires a
  // second, stateless redirect that clobbers the redirectHomeAfterAdd state
  // we're about to pass. A ref (not state) so setting it doesn't itself
  // trigger another render in the race.
  const justRegisteredRef = useRef(false);

  if (isAuthenticated && !justRegisteredRef.current) return <Navigate to="/account/addresses" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setIsSubmitting(true);
    try {
      await register({ name: form.name, email: form.email, phone: form.phone, password: form.password });
      justRegisteredRef.current = true;
      navigate("/account/addresses", { state: { redirectHomeAfterAdd: true } });
    } catch (submitError) {
      setError(describeError(submitError, "Couldn't create your account — please check the fields and try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-brand-light px-4 py-12">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md grid gap-4 border border-black/5"
      >
        <div>
          <h1 className="text-2xl font-semibold text-brand-dark">Create your account</h1>
          <p className="text-sm text-gray-500 mt-1">Save addresses, track orders, and check out faster.</p>
        </div>
        <input
          required
          placeholder="Full name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-aqua"
        />
        <input
          required
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-aqua"
        />
        <input
          required
          type="tel"
          placeholder="Phone number"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-aqua"
        />
        <input
          required
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-aqua"
        />
        <input
          required
          type="password"
          placeholder="Confirm password"
          value={form.confirmPassword}
          onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          className="border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-aqua"
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-brand-forest hover:bg-brand-forest/90 disabled:opacity-60 text-white rounded-lg px-4 py-2.5 font-medium transition-colors"
        >
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
        <p className="text-sm text-gray-500 text-center">
          Already have an account? <Link to="/login" className="text-brand-forest hover:underline">Log in</Link>
        </p>
      </form>
    </div>
  );
}
