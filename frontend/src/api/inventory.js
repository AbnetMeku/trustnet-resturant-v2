import axios from "axios";

const BASE_URL = "/api";

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

// ------------------ STORE STOCK ------------------
export const getStoreStock = async (token = null) => {
  const res = await axios.get(`${BASE_URL}/inventory/stock`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

// ------------------ STATION STOCK ------------------
export const getStationStock = async (stationId, token = null) => {
  const res = await axios.get(`${BASE_URL}/inventory/stock?station_id=${stationId}`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

// ------------------ PURCHASES ------------------
export const createPurchase = async (purchaseData, token = null) => {
  const res = await axios.post(`${BASE_URL}/inventory/purchase`, purchaseData, {
    headers: {
      ...getAuthHeader(token),
      "Content-Type": "application/json",
    },
  });
  return res.data;
};

export const getPurchases = async (token = null) => {
  const res = await axios.get(`${BASE_URL}/inventory/purchases`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const deletePurchase = async (purchaseId, token = null) => {
  const res = await axios.delete(`${BASE_URL}/inventory/purchase/${purchaseId}`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

// ------------------ TRANSFERS ------------------
export const createTransfer = async (transferData, token = null) => {
  const res = await axios.post(`${BASE_URL}/inventory/transfer`, transferData, {
    headers: {
      ...getAuthHeader(token),
      "Content-Type": "application/json",
    },
  });
  return res.data;
};

export const getTransfers = async (token = null) => {
  const res = await axios.get(`${BASE_URL}/inventory/transfers`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};

export const deleteTransfer = async (transferId, token = null) => {
  const res = await axios.delete(`${BASE_URL}/inventory/transfer/${transferId}`, {
    headers: getAuthHeader(token),
  });
  return res.data;
};
