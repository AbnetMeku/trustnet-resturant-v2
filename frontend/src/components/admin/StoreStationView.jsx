import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getStoreStock, getStationStock, getStations } from "@/api/inventory";
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
      if (data.length > 0) setSelectedStation(data[0].name);
    } catch (err) {
      toast.error(err.message || "Failed to load stations");
    }
  };

  const loadStationStock = async (stationName = null) => {
    try {
      const data = await getStationStock(token);
      if (stationName) {
        setStationStock(data.filter((s) => s.station === stationName));
      } else {
        setStationStock(data);
      }
    } catch (err) {
      toast.error(err.message || "Failed to load station stock");
    }
  };

  // ---------------- Build Overall Stock ----------------
  const buildOverallStock = () => {
    const all = [...storeStock, ...stationStock];
    const totals = {};

    all.forEach((row) => {
      const key = row.menu_item || row.item_name;
      if (!totals[key]) {
        totals[key] = { item: key, total_quantity: 0 };
      }
      totals[key].total_quantity += row.quantity || 0;
    });

    setOverallStock(Object.values(totals));
  };

  // ---------------- Effects ----------------
  useEffect(() => {
    loadStoreStock();
    loadStations();
  }, [token]);

  useEffect(() => {
    if (selectedStation) loadStationStock(selectedStation);
  }, [token, selectedStation]);

  useEffect(() => {
    buildOverallStock();
  }, [storeStock, stationStock]);

  // ---------------- Pagination ----------------
  const paginate = (data) => data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ---------------- Render Tables ----------------
  const renderTable = (data) => (
    <div className="overflow-x-auto mt-2">
      <table className="w-full border rounded-lg shadow-sm">
        <thead>
          <tr className="bg-gray-100 dark:bg-gray-700">
            <th className="p-2 border">#</th>
            <th className="p-2 border">Item</th>
            <th className="p-2 border">Quantity</th>
            <th className="p-2 border">Location</th>
          </tr>
        </thead>
        <tbody>
          {paginate(data).map((row, i) => (
            <tr key={i} className="even:bg-gray-50 dark:even:bg-gray-800">
              <td className="p-2 border">{(page - 1) * PAGE_SIZE + i + 1}</td>
              <td className="p-2 border">{row.menu_item || row.item_name}</td>
              <td className="p-2 border">{row.quantity}</td>
              <td className="p-2 border">{row.station || "Store"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Pagination data={data} />
    </div>
  );

  const renderOverallTable = (data) => (
    <div className="overflow-x-auto mt-2">
      <table className="w-full border rounded-lg shadow-sm">
        <thead>
          <tr className="bg-gray-100 dark:bg-gray-700">
            <th className="p-2 border">#</th>
            <th className="p-2 border">Item</th>
            <th className="p-2 border">Total Quantity</th>
          </tr>
        </thead>
        <tbody>
          {paginate(data).map((row, i) => (
            <tr key={i} className="even:bg-gray-50 dark:even:bg-gray-800">
              <td className="p-2 border">{(page - 1) * PAGE_SIZE + i + 1}</td>
              <td className="p-2 border">{row.item}</td>
              <td className="p-2 border">{row.total_quantity}</td>
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
      <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
        Prev
      </Button>
      <span>
        Page {page} of {Math.ceil(data.length / PAGE_SIZE) || 1}
      </span>
      <Button
        disabled={page * PAGE_SIZE >= data.length}
        onClick={() => setPage(page + 1)}
      >
        Next
      </Button>
    </div>
  );

  return (
    <Card className="p-6 w-full space-y-4">
      {/* <h2 className="text-xl font-bold">Stock Management</h2> */}

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val)}>
        <TabsList>
          <TabsTrigger value="store">Store Stock</TabsTrigger>
          <TabsTrigger value="station">Station Stock</TabsTrigger>
          <TabsTrigger value="overall">Overall Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="store">{renderTable(storeStock)}</TabsContent>

        <TabsContent value="station">
          <div className="mt-3 mb-2 flex items-center gap-3">
            <label className="font-medium">Select Station:</label>
            <select
              className="border p-1 rounded bg-white text-black dark:bg-gray-800 dark:text-white"
              value={selectedStation || ""}
              onChange={(e) => {
                setSelectedStation(e.target.value);
                setPage(1); // reset pagination
              }}
            >
              {stations.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {renderTable(stationStock)}
        </TabsContent>

        <TabsContent value="overall">{renderOverallTable(overallStock)}</TabsContent>
      </Tabs>
    </Card>
  );
}
