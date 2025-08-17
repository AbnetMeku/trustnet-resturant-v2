import axios from "axios";

/**
 * Fetch all categories
 */
export const fetchCategories = async (token) => {
  try {
    const res = await axios.get("/categories/", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    console.error("Error fetching categories:", err);
    throw new Error(err.response?.data?.message || "Failed to fetch categories");
  }
};

/**
 * Fetch single category by ID
 */
export const fetchCategoryById = async (id, token) => {
  try {
    const res = await axios.get(`/categories/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    console.error("Error fetching category:", err);
    throw new Error(err.response?.data?.message || "Failed to fetch category");
  }
};

/**
 * Create a new category
 */
export const createCategory = async (data, token) => {
  try {
    const res = await axios.post("/categories/", data, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    console.error("Error creating category:", err);
    throw new Error(err.response?.data?.message || "Failed to create category");
  }
};

/**
 * Update category by ID
 */
export const updateCategory = async (id, data, token) => {
  try {
    const res = await axios.put(`/categories/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    console.error("Error updating category:", err);
    throw new Error(err.response?.data?.message || "Failed to update category");
  }
};

/**
 * Delete category by ID
 */
export const deleteCategory = async (id, token) => {
  try {
    const res = await axios.delete(`/categories/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    console.error("Error deleting category:", err);
    throw new Error(err.response?.data?.message || "Failed to delete category");
  }
};
