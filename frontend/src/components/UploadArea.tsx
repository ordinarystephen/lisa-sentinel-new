/**
 * Composes the inline tabs (Upload new / Browse existing) plus the drop
 * zone, file list, folder-path input, and selection summary.
 *
 * Calls `POST /api/documents/upload` for the upload tab and
 * `GET /api/documents` (via BrowseExisting) for the browse tab. After
 * successful upload, freshly added hashes are added to the working set
 * automatically.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderUp, X } from "lucide-react";

import { apiPost, apiPostMultipart, ApiError } from "@/lib/api";
import { useSession } from "@/contexts/useSession";
import type { DocumentMetadata, UploadResponse } from "@/lib/types";

import { BrowseExisting } from "./BrowseExisting";
import { Button } from "./Button";
import { DropZone } from "./DropZone";
import { FileList, type PendingUpload } from "./FileList";
import { IconButton } from "./IconButton";
import { Input } from "./Input";
import { Tabs } from "./Tabs";

type TabValue = "upload" | "browse";

interface UploadAreaProps {
  selectedHashes: string[];
  onChangeSelection: (hashes: string[]) => void;
  documentsByHash: Record<string, DocumentMetadata>;
  registerDocuments: (docs: DocumentMetadata[]) => void;
}

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function UploadArea({
  selectedHashes,
  onChangeSelection,
  documentsByHash,
  registerDocuments,
}: UploadAreaProps) {
  const [activeTab, setActiveTab] = useState<TabValue>("upload");
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [folderPath, setFolderPath] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [liveStatus, setLiveStatus] = useState("");
  const { pushToast } = useSession();
  const uploadingIds = useRef<Set<string>>(new Set());

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const queued: PendingUpload[] = files.map((f) => ({
        id: genId(),
        file: f,
        status: "pending",
      }));
      setUploads((prev) => [...prev, ...queued]);
      setLiveStatus(`${files.length} file${files.length === 1 ? "" : "s"} added to upload queue`);

      // why: upload sequentially — keeps the UI predictable, doesn't slam
      // the Flask process during the layout phase. Stage 3 may parallelise
      // if it becomes worth it.
      for (const item of queued) {
        await uploadOne(item);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function uploadOne(item: PendingUpload) {
    uploadingIds.current.add(item.id);
    setUploads((prev) =>
      prev.map((u) => (u.id === item.id ? { ...u, status: "uploading" } : u)),
    );
    try {
      const formData = new FormData();
      formData.append("file", item.file);
      const res = await apiPostMultipart<UploadResponse>("documents/upload", formData);
      registerDocuments(res.documents ?? []);
      const newHashes = (res.documents ?? []).map((d) => d.hash);
      onChangeSelection([...new Set([...selectedHashes, ...newHashes])]);
      setUploads((prev) =>
        prev.map((u) => (u.id === item.id ? { ...u, status: "done" } : u)),
      );
      setLiveStatus(`Uploaded ${item.file.name}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      setUploads((prev) =>
        prev.map((u) =>
          u.id === item.id ? { ...u, status: "error", errorMessage: msg } : u,
        ),
      );
      pushToast(`Upload failed: ${item.file.name}`, "error");
      setLiveStatus(`Upload failed for ${item.file.name}: ${msg}`);
    } finally {
      uploadingIds.current.delete(item.id);
    }
  }

  async function uploadFolder() {
    const path = folderPath.trim();
    if (!path) return;
    setFolderBusy(true);
    try {
      const res = await apiPost<UploadResponse>("documents/upload", { folder_path: path });
      registerDocuments(res.documents ?? []);
      const newHashes = (res.documents ?? []).map((d) => d.hash);
      onChangeSelection([...new Set([...selectedHashes, ...newHashes])]);
      pushToast(
        `Imported ${res.documents?.length ?? 0} document(s) from folder`,
        "success",
      );
      setFolderPath("");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      pushToast(`Folder import failed: ${msg}`, "error");
    } finally {
      setFolderBusy(false);
    }
  }

  function removeUpload(id: string) {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }

  // why: clear live-status string after each announcement so screen
  // readers don't repeat stale text.
  useEffect(() => {
    if (!liveStatus) return;
    const t = setTimeout(() => setLiveStatus(""), 4000);
    return () => clearTimeout(t);
  }, [liveStatus]);

  const summaryCount = selectedHashes.length;

  return (
    <section aria-labelledby="upload-area-heading" className="flex flex-col gap-4">
      <h2 id="upload-area-heading" className="text-20 font-semibold text-ink">
        1. Choose documents
      </h2>
      <Tabs<TabValue>
        ariaLabel="Document source"
        tabs={[
          { value: "upload", label: "Upload new" },
          { value: "browse", label: "Browse existing" },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "upload" ? (
        <div className="flex flex-col gap-4">
          <DropZone onFiles={handleFiles} liveStatus={liveStatus} />
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="Or paste a folder path"
                placeholder="/storage/credit/q4-pipeline"
                value={folderPath}
                onChange={(ev) => setFolderPath(ev.target.value)}
                helperText="Server-side folder; PDFs inside are imported into the doc store."
              />
            </div>
            <Button
              variant="secondary"
              iconLeft={<FolderUp size={14} />}
              onClick={uploadFolder}
              disabled={!folderPath.trim() || folderBusy}
            >
              {folderBusy ? "Importing…" : "Import folder"}
            </Button>
          </div>
          <FileList uploads={uploads} onRemove={removeUpload} />
        </div>
      ) : (
        <BrowseExisting selectedHashes={selectedHashes} onChangeSelection={onChangeSelection} />
      )}

      {summaryCount > 0 ? (
        <div className="flex items-center justify-between rounded-md border border-rule bg-bg-subtle px-4 py-3">
          <p className="m-0 text-14 text-ink">
            <span className="font-medium">{summaryCount}</span> document
            {summaryCount === 1 ? "" : "s"} selected for processing
            <span className="ml-2 text-ink-subtle">
              {selectedHashes
                .slice(0, 3)
                .map((h) => documentsByHash[h]?.filename)
                .filter(Boolean)
                .join(", ")}
              {summaryCount > 3 ? "…" : ""}
            </span>
          </p>
          <IconButton aria-label="Clear selection" onClick={() => onChangeSelection([])}>
            <X size={14} />
          </IconButton>
        </div>
      ) : null}
    </section>
  );
}
