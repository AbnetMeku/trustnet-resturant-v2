import axios from "axios";

const BASE_URL = "/api";

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

// ------------------ STORE STOCK ------------------
export const getStoreStock = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/stock`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to fetch store stock");
  }
};

// ------------------ STATION STOCK ------------------
export const getStationStock = async (stationId, token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/stock?station_id=${stationId}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to fetch station stock");
  }
};

// ------------------ PURCHASES ------------------
export const createPurchase = async (purchaseData, token = null) => {
  try {
    const res = await axios.post(`${BASE_URL}/inventory/purchase`, purchaseData, {
      headers: {
        ...getAuthHeader(token),
        "Content-Type": "application/json",
      },
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to create purchase");
  }
};

export const getPurchases = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/purchases`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to fetch purchases");
  }
};

export const updatePurchase = async (purchaseId, updateData, token = null) => {
  try {
    const res = await axios.put(`${BASE_URL}/inventory/purchase/${purchaseId}`, updateData, {
      headers: {
        ...getAuthHeader(token),
        "Content-Type": "application/json",
      },
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to update purchase");
  }
};

export const deletePurchase = async (purchaseId, token = null) => {
  try {
    const res = await axios.delete(`${BASE_URL}/inventory/purchase/${purchaseId}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to delete purchase");
  }
};

// ------------------ TRANSFERS ------------------
export const createTransfer = async (transferData, token = null) => {
  try {
    const res = await axios.post(`${BASE_URL}/inventory/transfer`, transferData, {
      headers: {
        ...getAuthHeader(token),
        "Content-Type": "application/json",
      },
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to create transfer");
  }
};

export const getTransfers = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/transfers`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to fetch transfers");
  }
};

export const updateTransfer = async (transferId, updateData, token = null) => {
  try {
    const res = await axios.put(`${BASE_URL}/inventory/transfer/${transferId}`, updateData, {
      headers: {
        ...getAuthHeader(token),
        "Content-Type": "application/json",
      },
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to update transfer");
  }
};

export const deleteTransfer = async (transferId, token = null) => {
  try {
    const res = await axios.delete(`${BASE_URL}/inventory/transfer/${transferId}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to delete transfer");
  }
};

// ------------------ MENU ITEMS ------------------
export const getMenuItems = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/menu/items`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to fetch menu items");
  }
};

// ------------------ STATIONS ------------------
export const getStations = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/stations`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || "Failed to fetch stations");
  }
};

// ------------------ AVAILABLE ITEMS (for transfer) ------------------
export const getAvailableItems = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/available-items`, {
      headers: getAuthHeader(token),
    });
    return res.data; // expected: [{ menu_item_id, menu_item, available_quantity }, ...]
  } catch (error) {
    throw new Error(
      error.response?.data?.msg || "Failed to fetch available items"
    );
  }
};
