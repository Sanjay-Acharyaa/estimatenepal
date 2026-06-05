"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as pdfjsLib from "pdfjs-dist";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

const MAX_SIZE = 50 * 1024 * 1024;
const MAX_PAGES = 100;

type FolderOption = { id: string; name: string };

type Props = {
  projectId: string;
  parentDrawingId?: string;
  folderId?: string | null;
  folders?: FolderOption[];
  onClose?: () => void;
  onCancel?: () => void;
  onUploaded?: (drawing: unknown) => void;
};

export function DrawingUpload({ projectId, parentDrawingId, folderId: initialFolderId, folders, onClose, onCancel, onUploaded }: Props) {
  const dismiss = onClose ?? onCancel;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [revisionNumber, setRevisionNumber] = useState("");
  const [folderId, setFolderId] = useState<string | null>(initialFolderId ?? null);
  const [status, setStatus] = useState<"idle" | "validating" | "uploading" | "registering" | "thumbnail" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function handleFile(f: File) {
    setError("");
    if (f.type !== "application/pdf") {
      setError("Only PDF files are allowed.");
      return;
    }
    if (f.size > MAX_SIZE) {
      setError("File must be ≤ 50 MB.");
      return;
    }
    setFile(f);
  }

  async function generateThumbnail(pdf: pdfjsLib.PDFDocumentProxy): Promise<Blob | null> {
    try {
      const page = await pdf.getPage(1);
      const THUMB_WIDTH = 800;
      const vp0 = page.getViewport({ scale: 1 });
      const scale = THUMB_WIDTH / vp0.width;
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx as any, viewport: vp } as any).promise;
      return await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.92));
    } catch {
      return null;
    }
  }

  async function handleUpload() {
    if (!file) return;
    setError("");

    // 1. Validate page count using PDF.js in the browser
    setStatus("validating");
    let pageCount: number;
    let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
    try {
      const buffer = await file.arrayBuffer();
      pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
      pageCount = pdfDoc.numPages;
      if (pageCount > MAX_PAGES) {
        setError(`PDF has ${pageCount} pages — maximum is ${MAX_PAGES}.`);
        setStatus("idle");
        return;
      }
    } catch {
      setError("Could not read PDF. Make sure the file is a valid PDF.");
      setStatus("idle");
      return;
    }

    // 2. Get pre-signed upload URL
    setStatus("uploading");
    const urlRes = await fetch(`/api/projects/${projectId}/drawings/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, fileSize: file.size, contentType: "application/pdf" }),
    });
    if (!urlRes.ok) {
      const d = await urlRes.json();
      setError(d.error?.message ?? "Failed to get upload URL.");
      setStatus("error");
      return;
    }
    const { uploadUrl, key } = await urlRes.json();

    // 3. Upload directly to MinIO/R2 via XHR (for progress tracking)
    let uploadFailed = false;
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", "application/pdf");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(file);
    }).catch((e) => {
      uploadFailed = true;
      setError(e.message);
      setStatus("error");
    });

    if (uploadFailed) return;

    // 4. Register drawing in DB
    setStatus("registering");
    const regRes = await fetch(`/api/projects/${projectId}/drawings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileKey: key,
        pageCount,
        revisionNumber: revisionNumber || undefined,
        parentDrawingId,
        folderId: folderId ?? undefined,
      }),
    });

    if (!regRes.ok) {
      const d = await regRes.json();
      setError(d.error?.message ?? "Failed to register drawing.");
      setStatus("error");
      return;
    }

    const drawing = await regRes.json();

    // 5. Generate + upload thumbnail (non-blocking — silently skipped on failure)
    setStatus("thumbnail");
    if (pdfDoc) {
      const blob = await generateThumbnail(pdfDoc);
      if (blob) {
        await fetch(`/api/projects/${projectId}/drawings/${drawing.id}/thumbnail`, {
          method: "PUT",
          headers: { "Content-Type": "image/webp" },
          body: blob,
        }).catch(() => {});
      }
    }

    setStatus("done");
    if (onUploaded) {
      onUploaded(drawing);
    } else {
      router.refresh();
      setTimeout(() => (onClose ?? onCancel)?.(), 800);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">
            {parentDrawingId ? "Upload Revision" : "Upload Drawing"}
          </h2>
          <button onClick={dismiss} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {folders && folders.length > 0 && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Upload to folder</label>
            <select
              value={folderId ?? ""}
              onChange={e => setFolderId(e.target.value || null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No folder (uncategorized)</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
        )}

        {status === "done" ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-green-700 font-medium">Drawing uploaded successfully!</p>
          </div>
        ) : (
          <>
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition mb-4"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              {file ? (
                <div>
                  <p className="text-sm font-medium text-gray-800">{file.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-500">Drop a PDF here or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">PDF only · Max 50 MB · Max 100 pages</p>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Revision Number (optional)</label>
              <input
                type="text"
                value={revisionNumber}
                onChange={(e) => setRevisionNumber(e.target.value)}
                placeholder="e.g. Rev A, Rev 2"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {(status === "uploading" || status === "registering" || status === "thumbnail") && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{status === "uploading" ? "Uploading…" : status === "registering" ? "Registering…" : "Generating thumbnail…"}</span>
                  <span>{status === "uploading" ? `${progress}%` : ""}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-200"
                    style={{ width: status === "registering" ? "100%" : `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleUpload}
                disabled={!file || status !== "idle"}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg text-sm transition disabled:opacity-50"
              >
                {status === "validating" ? "Validating…" : status === "idle" ? "Upload" : status === "thumbnail" ? "Finishing…" : "…"}
              </button>
              <button onClick={dismiss} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
