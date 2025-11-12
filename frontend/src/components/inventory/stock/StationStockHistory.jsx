import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAllSnapshots } from "@/api/inventory/snapshot";
import { getStations } from "@/api/stations";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

export default function StationStockHistory() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [availableDates, setAvailableDates] = useState([]);

  // 🔹 Load stations
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const res = await getStations(token);
        setStations(res || []);
      } catch (err) {
        toast.error("Failed to fetch stations");
      }
    };
    fetchStations();
  }, [token]);

  // 🔹 Fetch snapshots when filters change
  useEffect(() => {
    const fetchSnapshots = async () => {
      setLoading(true);
      try {
        const filters = {};
        if (selectedStation) filters.station_id = selectedStation;
        if (selectedDate) filters.snapshot_date = selectedDate;

        const res = await getAllSnapshots(filters, token);
        setSnapshots(res || []);

        // Extract unique dates for dropdown
        const uniqueDates = [...new Set((res || []).map((s) => s.snapshot_date))];
        setAvailableDates(uniqueDates);
      } catch (err) {
        toast.error("Failed to load snapshots");
      } finally {
        setLoading(false);
      }
    };
    fetchSnapshots();
  }, [selectedStation, selectedDate, token]);

  const handleReset = () => {
    setSelectedStation("");
    setSelectedDate("");
  };

  return (
    <Card className="p-6 space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-xl font-semibold">📊 Station Stock History</h2>

        <div className="flex items-center gap-3">
          {/* Station Filter */}
          <select
            className="border rounded-md p-2 text-sm"
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
          >
            <option value="">All Stations</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>

          {/* Date Filter */}
          <select
            className="border rounded-md p-2 text-sm"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            <option value="">All Dates</option>
            {availableDates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>

          <Button variant="outline" onClick={handleReset}>
            Reset
          </Button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center items-center py-10 text-gray-500">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Loading history...
        </div>
      ) : snapshots.length === 0 ? (
        <p className="text-gray-500 text-center py-10">
          No stock history found for this filter.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="border px-3 py-2">Inventory Item</th>
                <th className="border px-3 py-2 text-center">Opening</th>
                <th className="border px-3 py-2 text-center">Added</th>
                <th className="border px-3 py-2 text-center">Sold</th>
                <th className="border px-3 py-2 text-center">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="border px-3 py-2">
                    {s.inventory_item_name || `Item ${s.inventory_item_id}`}
                  </td>
                  <td className="border px-3 py-2 text-center">
                    {s.start_of_day_quantity}
                  </td>
                  <td className="border px-3 py-2 text-center">
                    {s.added_quantity}
                  </td>
                  <td className="border px-3 py-2 text-center">
                    {s.sold_quantity}
                  </td>
                  <td className="border px-3 py-2 text-center font-semibold">
                    {s.remaining_quantity}
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
