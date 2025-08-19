import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FaPlus, FaEdit, FaTrash } from "react-icons/fa";
import { toast } from "react-hot-toast";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from "@/api/categories";
import {
  getSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory
} from "@/api/subcategories";
import {
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem
} from "@/api/menu_item";
import { getStations } from "@/api/stations";

export default function MenuManagement() {
  const [tab, setTab] = useState("categories");

  // Categories / Subcategories
  const [categories, setCategories] = useState([]);
  const [categoryForm, setCategoryForm] = useState({ id: null, name: "" });

  const [subcategories, setSubcategories] = useState([]);
  const [subcategoryForm, setSubcategoryForm] = useState({
    id: null,
    name: "",
    category_id: ""
  });

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
    price_vip: "", // NEW
    station_id: "",
    subcategory_id: "",
    is_available: true,
    image_url: ""
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);

  // Filters (Menu tab)
  const [filters, setFilters] = useState({
    categoryId: "",
    subcategoryId: "",
    availability: ""
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
        getMenuItems()
      ]);
      setCategories(cats);
      setSubcategories(subs);
      setStations(sts);
      setMenuItems(items);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load data");
    }
  };

  const handleChange = (form, setForm) => (e) => {
    const { name, value, type, checked } = e.target;
    if (type === "checkbox") setForm({ ...form, [name]: checked });
    else setForm({ ...form, [name]: value });
  };

  // ---------------- CREATE / UPDATE ----------------
  const handleSubmitCategory = async () => {
    try {
      if (categoryForm.id)
        await updateCategory(categoryForm.id, { name: categoryForm.name });
      else await createCategory({ name: categoryForm.name });

      toast.success(categoryForm.id ? "Category updated" : "Category created");
      setCategoryForm({ id: null, name: "" });
      setModalOpen(false);
      fetchAll();
    } catch (err) {
      toast.error("Failed to save category");
      console.error(err);
    }
  };

  const handleSubmitSubcategory = async () => {
    try {
      const payload = {
        name: subcategoryForm.name,
        category_id: parseInt(subcategoryForm.category_id)
      };
      if (subcategoryForm.id)
        await updateSubcategory(subcategoryForm.id, payload);
      else await createSubcategory(payload);

      toast.success(
        subcategoryForm.id ? "Subcategory updated" : "Subcategory created"
      );
      setSubcategoryForm({ id: null, name: "", category_id: "" });
      setModalOpen(false);
      fetchAll();
    } catch (err) {
      toast.error("Failed to save subcategory");
      console.error(err);
    }
  };

  const handleSubmitMenuItem = async () => {
    try {
      const payload = {
        name: menuForm.name,
        description: menuForm.description,
        price: parseFloat(menuForm.price),
        // Only include price_vip if provided
        ...(menuForm.price_vip !== "" && {
          price_vip: parseFloat(menuForm.price_vip)
        }),
        station_id: parseInt(menuForm.station_id),
        subcategory_id: parseInt(menuForm.subcategory_id),
        is_available: menuForm.is_available,
        image_url: menuForm.image_url || ""
      };

      if (menuForm.id) await updateMenuItem(menuForm.id, payload);
      else await createMenuItem(payload);

      toast.success(menuForm.id ? "Menu item updated" : "Menu item created");

      setMenuForm({
        id: null,
        name: "",
        description: "",
        price: "",
        price_vip: "",
        station_id: "",
        subcategory_id: "",
        is_available: true,
        image_url: ""
      });
      setModalOpen(false);
      setCurrentItem(null);
      fetchAll();
    } catch (err) {
      toast.error("Failed to save menu item");
      console.error(err);
    }
  };

  // ---------------- EDIT ----------------
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
        price_vip: item.price_vip ?? "", // NEW
        station_id: item.station_id,
        subcategory_id: item.subcategory_id,
        is_available: item.is_available,
        image_url: item.image_url || ""
      });

    setCurrentItem(item);
    setModalOpen(true);
  };

  // ---------------- DELETE ----------------
  const handleDelete = async (id, deleteFunc) => {
    if (!window.confirm("Are you sure?")) return;
    try {
      await deleteFunc(id);
      toast.success("Deleted successfully");
      fetchAll();
    } catch (err) {
      toast.error("Failed to delete");
      console.error(err);
    }
  };

  // ---------------- FILTERS ----------------
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

  // ---------------- RENDER ----------------
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
        price_vip: "",
        station_id: "",
        subcategory_id: "",
        is_available: true,
        image_url: ""
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
                subcategoryId: ""
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
                    onClick={() => handleDelete(cat.id, deleteCategory)}
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
                        handleDelete(sc.id, deleteSubcategory)
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
              {/* Base price in upper-left */}
              <div className="absolute top-2 left-2 bg-white dark:bg-gray-800 px-2 py-1 font-bold rounded shadow">
                ${item.price}
              </div>

              {/* Availability LED in upper-right */}
              <div
                className={`absolute top-2 right-2 w-3 h-3 rounded-full ${
                  item.is_available ? "bg-green-500" : "bg-red-500"
                } shadow`}
              />

              {/* Image / placeholder */}
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="w-full h-32 object-cover"
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

                {/* VIP price (if any) */}
                {item.price_vip != null && (
                  <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                    VIP: ${item.price_vip}
                  </p>
                )}

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
                    onClick={() => handleDelete(item.id, deleteMenuItem)}
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
                      name="price_vip"
                      value={menuForm.price_vip || ""}
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
                    type="text"
                    name="image_url"
                    value={menuForm.image_url || ""}
                    onChange={handleChange(menuForm, setMenuForm)}
                    placeholder="Image URL"
                    className="border px-2 py-1 rounded dark:bg-gray-700 dark:text-gray-100"
                  />
                  {menuForm.image_url && (
                    <img
                      src={menuForm.image_url}
                      alt="Preview"
                      className="w-32 h-32 object-cover my-2"
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
    </div>
  );
}
