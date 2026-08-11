import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";
import { describeError } from "../../api/describeError";

export default function CategoriesManager() {
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", parent: "" });
  const [imageFile, setImageFile] = useState(null);
  const [editingSlug, setEditingSlug] = useState(null);
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

  const resetForm = () => {
    setForm({ name: "", slug: "", parent: "" });
    setImageFile(null);
    setEditingSlug(null);
    setFormError("");
  };

  const startEdit = (category) => {
    setForm({
      name: category.name,
      slug: category.slug,
      parent: category.parent ? String(category.parent) : "",
    });
    setImageFile(null);
    setEditingSlug(category.slug);
    setFormError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const body = new FormData();
    body.append("name", form.name);
    body.append("slug", form.slug);
    if (form.parent) body.append("parent", form.parent);
    if (imageFile) body.append("image", imageFile);

    try {
      if (editingSlug) {
        await apiClient.patch(`/categories/${editingSlug}/`, body);
      } else {
        await apiClient.post("/categories/", body);
      }
      resetForm();
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't save the category — please check the fields and try again."));
    }
  };

  const handleDelete = async (slug) => {
    if (!window.confirm("Delete this category? This also deletes any subcategories and products under it.")) {
      return;
    }
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
        <select
          value={form.parent}
          onChange={(e) => setForm({ ...form, parent: e.target.value })}
          className="border rounded px-3 py-2"
        >
          <option value="">None (top-level)</option>
          {categories
            .filter((c) => c.slug !== editingSlug)
            .map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
        </select>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files[0] || null)}
          className="border rounded px-3 py-2"
        />
        <button type="submit" className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2">
          {editingSlug ? "Save Changes" : "Add"}
        </button>
        {editingSlug && (
          <button type="button" onClick={resetForm} className="border rounded px-4 py-2">
            Cancel
          </button>
        )}
      </form>
      {formError && <p className="text-red-600 mb-4">{formError}</p>}
      {categoriesError && (
        <p className="text-red-600">Couldn't load categories — please try again later.</p>
      )}
      <table className="w-full text-left">
        <thead>
          <tr><th>Image</th><th>Name</th><th>Slug</th><th>Parent</th><th></th></tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id} className="border-t">
              <td>
                {category.image && (
                  <img src={category.image} alt={category.name} className="w-10 h-10 object-cover rounded" />
                )}
              </td>
              <td>{category.name}</td>
              <td>{category.slug}</td>
              <td>{categories.find((c) => c.id === category.parent)?.name || "—"}</td>
              <td className="flex gap-2">
                <button onClick={() => startEdit(category)} className="text-blue-600">Edit</button>
                <button onClick={() => handleDelete(category.slug)} className="text-red-600">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
