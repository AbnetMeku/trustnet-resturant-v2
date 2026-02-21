import axios from "axios";

const BASE_URL = "/api/branding";

export const DEFAULT_BRANDING = {
  logo_url: "/logo.png",
  background_url: "/Background.jpeg",
  custom_logo_url: null,
  custom_background_url: null,
};

const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token || localStorage.getItem("auth_token")}`,
});

export const getBrandingSettings = async () => {
  const res = await axios.get(BASE_URL);
  return { ...DEFAULT_BRANDING, ...(res.data || {}) };
};

export const updateBrandingSettings = async (brandingData, token = null) => {
  const res = await axios.put(BASE_URL, brandingData, {
    headers: {
      ...getAuthHeader(token),
      "Content-Type": "application/json",
    },
  });
  return { ...DEFAULT_BRANDING, ...(res.data || {}) };
};

export const uploadBrandingAsset = async (assetType, file, token = null) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await axios.post(`${BASE_URL}/upload/${assetType}`, formData, {
    headers: {
      ...getAuthHeader(token),
    },
  });
  return { ...DEFAULT_BRANDING, ...(res.data || {}) };
};
