import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTables, createTable, updateTable, deleteTable } from "@/api/tables";
import { getUsers } from "@/api/users";
import { FaPlus, FaTrash, FaEdit, FaTimes } from "react-icons/fa";
import { toast } from "react-hot-toast";

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export default function TableManagement() {
  const [tables, setTables] = useState([]);
  const [waiters, setWaiters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentTable, setCurrentTable] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [filters, setFilters] = useState({ waiterId: "", isVip: "" });
  const [formData, setFormData] = useState({
    number: "",
    status: "available",
    is_vip: false,
    waiter_ids: [],
  });

  const fetchTables = async () => {
    setLoading(true);
    try {
      const data = await getTables();
      setTables(data);
    } catch (err) {
      toast.error("Failed to fetch tables");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWaiters = async () => {
    try {
      const data = await getUsers("waiter");
      setWaiters(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTables();
    fetchWaiters();
  }, []);

  const openModal = (table = null) => {
    if (table) {
      setCurrentTable(table);
      setFormData({
        number: table.number,
        status: table.status,
        is_vip: table.is_vip,
        waiter_ids: table.waiters.map((w) => w.id),
      });
    } else {
      setCurrentTable(null);
      setFormData({ number: "", status: "available", is_vip: false, waiter_ids: [] });
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrentTable(null);
    setFormData({ number: "", status: "available", is_vip: false, waiter_ids: [] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.number.trim()) {
      toast.error("Table number is required");
      return;
    }

    try {
      if (currentTable) {
        await updateTable(currentTable.id, formData);
        toast.success("Table updated successfully");
      } else {
        await createTable(formData);
        toast.success("Table created successfully");
      }
      await fetchTables();
      closeModal();
    } catch (err) {
      toast.error("Failed to save table");
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTable(id);
      toast.success("Table deleted");
      await fetchTables();
      setDeleteConfirmId(null);
    } catch {
      toast.error("Failed to delete table");
    }
  };

  const removeWaiterTag = (id) => {
    setFormData((prev) => ({
      ...prev,
      waiter_ids: prev.waiter_ids.filter((wid) => wid !== id),
    }));
  };

  const filteredTables = useMemo(
    () =>
      tables
        .filter((t) => {
          if (filters.waiterId && !t.waiters.find((w) => w.id === parseInt(filters.waiterId, 10))) return false;
          if (filters.isVip === "true" && !t.is_vip) return false;
          if (filters.isVip === "false" && t.is_vip) return false;
          return true;
        })
        .sort((a, b) => Number(a.number) - Number(b.number)),
    [tables, filters]
  );

  const stats = useMemo(
    () => ({
      total: tables.length,
      vip: tables.filter((t) => t.is_vip).length,
      occupied: tables.filter((t) => t.status === "occupied").length,
      available: tables.filter((t) => t.status === "available").length,
    }),
    [tables]
  );

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-5 text-white md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Admin Operations</p>
              <h3 className="mt-1 text-xl font-semibold">Table Management</h3>
              <p className="mt-1 text-sm text-slate-300">Manage table availability, VIP status, and waiter assignments.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Total</p>
                <p className="text-sm font-medium">{stats.total}</p>
              </div>
              <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">VIP</p>
                <p className="text-sm font-medium">{stats.vip}</p>
              </div>
              <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Occupied</p>
                <p className="text-sm font-medium">{stats.occupied}</p>
              </div>
              <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Available</p>
                <p className="text-sm font-medium">{stats.available}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60 md:p-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
            <select
              value={filters.waiterId}
              onChange={(e) => setFilters((prev) => ({ ...prev, waiterId: e.target.value }))}
              className={inputClass}
            >
              <option value="">All Waiters</option>
              {waiters.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.username}
                </option>
              ))}
            </select>
            <select
              value={filters.isVip}
              onChange={(e) => setFilters((prev) => ({ ...prev, isVip: e.target.value }))}
              className={inputClass}
            >
              <option value="">All Tables</option>
              <option value="true">VIP Only</option>
              <option value="false">Non-VIP</option>
            </select>
            <Button
              variant="outline"
              className="h-10 border-slate-300 dark:border-slate-700"
              onClick={() => setFilters({ waiterId: "", isVip: "" })}
            >
              Clear
            </Button>
            <Button className="h-10" onClick={() => openModal()}>
              <FaPlus className="mr-2" /> Add Table
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-300">
          Loading tables...
        </Card>
      ) : filteredTables.length === 0 ? (
        <Card className="border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-300">
          No tables found for current filters.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredTables.map((table) => (
            <Card key={table.id} className="relative border-slate-200 p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Table</p>
                  <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{table.number}</h4>
                </div>
                <div className="flex gap-1">
                  {table.is_vip && (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                      VIP
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold capitalize text-white ${
                      table.status === "available" ? "bg-emerald-600" : table.status === "occupied" ? "bg-rose-600" : "bg-amber-600"
                    }`}
                  >
                    {table.status}
                  </span>
                </div>
              </div>

              <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Assigned Waiters</p>
              <div className="flex min-h-8 flex-wrap gap-1">
                {table.waiters.length ? (
                  table.waiters.map((w) => (
                    <span key={w.id} className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                      {w.username}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400">None</span>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" className="border-slate-300 dark:border-slate-700" onClick={() => openModal(table)}>
                  <FaEdit className="mr-1" /> Edit
                </Button>
                {deleteConfirmId === table.id ? (
                  <>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(table.id)}>
                      Confirm
                    </Button>
                    <Button size="sm" variant="outline" className="border-slate-300 dark:border-slate-700" onClick={() => setDeleteConfirmId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button variant="destructive" size="sm" onClick={() => setDeleteConfirmId(table.id)}>
                    <FaTrash className="mr-1" /> Delete
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]">
          <Card className="w-full max-w-md overflow-hidden border-slate-200 shadow-xl dark:border-slate-800">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/50">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{currentTable ? "Edit Table" : "Add Table"}</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Update table details and waiter assignment.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
              <div>
                <Label>Table Number</Label>
                <Input
                  type="text"
                  value={formData.number}
                  onChange={(e) => setFormData((prev) => ({ ...prev, number: e.target.value }))}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <Label>Status</Label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                  className={inputClass}
                >
                  <option value="available">Available</option>
                  <option value="occupied">Occupied</option>
                  <option value="reserved">Reserved</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={formData.is_vip}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_vip: e.target.checked }))}
                  className="accent-slate-900 dark:accent-slate-200"
                />
                VIP Table
              </label>

              <div>
                <Label>Assign Waiters</Label>
                <div className="mb-2 mt-2 flex flex-wrap gap-1">
                  {formData.waiter_ids.map((id) => {
                    const waiter = waiters.find((w) => w.id === id);
                    return waiter ? (
                      <span key={id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                        {waiter.username}
                        <FaTimes className="cursor-pointer" onClick={() => removeWaiterTag(id)} />
                      </span>
                    ) : null;
                  })}
                </div>
                <select
                  value=""
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!Number.isNaN(val) && !formData.waiter_ids.includes(val)) {
                      setFormData((prev) => ({ ...prev, waiter_ids: [...prev.waiter_ids, val] }));
                    }
                  }}
                  className={inputClass}
                >
                  <option value="">Add Waiter</option>
                  {waiters.map(
                    (w) =>
                      !formData.waiter_ids.includes(w.id) && (
                        <option key={w.id} value={w.id}>
                          {w.username}
                        </option>
                      )
                  )}
                </select>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <Button type="button" variant="outline" className="border-slate-300 dark:border-slate-700" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit">{currentTable ? "Update" : "Create"}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
