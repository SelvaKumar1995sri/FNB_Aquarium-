import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";
import { describeError } from "../../api/describeError";
import Modal from "../../components/admin/Modal";
import { buildIndentedOptions, getAncestors } from "../../utils/categoryTree";

export default function CategoriesManager() {
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", parent: "" });
  const [imageFile, setImageFile] = useState(null);
  const [bannerImageFile, setBannerImageFile] = useState(null);
  const [editingSlug, setEditingSlug] = useState(null);
  const [formError, setFormError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

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
    setBannerImageFile(null);
    setEditingSlug(null);
    setFormError("");
  };

  const openNewForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const startEdit = (category) => {
    setForm({
      name: category.name,
      slug: category.slug,
      parent: category.parent ? String(category.parent) : "",
    });
    setImageFile(null);
    setBannerImageFile(null);
    setEditingSlug(category.slug);
    setFormError("");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const body = new FormData();
    body.append("name", form.name);
    body.append("slug", form.slug);
    if (form.parent) body.append("parent", form.parent);
    if (imageFile) body.append("image", imageFile);
    if (bannerImageFile) body.append("banner_image", bannerImageFile);

    const wasEditing = Boolean(editingSlug);
    try {
      if (editingSlug) {
        await apiClient.patch(`/categories/${editingSlug}/`, body);
      } else {
        await apiClient.post("/categories/", body);
      }
      closeForm();
      load();
      setSuccessMessage(wasEditing ? "Category updated." : "Category created.");
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
      setSuccessMessage("Category deleted.");
    } catch (error) {
      setFormError(describeError(error, "Couldn't delete the category — please try again."));
    }
  };

  const editingCategory = categories.find((category) => category.slug === editingSlug);
  const parentOptions = buildIndentedOptions(categories, {
    excludeIds: editingCategory ? [editingCategory.id] : [],
  });

  const pathFor = (category) => {
    if (!category) return "—";
    const ancestors = getAncestors(category, categories);
    return [...ancestors, category].map((entry) => entry.name).join(" > ");
  };

  return (
    <div className="px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Categories</h1>
        <button
          type="button"
          onClick={openNewForm}
          className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2"
        >
          + New Category
        </button>
      </div>
      {categoriesError && (
        <p className="text-red-600 mb-4">Couldn't load categories — please try again later.</p>
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
              <td>{pathFor(categories.find((c) => c.id === category.parent))}</td>
              <td className="flex gap-2">
                <button onClick={() => startEdit(category)} className="text-blue-600">Edit</button>
                <button onClick={() => handleDelete(category.slug)} className="text-red-600">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isFormOpen && (
        <Modal title={editingSlug ? "Edit Category" : "New Category"} onClose={closeForm}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
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
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <label className="flex flex-col text-sm text-gray-600">
              Image (grid tile thumbnail)
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files[0] || null)}
                className="border rounded px-3 py-2"
              />
            </label>
            <label className="flex flex-col text-sm text-gray-600">
              Banner image (shown on the category&apos;s own page)
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setBannerImageFile(e.target.files[0] || null)}
                className="border rounded px-3 py-2"
              />
            </label>
            {formError && <p className="text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2">
                {editingSlug ? "Save Changes" : "Add"}
              </button>
              <button type="button" onClick={closeForm} className="border rounded px-4 py-2">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {successMessage && (
        <Modal title="Success" onClose={() => setSuccessMessage(null)}>
          <p className="mb-4">{successMessage}</p>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2"
          >
            OK
          </button>
        </Modal>
      )}
    </div>
  );
}
