import axios from "axios";

const BASE_URL = "http://localhost:5000";

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

// ------------------ GET ------------------
export const getMenuItems = async (filters = {}, token = null) => {
  // filters can have station_id, subcategory_id
  const params = {};
  if (filters.station_id) params.station_id = filters.station_id;
  if (filters.subcategory_id) params.subcategory_id = filters.subcategory_id;

  const res = await axios.get(`${BASE_URL}/menu-items`, {
    headers: getAuthHeader(token),
    params,
  });
  return res.data; // Each menu item should now include vip_price
};

export const getMenuItemById = async (id, token = null) => {
  const res = await axios.get(`${BASE_URL}/menu-items/${id}`, {
    headers: getAuthHeader(token),
  });
  return res.data; // includes vip_price too
};

// ------------------ CREATE ------------------
export const createMenuItem = async (menuItemData, token = null) => {
  // menuItemData = { name, description, price, vip_price, station_id, subcategory_id, is_available, image_url }
  const res = await axios.post(`${BASE_URL}/menu-items/`, menuItemData, {
    headers: {
      ...getAuthHeader(token),
      "Content-Type": "application/json",
    },
  });
  return res.data;
};

// ------------------ UPDATE ------------------
export const updateMenuItem = async (id, menuItemData, token = null) => {
  // menuItemData = { name, description, price, vip_price, station_id, subcategory_id, is_available, image_url }
  const res = await axios.put(`${BASE_URL}/menu-items/${id}`, menuItemData, {
    headers: {
      ...getAuthHeader(token),
      "Content-Type": "application/json",
    },
  });
  return res.data;
};

// ------------------ DELETE ------------------
export const deleteMenuItem = async (id, token = null) => {
  const res = await axios.delete(`${BASE_URL}/menu-items/${id}`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};
