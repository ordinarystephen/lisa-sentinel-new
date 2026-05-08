/**
 * Pending-uploads list. Each row shows filename, size, status, and an
 * X to remove.
 */

import { Trash2 } from "lucide-react";

import { formatBytes } from "@/lib/format";

import { Badge } from "./Badge";
import { IconButton } from "./IconButton";
import { Spinner } from "./Spinner";

export type UploadStatus = "pending" | "uploading" | "done" | "error";

export interface PendingUpload {
  id: string;
  file: File;
  status: UploadStatus;
  errorMessage?: string;
}

interface FileListProps {
  uploads: PendingUpload[];
  onRemove: (id: string) => void;
}

const STATUS_VARIANT = {
  pending: "neutral",
  uploading: "neutral",
  done: "success",
  error: "error",
} as const;

const STATUS_LABEL = {
  pending: "pending",
  uploading: "uploading",
  done: "uploaded",
  error: "failed",
} as const;

export function FileList({ uploads, onRemove }: FileListProps) {
  if (uploads.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y divide-rule rounded-md border border-rule">
      {uploads.map((u) => (
        <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-14 text-ink">{u.file.name}</span>
            <span className="text-12 text-ink-subtle">
              {formatBytes(u.file.size)}
              {u.errorMessage ? ` · ${u.errorMessage}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {u.status === "uploading" ? <Spinner /> : null}
            <Badge variant={STATUS_VARIANT[u.status]}>{STATUS_LABEL[u.status]}</Badge>
            <IconButton aria-label={`Remove ${u.file.name}`} onClick={() => onRemove(u.id)}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        </li>
      ))}
    </ul>
  );
}
