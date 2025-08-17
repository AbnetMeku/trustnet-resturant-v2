import axios from "axios";
const BASE_URL = "http://localhost:5000";

export const getMenuItems = async (token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const res = await axios.get(`${BASE_URL}/menu-items`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.data;
};

export const createMenuItem = async (itemData, token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const res = await axios.post(`${BASE_URL}/menu-items/`, itemData, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.data;
};

export const updateMenuItem = async (id, data, token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const res = await axios.put(`${BASE_URL}/menu-items/${id}`, data, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.data;
};

export const deleteMenuItem = async (id, token = null) => {
  const authToken = token || localStorage.getItem("auth_token");
  const res = await axios.delete(`${BASE_URL}/menu-items/${id}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.data;
};
