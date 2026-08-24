import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";
import { describeError } from "../../api/describeError";
import Modal from "../../components/admin/Modal";
import { buildIndentedOptions } from "../../utils/categoryTree";

export default function ProductsManager() {
  const [products, setProducts] = useState([]);
  const [productsError, setProductsError] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    category: "",
    price: "",
    description: "",
    stock_quantity: 0,
    is_featured: false,
  });
  const [editingSlug, setEditingSlug] = useState(null);
  const [formError, setFormError] = useState("");
  const [uploadingFor, setUploadingFor] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

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

  const resetForm = () => {
    setForm({
      name: "",
      slug: "",
      category: "",
      price: "",
      description: "",
      stock_quantity: 0,
      is_featured: false,
    });
    setEditingSlug(null);
    setFormError("");
  };

  const openNewForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const startEdit = (product) => {
    setForm({
      name: product.name,
      slug: product.slug,
      category: product.category ? String(product.category) : "",
      price: String(product.price),
      description: product.description || "",
      stock_quantity: product.stock_quantity,
      is_featured: product.is_featured,
    });
    setEditingSlug(product.slug);
    setFormError("");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      category: Number(form.category),
      price: Number(form.price),
      stock_quantity: Number(form.stock_quantity),
    };
    const wasEditing = Boolean(editingSlug);
    try {
      if (editingSlug) {
        await apiClient.patch(`/products/${editingSlug}/`, payload);
      } else {
        await apiClient.post("/products/", payload);
      }
      closeForm();
      load();
      setSuccessMessage(wasEditing ? "Product updated." : "Product created.");
    } catch (error) {
      if (!editingSlug && error.response?.status === 409) {
        const existing = error.response.data.existing_product;
        const enteredQuantity = payload.stock_quantity;
        if (enteredQuantity <= 0) {
          setFormError(
            `A product named "${existing.name}" already exists in ${existing.category_name}. Enter a positive stock quantity to add to its existing ${existing.stock_quantity} in stock.`
          );
          return;
        }
        const confirmed = window.confirm(
          `A product named "${existing.name}" already exists in ${existing.category_name} with ${existing.stock_quantity} in stock. Add ${enteredQuantity} more to make ${existing.stock_quantity + enteredQuantity}?`
        );
        if (confirmed) {
          try {
            await apiClient.post(`/products/${existing.slug}/add-stock/`, { quantity: enteredQuantity });
            closeForm();
            load();
            setSuccessMessage("Stock added.");
          } catch (addStockError) {
            setFormError(describeError(addStockError, "Couldn't add stock to the existing product — please try again."));
          }
        }
        return;
      }
      setFormError(describeError(error, "Couldn't save the product — please check the fields and try again."));
    }
  };

  const handleDelete = async (slug) => {
    if (!window.confirm("Delete this product?")) {
      return;
    }
    try {
      await apiClient.delete(`/products/${slug}/`);
      setFormError("");
      load();
      setSuccessMessage("Product deleted.");
    } catch (error) {
      setFormError(describeError(error, "Couldn't delete the product — please try again."));
    }
  };

  const handleImageUpload = async (productId, file) => {
    const body = new FormData();
    body.append("product", productId);
    body.append("image", file);
    setUploadingFor(productId);
    try {
      await apiClient.post("/product-images/", body);
      setFormError("");
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't upload the image — please try again."));
    } finally {
      setUploadingFor(null);
    }
  };

  const handleImageDelete = async (imageId) => {
    try {
      await apiClient.delete(`/product-images/${imageId}/`);
      setFormError("");
      load();
    } catch (error) {
      setFormError(describeError(error, "Couldn't delete the image — please try again."));
    }
  };

  const categoryOptions = buildIndentedOptions(categories);

  return (
    <div className="px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Products</h1>
        <button
          type="button"
          onClick={openNewForm}
          className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2"
        >
          + New Product
        </button>
      </div>
      {categoriesError && (
        <p className="text-red-600 mb-4">Couldn't load categories — please try again later.</p>
      )}
      {productsError && (
        <p className="text-red-600 mb-4">Couldn't load products — please try again later.</p>
      )}
      <table className="w-full text-left">
        <thead><tr><th>Name</th><th>Price</th><th>Stock</th><th>Images</th><th></th></tr></thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-t">
              <td>{product.name}</td>
              <td>₹{product.price}</td>
              <td>{product.stock_quantity}{!product.in_stock && <span className="text-red-600 ml-1">(out of stock)</span>}</td>
              <td>
                <div className="flex gap-1 mb-1">
                  {product.images.map((img) => (
                    <div key={img.id} className="relative">
                      <img src={img.image} alt={img.alt_text} className="w-10 h-10 object-cover rounded" />
                      <button
                        onClick={() => handleImageDelete(img.id)}
                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-4 h-4 text-xs leading-none"
                        aria-label="Delete image"
                      >×</button>
                    </div>
                  ))}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingFor === product.id}
                  onChange={(e) => e.target.files[0] && handleImageUpload(product.id, e.target.files[0])}
                  className="text-xs"
                />
              </td>
              <td className="flex gap-2">
                <button onClick={() => startEdit(product)} className="text-blue-600">Edit</button>
                <button onClick={() => handleDelete(product.slug)} className="text-red-600">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isFormOpen && (
        <Modal title={editingSlug ? "Edit Product" : "New Product"} onClose={closeForm}>
          <form onSubmit={handleSubmit} className="grid gap-2">
            <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-3 py-2" />
            <input required placeholder="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="border rounded px-3 py-2" />
            <select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border rounded px-3 py-2">
              <option value="">Select category</option>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <input required type="number" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="border rounded px-3 py-2" />
            <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border rounded px-3 py-2" />
            <label className="flex flex-col text-sm text-gray-600">
              Stock quantity
              <input
                required
                type="number"
                min="0"
                placeholder="Stock quantity"
                value={form.stock_quantity}
                onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                className="border rounded px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} />
              Featured
            </label>
            {formError && <p className="text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="bg-brand-forest hover:bg-brand-forest/90 text-white rounded px-4 py-2">
                {editingSlug ? "Save Changes" : "Add Product"}
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
