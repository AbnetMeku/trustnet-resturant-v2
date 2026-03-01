import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStations, createStation, updateStation, deleteStation } from "@/api/stations";
import { FaPlus, FaTrash, FaEdit } from "react-icons/fa";
import { toast } from "react-hot-toast";

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export default function StationManagement() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentStation, setCurrentStation] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    password: "",
    printer_identifier: "",
    print_mode: "grouped",
    cashier_printer: false,
  });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [error, setError] = useState("");

  const fetchStations = async () => {
    setLoading(true);
    try {
      const data = await getStations();
      setStations(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load stations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, []);

  const stats = useMemo(
    () => ({
      total: stations.length,
      withPrinter: stations.filter((s) => !!s.printer_identifier).length,
      withoutPrinter: stations.filter((s) => !s.printer_identifier).length,
    }),
    [stations]
  );

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? checked
          : name === "password"
            ? value.replace(/\D/g, "").slice(0, 4)
            : value,
    }));
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrentStation(null);
    setFormData({
      name: "",
      password: "",
      printer_identifier: "",
      print_mode: "grouped",
      cashier_printer: false,
    });
    setError("");
  };

  const handleSubmit = async () => {
    setError("");

    if (!formData.name.trim()) {
      setError("Station name is required");
      return;
    }

    if (!currentStation || formData.password) {
      if (!/^\d{4}$/.test(formData.password)) {
      setError("PIN must be 4 digits");
      return;
    }
    if (formData.cashier_printer && !formData.printer_identifier.trim()) {
      setError("Cashier printer requires printer identifier (IP)");
      return;
    }
    }

    try {
      const payload = { ...formData, name: formData.name.trim() };
      if (currentStation && !formData.password) delete payload.password;

      if (currentStation) {
        await updateStation(currentStation.id, payload);
        toast.success("Station updated");
      } else {
        await createStation(payload);
        toast.success("Station created");
      }

      closeModal();
      fetchStations();
    } catch (err) {
      setError(err.response?.data?.message || "Error occurred");
    }
  };

  const handleEdit = (station) => {
    setCurrentStation(station);
    setFormData({
      name: station.name,
      password: "",
      printer_identifier: station.printer_identifier || "",
      print_mode: station.print_mode || "grouped",
      cashier_printer: !!station.cashier_printer,
    });
    setModalOpen(true);
  };

  const handleDelete = async (stationId) => {
    try {
      await deleteStation(stationId);
      setDeleteConfirm(null);
      fetchStations();
      toast.success("Station deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete station");
    }
  };

  return (
    <div className="space-y-5">
      <Card className="admin-card overflow-hidden">
        <div className="admin-hero px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Station Management</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Total</p>
                <p className="text-sm font-medium">{stats.total}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Mapped</p>
                <p className="text-sm font-medium">{stats.withPrinter}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Unmapped</p>
                <p className="text-sm font-medium">{stats.withoutPrinter}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="admin-toolbar p-4 md:p-6">
          <Button onClick={() => setModalOpen(true)} className="h-10">
            <FaPlus className="mr-2" /> Add Station
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card className="admin-card p-8 text-center text-sm text-slate-500 dark:text-slate-300">
          Loading stations...
        </Card>
      ) : stations.length === 0 ? (
        <Card className="admin-card p-8 text-center text-sm text-slate-500 dark:text-slate-300">
          No stations found.
        </Card>
      ) : (
        <Card className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-left dark:bg-slate-800/70">
                  <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">Station</th>
                  <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">Printer</th>
                  <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">Cashier</th>
                  <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">Print Mode</th>
                  <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">PIN</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stations.map((station) => (
                  <tr
                    key={station.id}
                    className="border-b border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/60"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{station.name}</td>
                    <td className="px-4 py-3">
                      {station.printer_identifier ? (
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{station.printer_identifier}</span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {station.cashier_printer ? (
                        <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          Yes
                        </span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                        {station.print_mode === "separate" ? "Separate Tickets" : "Grouped Ticket"}
                      </span>
                    </td>
                    <td className="px-4 py-3">****</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button onClick={() => handleEdit(station)} variant="outline" size="sm" className="border-slate-300 dark:border-slate-700">
                          <FaEdit className="mr-1" /> Edit
                        </Button>
                        {deleteConfirm === station.id ? (
                          <>
                            <Button onClick={() => handleDelete(station.id)} variant="destructive" size="sm">
                              Confirm
                            </Button>
                            <Button onClick={() => setDeleteConfirm(null)} size="sm" variant="outline" className="border-slate-300 dark:border-slate-700">
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button onClick={() => setDeleteConfirm(station.id)} variant="destructive" size="sm">
                            <FaTrash className="mr-1" /> Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]">
          <Card className="admin-card w-full max-w-lg overflow-hidden shadow-xl">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/50">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{currentStation ? "Edit Station" : "Add Station"}</h2>
            </div>
            <div className="space-y-3 px-5 py-4">
              {error && <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-300">{error}</p>}

              <div>
                <Label htmlFor="station-name">Station Name</Label>
                <Input id="station-name" name="name" placeholder="Station Name" value={formData.name} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <Label htmlFor="station-pin">PIN</Label>
                <Input
                  id="station-pin"
                  name="password"
                  placeholder={currentStation ? "Leave blank to keep PIN" : "4-digit PIN"}
                  value={formData.password}
                  onChange={handleChange}
                  maxLength={4}
                  type="password"
                  inputMode="numeric"
                  className={inputClass}
                />
              </div>
              <div>
                <Label htmlFor="station-printer">Printer Identifier</Label>
                <Input
                  id="station-printer"
                  name="printer_identifier"
                  placeholder="Printer Identifier"
                  value={formData.printer_identifier}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <Label htmlFor="station-print-mode">Kitchen Print Mode</Label>
                <select
                  id="station-print-mode"
                  name="print_mode"
                  value={formData.print_mode}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="grouped">Grouped (one job per station)</option>
                  <option value="separate">Separate (one job per item)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                <input
                  type="checkbox"
                  name="cashier_printer"
                  checked={formData.cashier_printer}
                  onChange={handleChange}
                />
                <span className="text-sm text-slate-700 dark:text-slate-200">
                  Use this station printer for cashier receipts
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/30">
              <Button onClick={closeModal} variant="outline" className="border-slate-300 dark:border-slate-700">
                Cancel
              </Button>
              <Button onClick={handleSubmit}>{currentStation ? "Update" : "Create"}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
