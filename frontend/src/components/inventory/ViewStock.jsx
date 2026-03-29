import React, { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { useBranding } from "@/hooks/useBranding";
import { adjustOpeningStock, getDailyStockHistory, getStockOverview } from "@/api/inventory/stock";
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
  if (bottles > 0) parts.push(`${bottles} bottle${bottles === 1 ? "" : "s"}`);
  if (shots > 0 || parts.length === 0) parts.push(`${shots} shot${shots === 1 ? "" : "s"}`);
  return parts.join(" ");
}

function Qty({ value, strong = false, shotsPerBottle = 0 }) {
  const display = formatShotDisplay(value, shotsPerBottle);
  return <span className={strong ? "font-semibold text-foreground" : "text-foreground"}>{display}</span>;
}

const buildRowKey = (row) => `${row.scope_type || "store"}:${row.scope_id || "store"}:${row.inventory_item_id}`;

function splitShots(total, shotsPerBottle) {
  const perBottle = Number(shotsPerBottle || 0);
  if (!Number.isFinite(perBottle) || perBottle <= 0) {
    return { bottles: 0, shots: Math.round(Number(total || 0)) };
  }
  const safeTotal = Math.max(0, Number(total || 0));
  let bottles = Math.floor(safeTotal / perBottle);
  let shots = Math.round(safeTotal - bottles * perBottle);
  if (shots >= perBottle) {
    bottles += 1;
    shots = 0;
  }
  return { bottles, shots };
}

function HistoryTable({
  rows,
  type,
  isAdjusting = false,
  openingDrafts = {},
  onDraftChange = () => {},
}) {
  const isStore = type === "store";

  return (
    <div className="inventory-table-shell">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="inventory-table-head">
          <tr>
            {isStore ? <th className="px-4 py-3 font-medium">Item</th> : <th className="px-4 py-3 font-medium">Station</th>}
            {!isStore && <th className="px-4 py-3 font-medium">Item</th>}
            <th className="px-4 py-3 font-medium text-right">Opening</th>
            {isStore && <th className="px-4 py-3 font-medium text-right">Purchased</th>}
            {isStore && <th className="px-4 py-3 font-medium text-right">Transferred Out</th>}
            {!isStore && <th className="px-4 py-3 font-medium text-right">Transferred In</th>}
            {!isStore && <th className="px-4 py-3 font-medium text-right">Sold</th>}
            {!isStore && <th className="px-4 py-3 font-medium text-right">Void</th>}
            <th className="px-4 py-3 font-medium text-right">Closing</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={isStore ? 5 : 6} className="px-4 py-10 text-center text-muted-foreground">
                No stock history found for this date and filter.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={`${row.scope_name}-${row.inventory_item_id}-${index}`} className="inventory-table-row">
                {isStore ? (
                  <td className="px-4 py-3 font-medium">{row.inventory_item_name}</td>
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium">{row.scope_name}</td>
                    <td className="px-4 py-3">{row.inventory_item_name}</td>
                  </>
                )}
                <td className="px-4 py-3 text-right">
                  {isAdjusting ? (
                    (() => {
                      const key = buildRowKey(row);
                      const draft = openingDrafts[key] || {};
                      const perBottle = Number(row.shots_per_bottle || 0);
                      if (perBottle > 0) {
                        return (
                          <div className="flex items-center justify-end gap-2">
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="Bottles"
                              value={draft.bottles ?? ""}
                              onChange={(event) => onDraftChange(key, { bottles: event.target.value })}
                              className="h-8 w-20 text-right"
                            />
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="Shots"
                              value={draft.shots ?? ""}
                              onChange={(event) => onDraftChange(key, { shots: event.target.value })}
                              className="h-8 w-20 text-right"
                            />
                          </div>
                        );
                      }
                      return (
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          placeholder="0"
                          value={draft.total ?? ""}
                          onChange={(event) => onDraftChange(key, { total: event.target.value })}
                          className="h-8 text-right"
                        />
                      );
                    })()
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <Qty value={row.opening_quantity} shotsPerBottle={row.shots_per_bottle} />
                      {row.opening_adjusted && (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                          Adjusted
                        </span>
                      )}
                    </div>
                  )}
                </td>
                {isStore && (
                  <td className="px-4 py-3 text-right">
                    <Qty value={row.purchased_quantity} shotsPerBottle={row.shots_per_bottle} />
                  </td>
                )}
                {isStore && (
                  <td className="px-4 py-3 text-right">
                    <Qty value={row.transferred_out_quantity} shotsPerBottle={row.shots_per_bottle} />
                  </td>
                )}
                {!isStore && (
                  <td className="px-4 py-3 text-right">
                    <Qty value={row.transferred_in_quantity} shotsPerBottle={row.shots_per_bottle} />
                  </td>
                )}
                {!isStore && (
                  <td className="px-4 py-3 text-right">
                    <Qty value={row.sold_quantity} shotsPerBottle={row.shots_per_bottle} />
                  </td>
                )}
                {!isStore && (
                  <td className="px-4 py-3 text-right">
                    <Qty value={row.void_quantity} shotsPerBottle={row.shots_per_bottle} />
                  </td>
                )}
                <td className="px-4 py-3 text-right">
                  <Qty value={row.closing_quantity} shotsPerBottle={row.shots_per_bottle} strong />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function StockManagement() {
  const { token, user } = useAuth();
  const branding = useBranding();
  const [activeTab, setActiveTab] = useState("station-history");
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [overview, setOverview] = useState({ stations: [], rows: [] });
  const [history, setHistory] = useState({ rows: [], stations: [] });
  const [searchCurrent, setSearchCurrent] = useState("");
  const [storeSearch, setStoreSearch] = useState("");
  const [stationSearch, setStationSearch] = useState("");
  const [historyDate, setHistoryDate] = useState(eatBusinessDateISO(new Date(), branding.business_day_start_time));
  const [stationHistoryId, setStationHistoryId] = useState("");
  const [adjustScope, setAdjustScope] = useState(null);
  const [openingDrafts, setOpeningDrafts] = useState({});
  const [savingAdjustments, setSavingAdjustments] = useState(false);

  const loadOverview = async () => {
    try {
      setLoadingOverview(true);
      const data = await getStockOverview(token);
      setOverview(data || { stations: [], rows: [] });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load stock overview."));
    } finally {
      setLoadingOverview(false);
    }
  };

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const data = await getDailyStockHistory(
        {
          date: historyDate,
          scope: "all",
        },
        token
      );
      setHistory(data || { rows: [], stations: [] });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load daily stock history."));
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [token]);

  useEffect(() => {
    setHistoryDate(eatBusinessDateISO(new Date(), branding.business_day_start_time));
  }, [branding.business_day_start_time]);

  useEffect(() => {
    loadHistory();
  }, [token, historyDate]);

  useEffect(() => {
    setAdjustScope(null);
    setOpeningDrafts({});
  }, [historyDate, activeTab]);

  const isAdmin = String(user?.role || "").toLowerCase() === "admin";
  const todayBusinessDate = eatBusinessDateISO(new Date(), branding.business_day_start_time);
  const canAdjustToday = isAdmin && historyDate === todayBusinessDate;

  const filteredOverviewRows = useMemo(() => {
    const query = searchCurrent.trim().toLowerCase();
    if (!query) return overview.rows || [];
    return (overview.rows || []).filter((row) => row.inventory_item_name.toLowerCase().includes(query));
  }, [overview.rows, searchCurrent]);

  const storeHistoryRows = useMemo(() => {
    const rows = (history.rows || []).filter((row) => row.scope_type === "store");
    const query = storeSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => String(row.inventory_item_name || "").toLowerCase().includes(query));
  }, [history.rows, storeSearch]);

  const stationHistoryRows = useMemo(() => {
    let rows = (history.rows || []).filter((row) => row.scope_type === "station");
    if (stationHistoryId) {
      rows = rows.filter((row) => String(row.scope_id) === String(stationHistoryId));
    }
    const query = stationSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      return (
        String(row.inventory_item_name || "").toLowerCase().includes(query) ||
        String(row.scope_name || "").toLowerCase().includes(query)
      );
    });
  }, [history.rows, stationHistoryId, stationSearch]);

  const buildDraftMap = (rows) => {
    const draftMap = {};
    rows.forEach((row) => {
      const key = buildRowKey(row);
      const perBottle = Number(row.shots_per_bottle || 0);
      if (perBottle > 0) {
        const { bottles, shots } = splitShots(row.opening_quantity, perBottle);
        draftMap[key] = { bottles: String(bottles), shots: String(shots) };
      } else {
        draftMap[key] = { total: String(Number(row.opening_quantity || 0)) };
      }
    });
    return draftMap;
  };

  const beginAdjustments = (scope) => {
    if (!canAdjustToday) return;
    const rows = scope === "store" ? storeHistoryRows : stationHistoryRows;
    setOpeningDrafts(buildDraftMap(rows));
    setAdjustScope(scope);
  };

  const cancelAdjustments = () => {
    setAdjustScope(null);
    setOpeningDrafts({});
  };

  const updateDraft = (key, patch) => {
    setOpeningDrafts((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), ...patch },
    }));
  };

  const parseNonNegative = (value, label) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`${label} must be zero or greater`);
    }
    return parsed;
  };

  const computeDraftTotal = (row) => {
    const key = buildRowKey(row);
    const draft = openingDrafts[key] || {};
    const perBottle = Number(row.shots_per_bottle || 0);
    if (perBottle > 0) {
      const bottles = parseNonNegative(draft.bottles || 0, "Bottles");
      const shots = parseNonNegative(draft.shots || 0, "Shots");
      return bottles * perBottle + shots;
    }
    return parseNonNegative(draft.total || 0, "Opening");
  };

  const saveAdjustments = async (scope) => {
    const rows = scope === "store" ? storeHistoryRows : stationHistoryRows;
    const updates = [];
    try {
      rows.forEach((row) => {
        const nextOpening = computeDraftTotal(row);
        const currentOpening = Number(row.opening_quantity || 0);
        if (Math.abs(nextOpening - currentOpening) > 0.0001) {
          updates.push({ row, opening: nextOpening });
        }
      });
    } catch (err) {
      toast.error(err.message || "Invalid opening values.");
      return;
    }

    if (updates.length === 0) {
      toast("No opening changes to save.");
      cancelAdjustments();
      return;
    }

    setSavingAdjustments(true);
    try {
      for (const update of updates) {
        const payload = {
          scope: update.row.scope_type,
          inventory_item_id: update.row.inventory_item_id,
          opening_quantity: update.opening,
        };
        if (update.row.scope_type === "station") {
          payload.station_id = update.row.scope_id;
        }
        await adjustOpeningStock(payload, token);
      }
      toast.success("Opening stock updated.");
      cancelAdjustments();
      await loadHistory();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update opening stock."));
    } finally {
      setSavingAdjustments(false);
    }
  };

  return (
    <div className="space-y-5">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="station-history">Station History</TabsTrigger>
          <TabsTrigger value="store-history">Store History</TabsTrigger>
          <TabsTrigger value="current">Total Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="station-history" className="space-y-5">
          <Card className="inventory-panel p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Station Daily History</h3>
                <p className="text-sm text-muted-foreground">
                  Opening, transferred in, sold, void, and closing stock for each station.
                </p>
                {!canAdjustToday && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Opening adjustments are available only for today and admin users.
                  </p>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Date</label>
                  <Input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Station</label>
                  <select
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={stationHistoryId}
                    onChange={(event) => setStationHistoryId(event.target.value)}
                  >
                    <option value="">All Stations</option>
                    {history.stations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Search</label>
                  <Input value={stationSearch} onChange={(event) => setStationSearch(event.target.value)} placeholder="Search item or station" />
                </div>
                <div className="flex items-end gap-2">
                  {adjustScope === "station" ? (
                    <>
                      <Button type="button" onClick={() => saveAdjustments("station")} disabled={savingAdjustments} className="flex-1">
                        {savingAdjustments ? "Saving..." : "Save"}
                      </Button>
                      <Button type="button" variant="outline" onClick={cancelAdjustments} disabled={savingAdjustments} className="flex-1">
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => beginAdjustments("station")}
                        disabled={!canAdjustToday || loadingHistory}
                        className="flex-1"
                      >
                        Adjust Opening
                      </Button>
                      <Button type="button" variant="outline" onClick={loadHistory} disabled={loadingHistory} className="flex-1">
                        <RefreshCw className={`mr-2 h-4 w-4 ${loadingHistory ? "animate-spin" : ""}`} />
                        Refresh
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5">
              {loadingHistory ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading station history...
                </div>
              ) : (
                <HistoryTable
                  rows={stationHistoryRows}
                  type="station"
                  isAdjusting={adjustScope === "station"}
                  openingDrafts={openingDrafts}
                  onDraftChange={updateDraft}
                />
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="store-history" className="space-y-5">
          <Card className="inventory-panel p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Store Daily History</h3>
                <p className="text-sm text-muted-foreground">
                  Opening, purchased, transferred out, and closing stock for the selected business day.
                </p>
                {!canAdjustToday && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Opening adjustments are available only for today and admin users.
                  </p>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium">Date</label>
                  <Input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Search</label>
                  <Input value={storeSearch} onChange={(event) => setStoreSearch(event.target.value)} placeholder="Search inventory item" />
                </div>
                <div className="flex items-end gap-2">
                  {adjustScope === "store" ? (
                    <>
                      <Button type="button" onClick={() => saveAdjustments("store")} disabled={savingAdjustments} className="flex-1">
                        {savingAdjustments ? "Saving..." : "Save"}
                      </Button>
                      <Button type="button" variant="outline" onClick={cancelAdjustments} disabled={savingAdjustments} className="flex-1">
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => beginAdjustments("store")}
                        disabled={!canAdjustToday || loadingHistory}
                        className="flex-1"
                      >
                        Adjust Opening
                      </Button>
                      <Button type="button" variant="outline" onClick={loadHistory} disabled={loadingHistory} className="flex-1">
                        <RefreshCw className={`mr-2 h-4 w-4 ${loadingHistory ? "animate-spin" : ""}`} />
                        Refresh
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5">
              {loadingHistory ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading store history...
                </div>
              ) : (
                <HistoryTable
                  rows={storeHistoryRows}
                  type="store"
                  isAdjusting={adjustScope === "store"}
                  openingDrafts={openingDrafts}
                  onDraftChange={updateDraft}
                />
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="current" className="space-y-5">
          <Card className="inventory-panel p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Store and Station Matrix</h3>
                <p className="text-sm text-muted-foreground">
                  Live stock by inventory item across the store and every station.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={searchCurrent}
                  onChange={(event) => setSearchCurrent(event.target.value)}
                  placeholder="Search inventory item"
                  className="w-full md:w-72"
                />
                <Button type="button" variant="outline" onClick={loadOverview} disabled={loadingOverview}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${loadingOverview ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="inventory-table-shell mt-5">
              {loadingOverview ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading stock matrix...
                </div>
              ) : (
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="inventory-table-head">
                    <tr>
                      <th className="px-4 py-3 font-medium">Item</th>
                      <th className="px-4 py-3 font-medium text-right">Shots/Bottle</th>
                      <th className="px-4 py-3 font-medium text-right">Store</th>
                      {overview.stations.map((station) => (
                        <th key={station.id} className="px-4 py-3 font-medium text-right">
                          {station.name}
                        </th>
                      ))}
                      <th className="px-4 py-3 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOverviewRows.length === 0 ? (
                      <tr>
                        <td colSpan={overview.stations.length + 4} className="px-4 py-10 text-center text-muted-foreground">
                          No stock rows match this search.
                        </td>
                      </tr>
                    ) : (
                      filteredOverviewRows.map((row) => (
                        <tr key={row.inventory_item_id} className="inventory-table-row">
                          <td className="px-4 py-3 font-medium">{row.inventory_item_name}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-foreground">{numberFormat.format(Number(row.shots_per_bottle || 0))}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Qty value={row.store_quantity} shotsPerBottle={row.shots_per_bottle} strong />
                          </td>
                          {row.stations.map((station) => (
                            <td key={station.station_id} className="px-4 py-3 text-right">
                              <Qty value={station.quantity} shotsPerBottle={row.shots_per_bottle} />
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right">
                            <Qty value={row.total_quantity} shotsPerBottle={row.shots_per_bottle} strong />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
