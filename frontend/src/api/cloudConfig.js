import axios from "axios";

const BASE_URL = "/api/cloud/config";

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

export const getCloudConfig = async (token = null) => {
  const res = await axios.get(BASE_URL, {
    headers: {
      ...getAuthHeader(token),
    },
  });
  return res.data || {};
};

export const updateCloudConfig = async (payload, token = null) => {
  const res = await axios.put(BASE_URL, payload, {
    headers: {
      ...getAuthHeader(token),
      "Content-Type": "application/json",
    },
  });
  return res.data || {};
};
