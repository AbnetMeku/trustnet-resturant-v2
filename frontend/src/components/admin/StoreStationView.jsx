import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getStoreStock, getStationStockWithSales, getStations } from "@/api/inventory";
import { useAuth } from "@/context/AuthContext";
import { toast } from "react-hot-toast";

const PAGE_SIZE = 10;

export default function StockManagement() {
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState("store");
  const [storeStock, setStoreStock] = useState([]);
  const [stationStock, setStationStock] = useState([]);
  const [overallStock, setOverallStock] = useState([]);
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState("");
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().split("T")[0]); // default today
  const [page, setPage] = useState(1);

  // ---------------- Load Data ----------------
  const loadStoreStock = async () => {
    try {
      const data = await getStoreStock(token);
      setStoreStock(data);
    } catch (err) {
      toast.error(err.message || "Failed to load store stock");
    }
  };

  const loadStations = async () => {
    try {
      const data = await getStations(token);
      setStations(data);
      if (data.length > 0 && !selectedStation) setSelectedStation(data[0].name);
    } catch (err) {
      toast.error(err.message || "Failed to load stations");
    }
  };

  const loadStationStock = async (stationName = null, date = null) => {
    try {
      const params = { station: stationName, date };
      const data = await getStationStockWithSales(params, token);
      setStationStock(data);
    } catch (err) {
      toast.error(err.message || "Failed to load station stock");
    }
  };

  // ---------------- Build Overall Stock ----------------
  const buildOverallStock = () => {
    const all = [...storeStock, ...stationStock];
    const totals = {};

    all.forEach((row) => {
      const key = row.menu_item || row.item_name || row.item;
      if (!totals[key]) totals[key] = { item: key, total_quantity: 0 };
      totals[key].total_quantity += row.remaining_quantity || row.quantity || row.total_quantity || 0;
    });

    setOverallStock(Object.values(totals));
  };

  // ---------------- Effects ----------------
  useEffect(() => {
    loadStoreStock();
    loadStations();
  }, [token]);

  useEffect(() => {
    if (selectedStation) loadStationStock(selectedStation, snapshotDate);
  }, [token, selectedStation, snapshotDate]);

  useEffect(() => {
    buildOverallStock();
  }, [storeStock, stationStock]);

  // ---------------- Pagination ----------------
  const paginate = (data) => data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ---------------- Render Tables ----------------
  const renderSimpleTable = (data) => (
    <div className="overflow-x-auto mt-2">
      <table className="w-full border rounded-lg shadow-sm">
        <thead>
          <tr className="bg-gray-100 dark:bg-gray-700">
            <th className="p-2 border">#</th>
            <th className="p-2 border">Item</th>
            <th className="p-2 border">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {paginate(data).map((row, i) => (
            <tr key={i} className="even:bg-gray-50 dark:even:bg-gray-800">
              <td className="p-2 border">{(page - 1) * PAGE_SIZE + i + 1}</td>
              <td className="p-2 border">{row.menu_item || row.item_name || row.item}</td>
              <td className="p-2 border">{row.remaining_quantity || row.quantity || row.total_quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination data={data} />
    </div>
  );

  const renderStationTable = (data) => (
    <div className="overflow-x-auto mt-2">
      <div className="mb-2 flex items-center gap-4">
        {/* Station dropdown */}
        <div className="flex items-center gap-2">
          <label className="font-medium">Select Station:</label>
          <select
            className="border p-1 rounded bg-white text-black dark:bg-gray-800 dark:text-white"
            value={selectedStation || ""}
            onChange={(e) => {
              setSelectedStation(e.target.value);
              setPage(1);
            }}
          >
            {stations
            //   .filter((s) => s.name !== "Bar") // hide Bar or other stations
              .map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
          </select>
        </div>

        {/* Date picker */}
        <div className="flex items-center gap-2">
          <label className="font-medium">Select Date:</label>
          <input
            type="date"
            className="border p-1 rounded bg-white text-black dark:bg-gray-800 dark:text-white"
            value={snapshotDate}
            onChange={(e) => {
              setSnapshotDate(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <table className="w-full border rounded-lg shadow-sm">
        <thead>
          <tr className="bg-gray-100 dark:bg-gray-700">
            <th className="p-2 border">#</th>
            <th className="p-2 border">Item</th>
            <th className="p-2 border">Total</th>
            <th className="p-2 border">Sold</th>
            <th className="p-2 border">Remaining</th>
            <th className="p-2 border">Station</th>
          </tr>
        </thead>
        <tbody>
          {paginate(data).map((row, i) => (
            <tr key={i} className="even:bg-gray-50 dark:even:bg-gray-800">
              <td className="p-2 border">{(page - 1) * PAGE_SIZE + i + 1}</td>
              <td className="p-2 border">{row.menu_item}</td>
              <td className="p-2 border">{row.start_of_day_quantity}</td>
              <td className="p-2 border">{row.sold_quantity}</td>
              <td className="p-2 border">{row.remaining_quantity}</td>
              <td className="p-2 border">{row.station}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination data={data} />
    </div>
  );

  // ---------------- Pagination Component ----------------
  const Pagination = ({ data }) => (
    <div className="flex justify-between items-center mt-4">
      <Button disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
      <span>
        Page {page} of {Math.ceil(data.length / PAGE_SIZE) || 1}
      </span>
      <Button disabled={page * PAGE_SIZE >= data.length} onClick={() => setPage(page + 1)}>Next</Button>
    </div>
  );

  return (
    <Card className="p-6 w-full space-y-4">
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val)}>
        <TabsList>
          <TabsTrigger value="store">Store</TabsTrigger>
          <TabsTrigger value="station">Stations</TabsTrigger>
          <TabsTrigger value="overall">Total</TabsTrigger>
        </TabsList>

        <TabsContent value="store">{renderSimpleTable(storeStock)}</TabsContent>

        <TabsContent value="station">{renderStationTable(stationStock)}</TabsContent>

        <TabsContent value="overall">{renderSimpleTable(overallStock)}</TabsContent>
      </Tabs>
    </Card>
  );
}
