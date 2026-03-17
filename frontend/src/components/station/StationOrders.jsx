import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { fetchKDSOrders, updateOrderItemStatus } from "@/api/kds";
import { formatEatTime } from "@/lib/timezone";
import { toast } from "react-hot-toast";
import { getApiErrorMessage } from "@/lib/apiError";
import { useBranding } from "@/hooks/useBranding";

export default function StationOrders() {
  const { stationToken, logoutStation } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingItems, setUpdatingItems] = useState({});

  const handleStationSessionExpired = useCallback(() => {
    logoutStation();
    navigate("/station-login");
  }, [logoutStation, navigate]);

  const fetchOrders = useCallback(
    async ({ silent = false } = {}) => {
      if (!stationToken) return;
      try {
        if (silent) setIsRefreshing(true);
        else setIsLoading(true);

        const res = await fetchKDSOrders(stationToken);
        res.sort(
          (a, b) =>
            new Date(a.order_created_at).getTime() -
            new Date(b.order_created_at).getTime()
        );

        setOrders(res);
      } catch (err) {
        if (err?.response?.status === 401 || err?.response?.status === 422) {
          toast.error("Session expired. Please login again.");
          handleStationSessionExpired();
          return;
        }
        console.error("Failed to fetch KDS orders:", err);
        toast.error(getApiErrorMessage(err, "Failed to load KDS orders."));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [stationToken, handleStationSessionExpired]
  );

  const updateStatus = async (itemId, status) => {
    if (!stationToken) return;
    try {
      setUpdatingItems((prev) => ({ ...prev, [itemId]: true }));
      await updateOrderItemStatus(stationToken, itemId, status);
      setOrders((prev) =>
        prev.map((order) => ({
          ...order,
          items: order.items.map((item) =>
            item.item_id === itemId ? { ...item, status } : item
          ),
        }))
      );
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 422) {
        toast.error("Session expired. Please login again.");
        handleStationSessionExpired();
        return;
      }
      console.error(`Failed to mark item ${itemId} as ${status}:`, err);
      toast.error(
        getApiErrorMessage(err, `Failed to update item status to '${status}'.`)
      );
    } finally {
      setUpdatingItems((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(() => fetchOrders({ silent: true }), 6000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const pendingOrders = orders
    .map((order) => ({
      ...order,
      items: order.items.filter((item) => item.status === "pending"),
    }))
    .filter((order) => order.items.length > 0);
  const allowMarkUnavailable = Boolean(branding.kds_mark_unavailable_enabled);

  if (isLoading) {
    return (
      <p className="text-center mt-10 text-gray-400 dark:text-gray-500" data-testid="kds-orders-root">
        Loading KDS orders...
      </p>
    );
  }

  if (!pendingOrders.length) {
    return (
      <p className="text-center mt-10 text-gray-400 dark:text-gray-500" data-testid="kds-orders-root">
        ምንም ትዕዛዝ የለም በአሁን ጊዜ
      </p>
    );
  }

  return (
    <div className="h-full p-4" data-testid="kds-orders-root">
      <div className="mb-4 flex items-center justify-end gap-2">
        {isRefreshing && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Refreshing...
          </span>
        )}
        <button
          type="button"
          onClick={() => fetchOrders()}
          data-testid="kds-orders-refresh"
          className="px-3 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {pendingOrders.map((order) => (
          <div
            key={order.order_id}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 flex flex-col space-y-4 transform hover:scale-[1.02] transition-transform duration-200"
          >
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">ትዕዛዝ #{order.order_id}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-300">
                  ጠረጴዛ ቁጥር: {order.table_number || "N/A"} | አስተናጋጅ: {order.waiter_name || "N/A"}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  ትዕዛዝ ሰዐት:{" "}
                  {formatEatTime(order.order_created_at, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-slate-900 font-semibold bg-gray-100 text-sm">
                {order.items.length} ትዕዛዝ
              </span>
            </div>

            <ul className="flex flex-col space-y-3">
              {order.items.map((item) => (
                <li
                  key={item.item_id}
                  className={`flex justify-between items-center p-4 rounded-lg shadow-sm ${
                    item.status === "void"
                      ? "bg-gray-300 dark:bg-gray-600 line-through"
                      : "bg-gray-100 dark:bg-gray-700"
                  }`}
                >
                  <div>
                    <span className="font-medium text-lg">{item.name}</span> x{item.quantity}
                    {item.notes && (
                      <em className="text-xs ml-1 text-gray-400 dark:text-gray-500">
                        ({item.notes})
                      </em>
                    )}
                    {item.prep_tag && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Tag: {item.prep_tag}
                      </p>
                    )}
                  </div>

                  <div className="flex space-x-2">
                    {item.status === "pending" && (
                      <>
                        <button
                          onClick={() => updateStatus(item.item_id, "ready")}
                          disabled={Boolean(updatingItems[item.item_id])}
                          className="px-4 py-2 rounded-full font-semibold text-white bg-rose-900 hover:bg-rose-600 disabled:opacity-60"
                        >
                          {updatingItems[item.item_id] ? "..." : "ወቷል"}
                        </button>
                        {allowMarkUnavailable && (
                          <button
                            onClick={() => updateStatus(item.item_id, "void")}
                            disabled={Boolean(updatingItems[item.item_id])}
                            className="px-4 py-2 rounded-full font-semibold text-white bg-gray-500 hover:bg-gray-400 disabled:opacity-60"
                          >
                            የለም
                          </button>
                        )}
                      </>
                    )}
                    {item.status === "ready" && (
                      <span className="px-3 py-1 rounded-full bg-green-500 text-white text-sm font-semibold">
                        Ready
                      </span>
                    )}
                    {item.status === "void" && (
                      <span className="px-3 py-1 rounded-full bg-gray-500 text-white text-sm font-semibold">
                        Voided
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
