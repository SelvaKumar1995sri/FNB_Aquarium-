import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";

export default function CategoriesManager() {
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "" });

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    await apiClient.post("/categories/", form);
    setForm({ name: "", slug: "" });
    load();
  };

  const handleDelete = async (slug) => {
    await apiClient.delete(`/categories/${slug}/`);
    load();
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Categories</h1>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
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
        <button type="submit" className="bg-brand-dark text-white rounded px-4 py-2">Add</button>
      </form>
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
