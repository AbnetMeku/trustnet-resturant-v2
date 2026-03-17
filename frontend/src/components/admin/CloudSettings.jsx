import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { getCloudConfig, updateCloudConfig } from "@/api/cloudConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { getApiErrorMessage } from "@/lib/apiError";

const EMPTY_CONFIG = {
  tenant_id: "",
  store_id: "",
  device_id: "",
  device_name: "",
  machine_fingerprint: "",
  cloud_base_url: "",
  license_key: "",
  license_status: "unknown",
  license_is_valid: false,
  license_active: false,
  license_last_validated_at: null,
  license_expires_at: null,
  license_grace_until: null,
  license_last_error: null,
};

export default function CloudSettings({ view = "all" }) {
  const { authToken } = useAuth();
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const showOperation = view === "all" || view === "operation";
  const showLicense = view === "all" || view === "license";

  const headerTitle = view === "license" ? "License" : view === "operation" ? "Operation" : "Cloud Settings";
  const headerSubtitle =
    view === "license"
      ? "Update the license key to re-activate this device."
      : "Device identity is generated automatically and cannot be edited.";

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await getCloudConfig(authToken);
      const next = { ...EMPTY_CONFIG, ...(data || {}) };
      setConfig(next);
      setLicenseKey(next.license_key || "");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load cloud settings."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, [authToken]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await updateCloudConfig(
        { license_key: licenseKey },
        authToken
      );
      const next = { ...EMPTY_CONFIG, ...(data || {}) };
      setConfig(next);
      setLicenseKey(next.license_key || "");
      toast.success("License key updated.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update license key."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-300">
        Loading cloud settings...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">{headerTitle}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{headerSubtitle}</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadConfig}>
          Refresh
        </Button>
      </div>

      {showOperation && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Device ID</Label>
            <Input value={config.device_id || ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Device Fingerprint</Label>
            <Input value={config.machine_fingerprint || ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Device Name</Label>
            <Input value={config.device_name || ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Cloud Base URL</Label>
            <Input value={config.cloud_base_url || ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Tenant ID</Label>
            <Input value={config.tenant_id ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Store ID</Label>
            <Input value={config.store_id ?? ""} readOnly />
          </div>
        </div>
      )}

      {showLicense && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    config.license_active
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                  }`}
                >
                  {config.license_active ? "Active" : "Inactive"}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {config.license_status || "unknown"}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Device Name</Label>
              <Input value={config.device_name || ""} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Device Fingerprint</Label>
              <Input value={config.machine_fingerprint || ""} readOnly />
            </div>
            {config.license_last_error && (
              <div className="space-y-2 md:col-span-2">
                <Label>Last Error</Label>
                <div className="rounded-md border border-rose-200/70 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-200">
                  {config.license_last_error}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>License Key</Label>
            <Input
              value={licenseKey}
              onChange={(event) => setLicenseKey(event.target.value)}
              placeholder="Enter license key"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Update the license key here. The next sync cycle will re-activate the device.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save License"}
          </Button>
        </>
      )}
    </div>
  );
}
