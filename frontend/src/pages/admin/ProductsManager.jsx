import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";

export default function ProductsManager() {
  const [products, setProducts] = useState([]);
  const [productsError, setProductsError] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", category: "", price: "", description: "" });
  const [formError, setFormError] = useState("");

  const load = () =>
    apiClient
      .get("/products/")
      .then((response) => {
        setProducts(response.data.results);
        setProductsError(false);
      })
      .catch(() => setProductsError(true));

  useEffect(() => {
    load();
    apiClient
      .get("/categories/")
      .then((response) => {
        setCategories(response.data.results);
        setCategoriesError(false);
      })
      .catch(() => setCategoriesError(true));
  }, []);

  const describeError = (error, fallback) => {
    const data = error.response?.data;
    if (data && typeof data === "object") {
      const detail = Object.values(data).flat().filter(Boolean).join(" ");
      if (detail) return detail;
    }
    return fallback;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await apiClient.post("/products/", { ...form, category: Number(form.category), price: Number(form.price) });
      setForm({ name: "", slug: "", category: "", price: "", description: "" });
      setFormError("");
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't save the product — please check the fields and try again."));
    }
  };

  const handleDelete = async (slug) => {
    try {
      await apiClient.delete(`/products/${slug}/`);
      setFormError("");
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't delete the product — please try again."));
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Products</h1>
      {categoriesError && (
        <p className="text-red-600">Couldn't load categories — please try again later.</p>
      )}
      <form onSubmit={handleSubmit} className="grid gap-2 mb-6 max-w-md">
        <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-3 py-2" />
        <input required placeholder="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="border rounded px-3 py-2" />
        <select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border rounded px-3 py-2">
          <option value="">Select category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <input required type="number" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="border rounded px-3 py-2" />
        <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border rounded px-3 py-2" />
        <button type="submit" className="bg-brand-dark text-white rounded px-4 py-2">Add Product</button>
      </form>
      {formError && <p className="text-red-600 mb-4">{formError}</p>}
      {productsError && (
        <p className="text-red-600">Couldn't load products — please try again later.</p>
      )}
      <table className="w-full text-left">
        <thead><tr><th>Name</th><th>Price</th><th></th></tr></thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-t">
              <td>{product.name}</td>
              <td>₹{product.price}</td>
              <td><button onClick={() => handleDelete(product.slug)} className="text-red-600">Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
