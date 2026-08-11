import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";

export default function CategoriesManager() {
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "" });
  const [formError, setFormError] = useState("");

  const load = () =>
    apiClient
      .get("/categories/")
      .then((response) => {
        setCategories(response.data.results);
        setCategoriesError(false);
      })
      .catch(() => setCategoriesError(true));

  useEffect(() => {
    load();
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
      await apiClient.post("/categories/", form);
      setForm({ name: "", slug: "" });
      setFormError("");
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't save the category — please check the fields and try again."));
    }
  };

  const handleDelete = async (slug) => {
    try {
      await apiClient.delete(`/categories/${slug}/`);
      setFormError("");
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't delete the category — please try again."));
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Categories</h1>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-6">
        <input
          required
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border rounded px-3 py-2"
        />
        <input
          required
          placeholder="Slug"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          className="border rounded px-3 py-2"
        />
        <button type="submit" className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2">Add</button>
      </form>
      {formError && <p className="text-red-600 mb-4">{formError}</p>}
      {categoriesError && (
        <p className="text-red-600">Couldn't load categories — please try again later.</p>
      )}
      <table className="w-full text-left">
        <thead>
          <tr><th>Name</th><th>Slug</th><th></th></tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id} className="border-t">
              <td>{category.name}</td>
              <td>{category.slug}</td>
              <td><button onClick={() => handleDelete(category.slug)} className="text-red-600">Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
