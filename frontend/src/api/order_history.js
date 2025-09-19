import axios from "axios";

const API_URL = "/api";

const axiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

export const fetchOrderHistory = async (token, filters = {}) => {
  const params = new URLSearchParams(filters);
  const res = await axiosInstance.get(`/order-history/?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const fetchOrderSummary = async (token, filters = {}) => {
  const params = new URLSearchParams(filters);
  const res = await axiosInstance.get(`/order-history/summary?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};
