import React, { useEffect, useState } from "react";
import { getStations, getStationStockWithSales } from "@/api/inventory";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { toast } from "react-hot-toast";

export default function StationStock() {
  const { token } = useAuth();

  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState("");
  const [snapshotDate, setSnapshotDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [stationStock, setStationStock] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load Stations once
  useEffect(() => {
    const loadStations = async () => {
      try {
        const data = await getStations(token);
        const filteredStations = data.filter(
          (s) => s.name !== "Kitchen" && s.name !== "Butcher"
        );
        setStations(filteredStations);

        // Auto-select first station if available
        if (filteredStations.length > 0) {
          setSelectedStation(filteredStations[0].name);
        }
      } catch (err) {
        toast.error(err.message || "Failed to load stations");
      }
    };

    loadStations();
  }, [token]);

  // Load stock only when station or date changes (no timer)
  useEffect(() => {
    const loadStationStock = async () => {
      if (!selectedStation) return;
      setLoading(true);
      try {
        const data = await getStationStockWithSales(
          { station: selectedStation, date: snapshotDate },
          token
        );
        setStationStock(data);
      } catch (err) {
        toast.error(err.message || "Failed to load station stock");
      } finally {
        setLoading(false);
      }
    };

    loadStationStock();
  }, [selectedStation, snapshotDate, token]);

  return (
    <Card className="p-4 w-full">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
        View Station Stock
      </h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-4">
        {/* Station */}
        <div className="flex items-center gap-2">
          <label className="font-medium">Station:</label>
          <select
            className="p-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
          >
            {stations.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div className="flex items-center gap-2">
          <label className="font-medium">Date:</label>
          <input
            type="date"
            className="p-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
            value={snapshotDate}
            onChange={(e) => setSnapshotDate(e.target.value)}
          />
        </div>
      </div>

      {/* Stock Table */}
      {loading ? (
        <div className="text-center py-6 text-gray-500">Loading...</div>
      ) : stationStock.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          No data available for this date/station.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse border border-gray-300 dark:border-gray-600 shadow-sm">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800">
                <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-gray-700 dark:text-gray-200">
                  Item Name
                </th>
                <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-700 dark:text-gray-200">
                  Opening
                </th>
                <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-700 dark:text-gray-200">
                  Added
                </th>
                <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-700 dark:text-gray-200">
                  Sold
                </th>
                <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-indigo-600 dark:text-indigo-400 font-semibold">
                  Remaining
                </th>
              </tr>
            </thead>
            <tbody>
              {stationStock.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
                    {row.menu_item}
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right">
                    {row.start_of_day_quantity}
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right">
                    {row.added_quantity}
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right">
                    {row.sold_quantity}
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right">
                    {row.remaining_quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
