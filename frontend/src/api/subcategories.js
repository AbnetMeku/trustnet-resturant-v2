import axios from "axios";

/**
 * Fetch all subcategories
 */
export const fetchSubcategories = async (token) => {
  try {
    const res = await axios.get("/subcategories/", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    console.error("Error fetching subcategories:", err);
    throw new Error(err.response?.data?.message || "Failed to fetch subcategories");
  }
};

/**
 * Fetch single subcategory by ID
 */
export const fetchSubcategoryById = async (id, token) => {
  try {
    const res = await axios.get(`/subcategories/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    console.error("Error fetching subcategory:", err);
    throw new Error(err.response?.data?.message || "Failed to fetch subcategory");
  }
};

/**
 * Create a new subcategory
 */
export const createSubcategory = async (data, token) => {
  try {
    const res = await axios.post("/subcategories/", data, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    console.error("Error creating subcategory:", err);
    throw new Error(err.response?.data?.message || "Failed to create subcategory");
  }
};

/**
 * Update subcategory by ID
 */
export const updateSubcategory = async (id, data, token) => {
  try {
    const res = await axios.put(`/subcategories/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    console.error("Error updating subcategory:", err);
    throw new Error(err.response?.data?.message || "Failed to update subcategory");
  }
};

/**
 * Delete subcategory by ID
 */
export const deleteSubcategory = async (id, token) => {
  try {
    const res = await axios.delete(`/subcategories/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    console.error("Error deleting subcategory:", err);
    throw new Error(err.response?.data?.message || "Failed to delete subcategory");
  }
};
