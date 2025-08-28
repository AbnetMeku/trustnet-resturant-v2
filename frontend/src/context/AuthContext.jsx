import React, { createContext, useContext, useState } from "react";

const AuthContext = createContext();

// ----------------- Auth Provider ----------------- //
export function AuthProvider({ children }) {
  // Normal user state
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("user")) || null);
  const [authToken, setAuthToken] = useState(localStorage.getItem("auth_token") || null);

  // Station state
  const [stationToken, setStationToken] = useState(localStorage.getItem("station_token") || null);

  // ----------------- Normal user login ----------------- //
  const login = (userData, token) => {
    setUser(userData);
    setAuthToken(token);
    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("auth_token", token);
  };

  // ----------------- Station login ----------------- //
  const loginStation = (token) => {
    setStationToken(token);
    localStorage.setItem("station_token", token);
  };

  // ----------------- Normal user logout ----------------- //
  const logout = () => {
    setUser(null);
    setAuthToken(null);
    setStationToken(null); // also clear station token for unified logout
    localStorage.removeItem("user");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("station_token");
  };

  // ----------------- Station logout (optional separate) ----------------- //
  const logoutStation = () => {
    setStationToken(null);
    localStorage.removeItem("station_token");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authToken,
        stationToken,
        login,
        logout,
        loginStation,
        logoutStation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ----------------- Custom hook ----------------- //
export const useAuth = () => useContext(AuthContext);
