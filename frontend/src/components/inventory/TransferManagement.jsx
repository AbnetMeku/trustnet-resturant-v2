import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import {
  getTransfers,
  createTransfer,
  updateTransfer,
  deleteTransfer,
} from "@/api/inventory/transfer";
import { getStations } from "@/api/stations";
import { getInventoryItems } from "@/api/inventory/items";
import { getAllStoreStock } from "@/api/inventory/stock";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import ReactSelect from "react-select";
import { toast } from "react-hot-toast";

const PAGE_SIZE = 10;

export default function TransferManagement() {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState("add");
  const [items, setItems] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [stations, setStations] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [transferPage, setTransferPage] = useState(1);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editId, setEditId] = useState(null);

  const [form, setForm] = useState({
    inventory_item_id: "",
    station_id: "",
    quantity: "",
  });

  // --- Load data ---
  const loadItems = async () => {
    try {
      const data = await getInventoryItems(token);
      setItems(data);
    } catch {
      toast.error("Failed to load inventory items. Please try again.");
    }
  };

  const loadStocks = async () => {
    try {
      const data = await getAllStoreStock(token);
      setStocks(data);
    } catch {
      toast.error("Failed to load store stock data.");
    }
  };

  const loadStations = async () => {
    try {
      const data = await getStations(token);
      setStations(data);
    } catch {
      toast.error("Failed to load stations. Please try again.");
    }
  };

  const loadTransfers = async () => {
    try {
      const data = await getTransfers(null, token);
      setTransfers(
        data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      );
    } catch {
      toast.error("Failed to load transfers. Please try again.");
    }
  };

  useEffect(() => {
    loadItems();
    loadStocks();
    loadStations();
    loadTransfers();
  }, [token]);

  // --- Helper ---
  const getStockQty = (inventoryId) => {
    const stock = stocks.find((s) => s.inventory_item_id === inventoryId);
    return stock ? stock.quantity : 0;
  };

  // --- Form submission ---
  const handleSubmit = async () => {
    const { inventory_item_id, station_id, quantity } = form;

    if (!inventory_item_id) return toast.error("Please select an inventory item.");
    if (!station_id) return toast.error("Please select a station.");
    if (!quantity || isNaN(quantity) || quantity <= 0)
      return toast.error("Enter a valid quantity greater than zero.");

    const available = getStockQty(parseInt(inventory_item_id));
    if (parseFloat(quantity) > available)
      return toast.error(`Not enough stock. Only ${available} left.`);

    const payload = {
      inventory_item_id: parseInt(inventory_item_id),
      station_id: parseInt(station_id),
      quantity: parseFloat(parseFloat(quantity).toFixed(3))
    };

    try {
      if (editId) {
        await updateTransfer(editId, payload, token);
        toast.success("Transfer updated successfully.");
      } else {
        await createTransfer(payload, token);
        toast.success("Transfer created successfully.");
      }

      setForm({ inventory_item_id: "", station_id: "", quantity: "" });
      setEditId(null);
      await loadTransfers();
      await loadStocks(); // refresh stock after transfer
    } catch {
      toast.error("Failed to process transfer. Please check input and try again.");
    }
  };

  // --- Delete handler ---
  const handleDelete = async () => {
    try {
      await deleteTransfer(deleteId, token);
      toast.success("Transfer deleted successfully.");
      setShowDeleteDialog(false);
      setDeleteId(null);
      await loadTransfers();
      await loadStocks();
    } catch {
      toast.error("Failed to delete transfer. Please try again.");
    }
  };

  const paginate = (data, page) =>
    data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectStyles = {
    control: (base, state) => ({
      ...base,
      backgroundColor: "hsl(var(--background))",
      color: "hsl(var(--foreground))",
      borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--border))",
      boxShadow: state.isFocused ? "0 0 0 1px hsl(var(--ring))" : "none",
      "&:hover": { borderColor: "hsl(var(--ring))" },
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: "hsl(var(--popover))",
      color: "hsl(var(--foreground))",
      zIndex: 50,
    }),
    singleValue: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
    option: (base, { isFocused }) => ({
      ...base,
      backgroundColor: isFocused
        ? "hsl(var(--accent))"
        : "hsl(var(--popover))",
      color: "hsl(var(--foreground))",
    }),
  };

  const latestTransfers = transfers.slice(0, 3);

  return (
    <Card className="p-6 w-full dark:bg-gray-900 dark:text-white">
      {/* Tabs */}
      <div className="flex mb-6 border-b border-gray-200 dark:border-gray-700">
        {["add", "history"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 mr-4 transition-colors ${
              activeTab === tab
                ? "border-b-2 border-blue-500 font-semibold"
                : "text-gray-500 dark:text-gray-300 hover:text-blue-500"
            }`}
          >
            {tab === "add" ? "Add Transfer" : "Transfer History"}
          </button>
        ))}
      </div>

      {/* Add Transfer */}
      {activeTab === "add" && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            {/* Inventory */}
            <ReactSelect
              styles={selectStyles}
              placeholder="Select Inventory Item"
              options={items.map((i) => ({
                value: i.id,
                label: `${i.name} (${getStockQty(i.id)} left)`,
              }))}
              value={
                form.inventory_item_id
                  ? {
                      value: form.inventory_item_id,
                      label:
                        items.find((x) => x.id === +form.inventory_item_id)
                          ?.name || "",
                    }
                  : null
              }
              onChange={(opt) =>
                setForm({ ...form, inventory_item_id: opt.value })
              }
            />

            {/* Station */}
            <ReactSelect
              styles={selectStyles}
              placeholder="Select Station"
              options={stations.map((s) => ({ value: s.id, label: s.name }))}
              value={
                form.station_id
                  ? {
                      value: form.station_id,
                      label:
                        stations.find((x) => x.id === +form.station_id)?.name ||
                        "",
                    }
                  : null
              }
              onChange={(opt) => setForm({ ...form, station_id: opt.value })}
            />

            {/* Quantity */}
            <Input
              name="quantity"
              type="number"
              placeholder="Quantity"
              value={form.quantity}
              onChange={(e) =>
                setForm({ ...form, quantity: e.target.value })
              }
              className="dark:bg-gray-800 dark:text-white"
            />
          </div>

          <Button
            onClick={handleSubmit}
            className="bg-blue-600 hover:bg-blue-700 text-white w-fit"
          >
            {editId ? "Update Transfer" : "Create Transfer"}
          </Button>

          {/* Latest 3 Transfers */}
          {latestTransfers.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">
                Recent Transfers
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {latestTransfers.map((t) => (
                  <Card
                    key={t.id}
                    className="p-4 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 shadow-sm"
                  >
                    <div className="font-medium text-gray-900 dark:text-white">
                      {t.inventory_item_name}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      → {t.station_name}
                    </div>
                    <div className="mt-1 text-blue-600 dark:text-blue-400 font-semibold">
                      {t.quantity} units
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {new Date(t.created_at).toLocaleString()}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History tab same as before */}
      {activeTab === "history" && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border rounded-lg dark:border-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="p-2 border dark:border-gray-700">#</th>
                <th className="p-2 border dark:border-gray-700">Item</th>
                <th className="p-2 border dark:border-gray-700">Station</th>
                <th className="p-2 border dark:border-gray-700">Quantity</th>
                <th className="p-2 border dark:border-gray-700">Date</th>
                {user?.role === "admin" && (
                  <th className="p-2 border dark:border-gray-700">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {paginate(transfers, transferPage).map((t, i) => (
                <tr
                  key={t.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <td className="p-2 border dark:border-gray-700">
                    {(transferPage - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td className="p-2 border dark:border-gray-700">
                    {t.inventory_item_name}
                  </td>
                  <td className="p-2 border dark:border-gray-700">
                    {t.station_name}
                  </td>
                  <td className="p-2 border dark:border-gray-700">
                    {t.quantity}
                  </td>
                  <td className="p-2 border dark:border-gray-700">
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                  {user?.role === "admin" && (
                    <td className="p-2 border dark:border-gray-700 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditId(t.id);
                          setForm({
                            inventory_item_id: t.inventory_item_id,
                            station_id: t.station_id,
                            quantity: t.quantity,
                          });
                          setActiveTab("add");
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setDeleteId(t.id);
                          setShowDeleteDialog(true);
                        }}
                      >
                        Delete
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-3">
            <Button
              disabled={transferPage === 1}
              onClick={() => setTransferPage(transferPage - 1)}
            >
              Prev
            </Button>
            <span>
              Page {transferPage} of{" "}
              {Math.ceil(transfers.length / PAGE_SIZE) || 1}
            </span>
            <Button
              disabled={transferPage * PAGE_SIZE >= transfers.length}
              onClick={() => setTransferPage(transferPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this transfer?</p>
          <DialogFooter className="flex justify-end gap-2">
            <Button onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
