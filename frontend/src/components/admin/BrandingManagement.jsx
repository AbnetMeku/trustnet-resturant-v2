import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEFAULT_BRANDING,
  getBrandingSettings,
  updateBrandingSettings,
  uploadBrandingAsset,
} from "@/api/branding";
import { getApiErrorMessage } from "@/lib/apiError";

export default function BrandingManagement() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [form, setForm] = useState({
    logo_url: "",
    background_url: "",
    business_day_start_time: "06:00",
    print_preview_enabled: false,
    kds_mark_unavailable_enabled: false,
  });
  const [preview, setPreview] = useState(DEFAULT_BRANDING);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getBrandingSettings();
        setForm({
          logo_url: data.custom_logo_url || "",
          background_url: data.custom_background_url || "",
          business_day_start_time: data.business_day_start_time || "06:00",
          print_preview_enabled: Boolean(data.print_preview_enabled),
          kds_mark_unavailable_enabled: Boolean(data.kds_mark_unavailable_enabled),
        });
        setPreview(data);
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Failed to load settings. Please refresh and try again."));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await updateBrandingSettings({
        logo_url: form.logo_url,
        background_url: form.background_url,
        business_day_start_time: form.business_day_start_time,
        print_preview_enabled: Boolean(form.print_preview_enabled),
        kds_mark_unavailable_enabled: Boolean(form.kds_mark_unavailable_enabled),
      });
      setForm({
        logo_url: data.custom_logo_url || "",
        background_url: data.custom_background_url || "",
        business_day_start_time: data.business_day_start_time || "06:00",
        print_preview_enabled: Boolean(data.print_preview_enabled),
        kds_mark_unavailable_enabled: Boolean(data.kds_mark_unavailable_enabled),
      });
      setPreview(data);
      toast.success("Settings updated successfully");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update settings."));
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setSaving(true);
    try {
      const data = await updateBrandingSettings({
        logo_url: "",
        background_url: "",
        business_day_start_time: "06:00",
        print_preview_enabled: false,
        kds_mark_unavailable_enabled: false,
      });
      setForm({
        logo_url: data.custom_logo_url || "",
        background_url: data.custom_background_url || "",
        business_day_start_time: data.business_day_start_time || "06:00",
        print_preview_enabled: Boolean(data.print_preview_enabled),
        kds_mark_unavailable_enabled: Boolean(data.kds_mark_unavailable_enabled),
      });
      setPreview(data);
      toast.success("Settings reset to defaults");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to reset settings."));
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (assetType, file) => {
    if (!file) return;
    const maxSizeBytes = 5 * 1024 * 1024;
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (file.size > maxSizeBytes) {
      toast.error(`Selected file is too large (${(file.size / (1024 * 1024)).toFixed(2)} MB). Max allowed is 5 MB.`);
      return;
    }
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      toast.error(`Unsupported file type '${file.type || "unknown"}'. Use PNG, JPG, JPEG, or WEBP.`);
      return;
    }

    const setLoadingState = assetType === "logo" ? setUploadingLogo : setUploadingBackground;
    setLoadingState(true);
    try {
      const data = await uploadBrandingAsset(assetType, file);
      setForm({
        logo_url: data.custom_logo_url || "",
        background_url: data.custom_background_url || "",
        business_day_start_time: data.business_day_start_time || "06:00",
        print_preview_enabled: Boolean(data.print_preview_enabled),
        kds_mark_unavailable_enabled: Boolean(data.kds_mark_unavailable_enabled),
      });
      setPreview(data);
      toast.success(`${assetType === "logo" ? "Logo" : "Background"} uploaded`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, `Failed to upload ${assetType}. Check file type/size and try again.`));
    } finally {
      setLoadingState(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-500 dark:text-slate-300">Loading settings...</div>;
  }

  return (
    <div className="space-y-4">
      <Card className="admin-card overflow-hidden">
        <div className="admin-hero px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <h3 className="text-xl font-semibold">Settings</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Logo</p>
                <p className="text-sm font-medium">{preview.custom_logo_url ? "Custom" : "Default"}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Background</p>
                <p className="text-sm font-medium">{preview.custom_background_url ? "Custom" : "Default"}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="admin-toolbar p-4 md:p-6">
          <Button
            variant="outline"
            onClick={handleResetDefaults}
            disabled={saving}
            className="border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Reset to Default
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="admin-card p-4 space-y-4 backdrop-blur-sm">
          <div>
            <h4 className="font-medium">Assets</h4>
          </div>

          <div className="space-y-2">
            <Label htmlFor="branding-logo-upload">Logo Upload</Label>
            <Input
              id="branding-logo-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                handleUpload("logo", file);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">PNG/JPG/WEBP up to 5 MB.</p>
            {uploadingLogo && <p className="text-xs text-blue-600 dark:text-blue-400">Uploading logo...</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="branding-business-day-start">Business Day Start Time</Label>
            <Input
              id="branding-business-day-start"
              type="time"
              value={form.business_day_start_time}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  business_day_start_time: e.target.value || "06:00",
                }))
              }
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Defines when a new business day starts (Ethiopian time).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="branding-print-preview">Print Worker Preview</Label>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
              <Checkbox
                id="branding-print-preview"
                checked={form.print_preview_enabled}
                onCheckedChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    print_preview_enabled: Boolean(value),
                  }))
                }
              />
              <span className="text-sm text-slate-700 dark:text-slate-200">
                Show ticket simulation preview on the print worker screen
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="branding-kds-mark-unavailable">KDS Mark Unavailable</Label>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
              <Checkbox
                id="branding-kds-mark-unavailable"
                checked={form.kds_mark_unavailable_enabled}
                onCheckedChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    kds_mark_unavailable_enabled: Boolean(value),
                  }))
                }
              />
              <span className="text-sm text-slate-700 dark:text-slate-200">
                Allow stations to mark pending items as not available (void)
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="branding-background-upload">Background Upload</Label>
            <Input
              id="branding-background-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                handleUpload("background", file);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">PNG/JPG/WEBP up to 5 MB.</p>
            {uploadingBackground && <p className="text-xs text-blue-600 dark:text-blue-400">Uploading background...</p>}
          </div>

          <div className="pt-1">
            <Button onClick={handleSave} disabled={saving || uploadingLogo || uploadingBackground}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </Card>

        <Card className="admin-card p-4 space-y-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Live Preview</h4>
            <span className="text-xs text-slate-500 dark:text-slate-400">Current settings</span>
          </div>

          <div
            className="relative h-64 rounded-lg bg-cover bg-center overflow-hidden border border-slate-200 dark:border-slate-700"
            style={{ backgroundImage: `url('${preview.background_url}')` }}
          >
            <div className="absolute inset-0 bg-black/45" />
            <div className="relative z-10 h-full flex flex-col items-center justify-center gap-3 px-4 text-center">
              <img
                src={preview.logo_url}
                alt="Brand Logo"
                className="w-24 h-24 object-contain bg-white/90 rounded-full p-2"
              />
              <p className="text-white text-sm font-medium">TrustNet Restaurant</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-slate-700 dark:text-slate-200">
              <span className="font-medium">Logo source:</span> {preview.custom_logo_url ? "Custom" : "Default"}
            </div>
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-slate-700 dark:text-slate-200">
              <span className="font-medium">Background source:</span> {preview.custom_background_url ? "Custom" : "Default"}
            </div>
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-slate-700 dark:text-slate-200 col-span-2">
              <span className="font-medium">Business day starts at:</span> {preview.business_day_start_time || "06:00"}
            </div>
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-slate-700 dark:text-slate-200 col-span-2">
              <span className="font-medium">Print worker preview:</span>{" "}
              {preview.print_preview_enabled ? "Enabled" : "Disabled"}
            </div>
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-slate-700 dark:text-slate-200 col-span-2">
              <span className="font-medium">KDS mark unavailable:</span>{" "}
              {preview.kds_mark_unavailable_enabled ? "Enabled" : "Disabled"}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
