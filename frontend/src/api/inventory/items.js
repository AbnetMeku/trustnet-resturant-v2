import axios from "axios";

const BASE_URL = "/api";
const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

const handleError = (error, fallback = "Request failed") => {
  throw new Error(error.response?.data?.msg || fallback);
};

// ============================================================
// INVENTORY ITEMS CRUD
// ============================================================

// Create inventory item
export const createInventoryItem = async (itemData, token = null) => {
  try {
    const res = await axios.post(`${BASE_URL}/inventory/items/`, itemData, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to create inventory item");
  }
};

// Get all inventory items
export const getInventoryItems = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/items/`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch inventory items");
  }
};

// Get single inventory item (with menu links)
export const getInventoryItem = async (id, token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/items/${id}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch inventory item");
  }
};

// Update inventory item
export const updateInventoryItem = async (id, data, token = null) => {
  try {
    const res = await axios.put(`${BASE_URL}/inventory/items/${id}`, data, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to update inventory item");
  }
};

// Delete inventory item
export const deleteInventoryItem = async (id, token = null) => {
  try {
    const res = await axios.delete(`${BASE_URL}/inventory/items/${id}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to delete inventory item");
  }
};

// ============================================================
// MENU LINKS (map menu items to inventory items)
// ============================================================
// Create links (bulk) — send grouped array like:
export const createInventoryLinks = async (inventoryItemId, links, token = null) => {
  try {
    // Flatten grouped links to backend format
    const flattened = links.flatMap(group =>
      group.menu_item_ids.map(menu_item_id => ({
        menu_item_id,
        deduction_ratio: group.deduction_ratio,
      }))
    );

    const res = await axios.post(
      `${BASE_URL}/inventory/items/${inventoryItemId}/links`,
      { links: flattened },
      { headers: { ...getAuthHeader(token), "Content-Type": "application/json" } }
    );
    return res.data;
  } catch (error) {
    handleError(error, "Failed to create inventory links");
  }
};

// Get all links for an inventory item, grouped by deduction ratio
export const getInventoryLinks = async (inventoryItemId, token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/items/${inventoryItemId}/links`, {
      headers: getAuthHeader(token),
    });

    // Group by deduction_ratio
    const grouped = {};
    res.data.forEach(link => {
      const key = link.deduction_ratio;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(link.menu_item_id);
    });

    // Convert to array format: [{ deduction_ratio, menu_item_ids: [] }]
    const result = Object.keys(grouped).map(key => ({
      deduction_ratio: parseFloat(key),
      menu_item_ids: grouped[key],
    }));

    return result;
  } catch (error) {
    handleError(error, "Failed to fetch inventory links");
  }
};

// Update single link
export const updateInventoryLink = async (linkId, data, token = null) => {
  try {
    const res = await axios.put(`${BASE_URL}/inventory/items/links/${linkId}`, data, {
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to update inventory link");
  }
};

// Delete link
export const deleteInventoryLink = async (linkId, token = null) => {
  try {
    const res = await axios.delete(`${BASE_URL}/inventory/items/links/${linkId}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to delete inventory link");
  }
};
