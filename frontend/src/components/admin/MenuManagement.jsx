import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FaPlus, FaEdit, FaTrash } from "react-icons/fa";
import { toast } from "react-hot-toast";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/api/categories";
import {
  getSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} from "@/api/subcategories";
import {
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "@/api/menu_item";
import { getStations } from "@/api/stations";

function ConfirmDialog({ open, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-sm w-full shadow-lg">
        <p className="text-lg mb-4">{message}</p>
        <div className="flex justify-end gap-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MenuManagement() {
  const [tab, setTab] = useState("categories");

  // Categories / Subcategories
  const [categories, setCategories] = useState([]);
  const [categoryForm, setCategoryForm] = useState({ id: null, name: "" });

  const [subcategories, setSubcategories] = useState([]);
  const [subcategoryForm, setSubcategoryForm] = useState({
    id: null,
    name: "",
    category_id: "",
  });

  // Delete confirmation modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, type, deleteFunc, name }

  // Simple filter for Subcategories tab
  const [subcategoryCatFilter, setSubcategoryCatFilter] = useState("");

  // Menu items
  const [menuItems, setMenuItems] = useState([]);
  const [stations, setStations] = useState([]);
  const [menuForm, setMenuForm] = useState({
    id: null,
    name: "",
    description: "",
    price: "",
    vip_price: "",
    station_id: "",
    subcategory_id: "",
    is_available: true,
    image_url: "",
    image_file: null,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);

  // Filters (Menu tab)
  const [filters, setFilters] = useState({
    categoryId: "",
    subcategoryId: "",
    availability: "",
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [cats, subs, sts, items] = await Promise.all([
        getCategories(),
        getSubcategories(),
        getStations(),
        getMenuItems(),
      ]);

      // Convert price and vip_price to numbers
      const normalizedItems = items.map((item) => ({
        ...item,
        price: Number(item.price),
        vip_price: item.vip_price != null ? Number(item.vip_price) : null,
      }));

      setCategories(cats);
      setSubcategories(subs);
      setStations(sts);
      setMenuItems(normalizedItems);
    } catch (e) {
      console.error("Failed to fetch data:", e);
      toast.error("Failed to load data", {
        style: { background: "#ffeded", color: "#d32f2f" },
      });
    }
  };

  const handleChange = (form, setForm) => (e) => {
    const { name, value, type, checked, files } = e.target;
    if (type === "checkbox") {
      setForm({ ...form, [name]: checked });
    } else if (type === "file" && files[0]) {
      // Validate file size (5MB limit) and type
      if (files[0].size > 5 * 1024 * 1024) {
        toast.error("Image size must be less than 5MB", {
          style: { background: "#ffeded", color: "#d32f2f" },
        });
        return;
      }
      if (!["image/jpeg", "image/png"].includes(files[0].type)) {
        toast.error("Only JPG and PNG images are allowed", {
          style: { background: "#ffeded", color: "#d32f2f" },
        });
        return;
      }
      // Resize image and convert to base64
      // Resize image and convert to base64
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 200; // Increased from 100 to 200
          const MAX_HEIGHT = 200; // Increased from 100 to 200
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL(files[0].type, 0.85); // Increased quality from 0.7 to 0.85
          setForm({ ...form, image_file: files[0], image_url: base64 });
        };
      };
      reader.readAsDataURL(files[0]);
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmitCategory = async () => {
    try {
      if (categoryForm.id)
        await updateCategory(categoryForm.id, { name: categoryForm.name });
      else await createCategory({ name: categoryForm.name });
      toast.success(categoryForm.id ? "Category updated" : "Category created", {
        style: { background: "#e0f7fa", color: "#006064" },
      });
      setCategoryForm({ id: null, name: "" });
      setModalOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(
        err?.response?.data?.error || "Failed to save category",
        { style: { background: "#ffeded", color: "#d32f2f" } }
      );
      console.error("Category submit error:", err);
    }
  };

  const handleSubmitSubcategory = async () => {
    try {
      const payload = {
        name: subcategoryForm.name,
        category_id: parseInt(subcategoryForm.category_id),
      };
      if (subcategoryForm.id)
        await updateSubcategory(subcategoryForm.id, payload);
      else await createSubcategory(payload);
      toast.success(
        subcategoryForm.id ? "Subcategory updated" : "Subcategory created",
        { style: { background: "#e0f7fa", color: "#006064" } }
      );
      setSubcategoryForm({ id: null, name: "", category_id: "" });
      setModalOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(
        err?.response?.data?.error || "Failed to save subcategory",
        { style: { background: "#ffeded", color: "#d32f2f" } }
      );
      console.error("Subcategory submit error:", err);
    }
  };

  const handleSubmitMenuItem = async () => {
    try {
      const payload = {
        name: menuForm.name,
        description: menuForm.description,
        price: parseFloat(menuForm.price),
        ...(menuForm.vip_price !== "" && !isNaN(parseFloat(menuForm.vip_price)) && {
          vip_price: parseFloat(menuForm.vip_price),
        }),
        station_id: parseInt(menuForm.station_id),
        subcategory_id: parseInt(menuForm.subcategory_id),
        is_available: menuForm.is_available,
        image_url: menuForm.image_url || "",
      };

      if (menuForm.id) await updateMenuItem(menuForm.id, payload);
      else await createMenuItem(payload);

      toast.success(menuForm.id ? "Menu item updated" : "Menu item created", {
        style: { background: "#e0f7fa", color: "#006064" },
      });

      setMenuForm({
        id: null,
        name: "",
        description: "",
        price: "",
        vip_price: "",
        station_id: "",
        subcategory_id: "",
        is_available: true,
        image_url: "",
        image_file: null,
      });
      setModalOpen(false);
      setCurrentItem(null);
      fetchAll();
    } catch (err) {
      toast.error(
        err?.response?.data?.error || err.message || "Failed to save menu item",
        { style: { background: "#ffeded", color: "#d32f2f" } }
      );
      console.error("Menu item submit error:", err);
    }
  };

  const handleEdit = (item, setForm, type) => {
    if (type === "category") setForm({ id: item.id, name: item.name });
    if (type === "subcategory")
      setForm({ id: item.id, name: item.name, category_id: item.category_id });
    if (type === "menu")
      setForm({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        vip_price: item.vip_price ?? "",
        station_id: item.station_id,
        subcategory_id: item.subcategory_id,
        is_available: item.is_available,
        image_url: item.image_url || "",
        image_file: null,
      });
    setCurrentItem(item);
    setModalOpen(true);
  };

  const confirmDelete = (id, deleteFunc, name, type) => {
    setDeleteTarget({ id, deleteFunc, name, type });
    setConfirmOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTarget.deleteFunc(deleteTarget.id);
      toast.success(`${deleteTarget.type} "${ heaters.deleteTarget.name}" deleted`, {
        style: { background: "#e0f7fa", color: "#006064" },
      });
      setConfirmOpen(false);
      setDeleteTarget(null);
      fetchAll();
    } catch (err) {
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        `Failed to delete ${deleteTarget.type.toLowerCase()}`;
      toast.error(message, { style: { background: "#ffeded", color: "#d32f2f" } });
      console.error("Delete error:", err);
    }
  };

  const cancelDelete = () => {
    setConfirmOpen(false);
    setDeleteTarget(null);
  };

  const filteredMenuItems = menuItems.filter((item) => {
    const itemCategoryId = subcategories.find(
      (sc) => sc.id === item.subcategory_id
    )?.category_id;

    if (filters.categoryId && itemCategoryId !== parseInt(filters.categoryId))
      return false;
    if (
      filters.subcategoryId &&
      item.subcategory_id !== parseInt(filters.subcategoryId)
    )
      return false;
    if (filters.availability === "available" && !item.is_available) return false;
    if (filters.availability === "unavailable" && item.is_available) return false;
    return true;
  });

  const visibleSubcategories = subcategories.filter(
    (sc) =>
      !subcategoryCatFilter ||
      sc.category_id === parseInt(subcategoryCatFilter)
  );

  const openAddModal = () => {
    setCurrentItem(null);
    if (tab === "categories") setCategoryForm({ id: null, name: "" });
    if (tab === "subcategories")
      setSubcategoryForm({ id: null, name: "", category_id: "" });
    if (tab === "menu")
      setMenuForm({
        id: null,
        name: "",
        description: "",
        price: "",
        vip_price: "",
        station_id: "",
        subcategory_id: "",
        is_available: true,
        image_url: "",
        image_file: null,
      });
    setModalOpen(true);
  };

  return (
    <div className="p-4 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
      {/* Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
        <div className="flex space-x-2">
          {["categories", "subcategories", "menu"].map((t) => (
            <Button
              key={t}
              variant={tab === t ? "default" : "outline"}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>
        <Button onClick={openAddModal}>
          <FaPlus className="mr-2" /> Add {tab.slice(0, -1)}
        </Button>
      </div>

      {/* Menu Filters */}
      {tab === "menu" && (
        <div className="flex gap-2 flex-wrap mb-4">
          <select
            value={filters.categoryId}
            onChange={(e) =>
              setFilters({
                ...filters,
                categoryId: e.target.value,
                subcategoryId: "",
              })
            }
            className="border px-2 py-1 rounded dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={filters.subcategoryId}
            onChange={(e) =>
              setFilters({ ...filters, subcategoryId: e.target.value })
            }
            className="border px-2 py-1 rounded dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">All Subcategories</option>
            {subcategories
              .filter(
                (sc) =>
                  !filters.categoryId ||
                  sc.category_id === parseInt(filters.categoryId)
              )
              .map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
          </select>

          <select
            value={filters.availability}
            onChange={(e) =>
              setFilters({ ...filters, availability: e.target.value })
            }
            className="border px-2 py-1 rounded dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">All</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </div>
      )}

      {/* Categories */}
      {tab === "categories" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <Card
              key={cat.id}
              className="hover:scale-105 transform transition-all duration-300 relative group"
            >
              <CardHeader>
                <CardTitle className="text-lg font-bold text-center">
                  {cat.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(cat, setCategoryForm, "category")}
                  >
                    <FaEdit />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      confirmDelete(cat.id, deleteCategory, cat.name, "Category")
                    }
                  >
                    <FaTrash />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Subcategories (with simple Category filter) */}
      {tab === "subcategories" && (
        <>
          <div className="flex gap-2 flex-wrap mb-4">
            <select
              value={subcategoryCatFilter}
              onChange={(e) => setSubcategoryCatFilter(e.target.value)}
              className="border px-2 py-1 rounded dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleSubcategories.map((sc) => (
              <Card
                key={sc.id}
                className="hover:scale-105 transform transition-all duration-300 relative group"
              >
                <CardHeader>
                  <CardTitle className="text-lg font-bold">{sc.name}</CardTitle>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {categories.find((c) => c.id === sc.category_id)?.name}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleEdit(sc, setSubcategoryForm, "subcategory")
                      }
                    >
                      <FaEdit />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        confirmDelete(
                          sc.id,
                          deleteSubcategory,
                          sc.name,
                          "Subcategory"
                        )
                      }
                    >
                      <FaTrash />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Menu Items */}
      {tab === "menu" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredMenuItems.map((item) => (
            <Card
              key={item.id}
              className="hover:scale-105 transform transition-all duration-300 relative group"
            >
              {/* VIP Price Ribbon */}
              {item.vip_price != null && (
                <div className="absolute top-11 left-0 bg-gradient-to-b from-teal-400 via-cyan-500 to-blue-500 px-1 py-1 text-sm font-bold rounded-br-md z-10 animate-none">
                  ${Number(item.vip_price).toFixed(2)}
                </div>
              )}

              {/* Base price in upper-left */}
              <div className="absolute top-0 left-0 bg-white dark:bg-gray-800 px-1 py-1 font-bold rounded shadow text-lg">
                ${Number(item.price).toFixed(2)}
              </div>

              {/* Availability LED in upper-right */}
              <div
                className={`absolute top-2 right-2 w-3 h-3 rounded-full ${
                  item.is_available ? "bg-green-500" : "bg-red-500"
                } shadow`}
              />

              {/* Image / placeholder */}
              {item.image_url && item.image_url.startsWith("data:image/") ? (
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="w-full h-32 object-cover"
                  onError={(e) => {
                    console.error(
                      `Failed to load image for menu item ${item.id} (${item.name})`
                    );
                    toast.error(`Failed to load image for ${item.name}`, {
                      style: { background: "#ffeded", color: "#d32f2f" },
                      id: `image-error-${item.id}`,
                    });
                    e.target.src = "/placeholder.png";
                    e.target.onerror = null;
                  }}
                />
              ) : (
                <div className="w-full h-32 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-300 text-sm">
                  No Image
                </div>
              )}

              <CardContent>
                <CardTitle className="text-lg font-bold truncate">
                  {item.name}
                </CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                  {item.description}
                </p>

                {/* Hover actions */}
                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(item, setMenuForm, "menu")}
                  >
                    <FaEdit />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => confirmDelete(item.id, deleteMenuItem, item.name, "Menu item")}
                  >
                    <FaTrash />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-full max-w-lg shadow-lg overflow-y-auto max-h-[90vh]">
            <h2 className="text-xl font-bold mb-4">
              {currentItem ? "Edit" : "Add"} {tab.slice(0, -1)}
            </h2>

            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (tab === "categories") handleSubmitCategory();
                else if (tab === "subcategories") handleSubmitSubcategory();
                else handleSubmitMenuItem();
              }}
            >
              {tab === "categories" && (
                <input
                  name="name"
                  value={categoryForm.name || ""}
                  onChange={handleChange(categoryForm, setCategoryForm)}
                  placeholder="Category Name"
                  className="border px-2 py-1 rounded dark:bg-gray-700 dark:text-gray-100"
                  required
                />
              )}

              {tab === "subcategories" && (
                <>
                  <input
                    name="name"
                    value={subcategoryForm.name || ""}
                    onChange={handleChange(subcategoryForm, setSubcategoryForm)}
                    placeholder="Subcategory Name"
                    className="border px-2 py-1 rounded dark:bg-gray-700 dark:text-gray-100"
                    required
                  />
                  <select
                    name="category_id"
                    value={subcategoryForm.category_id || ""}
                    onChange={handleChange(subcategoryForm, setSubcategoryForm)}
                    className="border px-2 py-1 rounded dark:bg-gray-700 dark:text-gray-100"
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {tab === "menu" && (
                <>
                  <input
                    name="name"
                    value={menuForm.name || ""}
                    onChange={handleChange(menuForm, setMenuForm)}
                    placeholder="Menu Name"
                    className="border px-2 py-1 rounded dark:bg-gray-700 dark:text-gray-100"
                    required
                  />
                  <textarea
                    name="description"
                    value={menuForm.description || ""}
                    onChange={handleChange(menuForm, setMenuForm)}
                    placeholder="Description"
                    className="border px-2 py-1 rounded dark:bg-gray-700 dark:text-gray-100"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      step="0.01"
                      name="price"
                      value={menuForm.price || ""}
                      onChange={handleChange(menuForm, setMenuForm)}
                      placeholder="Price"
                      className="border px-2 py-1 rounded dark:bg-gray-700 dark:text-gray-100"
                      required
                    />
                    <input
                      type="number"
                      step="0.01"
                      name="vip_price"
                      value={menuForm.vip_price || ""}
                      onChange={handleChange(menuForm, setMenuForm)}
                      placeholder="VIP Price (optional)"
                      className="border px-2 py-1 rounded dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>

                  <select
                    name="station_id"
                    value={menuForm.station_id || ""}
                    onChange={handleChange(menuForm, setMenuForm)}
                    className="border px-2 py-1 rounded dark:bg-gray-700 dark:text-gray-100"
                    required
                  >
                    <option value="">Select Station</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>

                  <select
                    name="subcategory_id"
                    value={menuForm.subcategory_id || ""}
                    onChange={handleChange(menuForm, setMenuForm)}
                    className="border px-2 py-1 rounded dark:bg-gray-700 dark:text-gray-100"
                    required
                  >
                    <option value="">Select Subcategory</option>
                    {subcategories.map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {sc.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="file"
                    name="image_file"
                    accept="image/*"
                    onChange={handleChange(menuForm, setMenuForm)}
                    className="border px-2 py-1 rounded dark:bg-gray-700 dark:text-gray-100"
                  />
                  {menuForm.image_url && menuForm.image_url.startsWith("data:image/") && (
                    <img
                      src={menuForm.image_url}
                      alt="Preview"
                      className="w-32 h-32 object-cover my-2"
                      onError={(e) => {
                        console.error(
                          `Failed to load image preview for menu item ${menuForm.id || 'new'} (${menuForm.name})`
                        );
                        toast.error("Failed to load image preview", {
                          style: { background: "#ffeded", color: "#d32f2f" },
                          id: "image-preview-error",
                        });
                        e.target.src = "/placeholder.png";
                        e.target.onerror = null;
                      }}
                    />
                  )}

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="is_available"
                      checked={menuForm.is_available || false}
                      onChange={handleChange(menuForm, setMenuForm)}
                      className="accent-indigo-500"
                    />{" "}
                    Available
                  </label>
                </>
              )}

              <div className="flex justify-end gap-2 mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setModalOpen(false);
                    setCurrentItem(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {currentItem ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        message={
          deleteTarget
            ? `Are you sure you want to delete ${deleteTarget.type} "${deleteTarget.name}"?`
            : ""
        }
        onConfirm={handleDeleteConfirmed}
        onCancel={cancelDelete}
      />
    </div>
  );
}