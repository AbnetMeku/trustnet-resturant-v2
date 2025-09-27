import axios from "axios";

const BASE_URL = "/api";

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

// ------------------ HELPER ------------------
const handleError = (error, fallback = "Request failed") => {
  throw new Error(error.response?.data?.msg || fallback);
};

// ------------------ STORE STOCK ------------------
export const getStoreStock = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/store-stock`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch store stock");
  }
};

// ------------------ STATION STOCK ------------------
export const getStationStock = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/station-stock`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch station stock");
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
    handleError(error, "Failed to create purchase");
  }
};

export const getPurchases = async (token = null, includeDeleted = false) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/purchases`, {
      headers: getAuthHeader(token),
    });
    return includeDeleted ? res.data : res.data.filter(p => p.status !== "Deleted");
  } catch (error) {
    handleError(error, "Failed to fetch purchases");
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
    handleError(error, "Failed to update purchase");
  }
};

export const deletePurchase = async (purchaseId, token = null) => {
  try {
    const res = await axios.delete(`${BASE_URL}/inventory/purchase/${purchaseId}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to delete purchase");
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
    handleError(error, "Failed to create transfer");
  }
};

export const getTransfers = async (token = null, includeDeleted = false) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/transfers`, {
      headers: getAuthHeader(token),
    });
    return includeDeleted ? res.data : res.data.filter(t => t.status !== "Deleted");
  } catch (error) {
    handleError(error, "Failed to fetch transfers");
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
    handleError(error, "Failed to update transfer");
  }
};

export const deleteTransfer = async (transferId, token = null) => {
  try {
    const res = await axios.delete(`${BASE_URL}/inventory/transfer/${transferId}`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to delete transfer");
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
    handleError(error, "Failed to fetch menu items");
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
    handleError(error, "Failed to fetch stations");
  }
};

// ------------------ AVAILABLE ITEMS (for transfer) ------------------
export const getAvailableItems = async (token = null) => {
  try {
    const res = await axios.get(`${BASE_URL}/inventory/available-items`, {
      headers: getAuthHeader(token),
    });
    return res.data;
  } catch (error) {
    handleError(error, "Failed to fetch available items");
  }
};
// ------------------ STATION STOCK WITH SALES (LIVE + SNAPSHOT) ------------------
export const getStationStockWithSales = async ({ station = null, date = null } = {}, token = null) => {
  try {
    const params = {};
    if (station) params.station = station;
    if (date) params.date = date; // YYYY-MM-DD

    const res = await axios.get(`${BASE_URL}/inventory/station-stock-with-sales`, {
      headers: getAuthHeader(token),
      params,
    });

    // Ensure proper numeric values
    const data = res.data.map(item => ({
      ...item,
      start_of_day_quantity: Number(item.start_of_day_quantity),
      sold_quantity: Number(item.sold_quantity),
      remaining_quantity: Number(item.remaining_quantity)
    }));

    return data;
  } catch (error) {
    handleError(error, "Failed to fetch station stock with sales");
  }
};


