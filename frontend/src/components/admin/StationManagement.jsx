import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStations, createStation, updateStation, deleteStation } from "@/api/stations";
import { FaPlus, FaTrash, FaEdit } from "react-icons/fa";
import { toast } from "react-hot-toast";

export default function StationManagement() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentStation, setCurrentStation] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    password: "",
    printer_identifier: "",
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrentStation(null);
    setFormData({ name: "", password: "", printer_identifier: "" });
    setError("");
  };

  const handleSubmit = async () => {
    setError("");

    if (!formData.name) {
      setError("Station name is required");
      return;
    }

    if (!currentStation || formData.password) {
      if (!/^\d{4}$/.test(formData.password)) {
        setError("PIN must be 4 digits");
        return;
      }
    }

    try {
      const payload = { ...formData };
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
    <div className="space-y-4">
      <Card className="p-4 border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-base font-semibold">Stations</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Manage station credentials and printer mapping.</p>
          </div>
          <Button onClick={() => setModalOpen(true)} className="flex items-center gap-2">
            <FaPlus /> Add Station
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card className="p-8 text-center text-sm text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-800">Loading stations...</Card>
      ) : stations.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-800">No stations found.</Card>
      ) : (
        <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/70 text-left">
                  <th className="px-4 py-3 font-medium">Station</th>
                  <th className="px-4 py-3 font-medium">Printer</th>
                  <th className="px-4 py-3 font-medium">PIN</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stations.map((station) => (
                  <tr key={station.id} className="border-b last:border-b-0 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60">
                    <td className="px-4 py-3 font-medium">{station.name}</td>
                    <td className="px-4 py-3">{station.printer_identifier || "N/A"}</td>
                    <td className="px-4 py-3">****</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button onClick={() => handleEdit(station)} variant="outline" size="sm">
                          <FaEdit className="mr-1" /> Edit
                        </Button>
                        {deleteConfirm === station.id ? (
                          <>
                            <Button onClick={() => handleDelete(station.id)} variant="destructive" size="sm">Confirm</Button>
                            <Button onClick={() => setDeleteConfirm(null)} size="sm" variant="outline">Cancel</Button>
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
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
          <Card className="p-5 w-full max-w-lg border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold mb-4 text-center">{currentStation ? "Edit Station" : "Add Station"}</h2>
            {error && <p className="text-red-600 dark:text-red-400 mb-3 text-sm text-center">{error}</p>}

            <div className="space-y-3">
              <div>
                <Label htmlFor="station-name">Station Name</Label>
                <Input id="station-name" name="name" placeholder="Station Name" value={formData.name} onChange={handleChange} />
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
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <Button onClick={closeModal} variant="outline">Cancel</Button>
              <Button onClick={handleSubmit}>{currentStation ? "Update" : "Create"}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
