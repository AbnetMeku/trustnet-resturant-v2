import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";

import { fetchStationInventory } from "@/api/kds";
import { useAuth } from "@/context/AuthContext";
import { eatBusinessDateISO } from "@/lib/timezone";
import { getApiErrorMessage } from "@/lib/apiError";

const numberFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

function formatShotDisplay(value, shotsPerBottle) {
  const total = Number(value || 0);
  const perBottle = Number(shotsPerBottle || 0);
  if (!Number.isFinite(perBottle) || perBottle <= 0) {
    return numberFormat.format(total);
  }
  const safeTotal = Math.max(0, total);
  let bottles = Math.floor(safeTotal / perBottle);
  let shots = Math.round(safeTotal - bottles * perBottle);
  if (shots >= perBottle) {
    bottles += 1;
    shots = 0;
  }
  const parts = [];
  if (bottles > 0) parts.push(`${bottles} bt`);
  if (shots > 0 || parts.length === 0) parts.push(`${shots} sh`);
  return parts.join(" ");
}

function Qty({ value, shotsPerBottle = 0, strong = false }) {
  const display = formatShotDisplay(value, shotsPerBottle);
  return <span className={strong ? "font-semibold text-foreground" : "text-foreground"}>{display}</span>;
}

export default function StationInventory() {
  const { stationToken, logoutStation } = useAuth();
  const navigate = useNavigate();

  const today = eatBusinessDateISO();
  const [selectedDate, setSelectedDate] = useState(today);
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleStationSessionExpired = useCallback(() => {
    logoutStation();
    navigate("/station-login");
  }, [logoutStation, navigate]);

  const fetchInventory = useCallback(
    async ({ silent = false } = {}) => {
      if (!stationToken) return;
      try {
        if (silent) setIsRefreshing(true);
        else setIsLoading(true);

        const res = await fetchStationInventory(stationToken, selectedDate);
        setRows(res?.rows || []);
      } catch (err) {
        if (err?.response?.status === 401 || err?.response?.status === 422) {
          toast.error("Session expired. Please login again.");
          handleStationSessionExpired();
          return;
        }
        console.error("Failed to load station inventory:", err);
        toast.error(getApiErrorMessage(err, "Failed to load station inventory."));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [stationToken, selectedDate, handleStationSessionExpired]
  );

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  return (
    <div className="h-full p-4" data-testid="kds-inventory-root">
      <div className="flex gap-3 mb-6 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            data-testid="kds-inventory-date-filter"
            className="w-full sm:w-52 p-2 rounded-lg border text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
            max={today}
          />
        </div>

        <button
          type="button"
          onClick={() => fetchInventory()}
          data-testid="kds-inventory-refresh"
          className="w-full sm:w-auto px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          Refresh
        </button>

        {isRefreshing && <span className="text-xs text-gray-500 dark:text-gray-400">Refreshing...</span>}
      </div>

      {isLoading ? (
        <p className="text-center mt-10 text-gray-500 dark:text-gray-400">Loading inventory...</p>
      ) : rows.length === 0 ? (
        <p className="text-center mt-10 text-gray-500 dark:text-gray-400">No inventory entries for this date.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800">
          <table className="min-w-[820px] w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-900/80">
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-3 text-left font-medium">Item</th>
                <th className="px-4 py-3 text-right font-medium">Opening</th>
                <th className="px-4 py-3 text-right font-medium">Added</th>
                <th className="px-4 py-3 text-right font-medium">Sold</th>
                <th className="px-4 py-3 text-right font-medium">Void</th>
                <th className="px-4 py-3 text-right font-medium">Closing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.inventory_item_id}`} className="border-b border-slate-200/70 dark:border-slate-700/70">
                  <td className="px-4 py-3 text-left">{row.inventory_item_name}</td>
                  <td className="px-4 py-3 text-right">
                    <Qty value={row.opening_quantity} shotsPerBottle={row.shots_per_bottle} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Qty value={row.transferred_in_quantity} shotsPerBottle={row.shots_per_bottle} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Qty value={row.sold_quantity} shotsPerBottle={row.shots_per_bottle} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Qty value={row.void_quantity} shotsPerBottle={row.shots_per_bottle} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Qty value={row.closing_quantity} shotsPerBottle={row.shots_per_bottle} strong />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
