"use client";

import { useState, useCallback } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
};

export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback((opts: ConfirmOptions | string): Promise<boolean> => {
    const normalized: ConfirmOptions = typeof opts === "string" ? { message: opts } : opts;
    return new Promise(resolve => {
      setState({ open: true, opts: normalized, resolve });
    });
  }, []);

  const dialog = state ? (
    <ConfirmDialog
      open={state.open}
      title={state.opts.title ?? "Are you sure?"}
      message={state.opts.message}
      confirmLabel={state.opts.confirmLabel}
      cancelLabel={state.opts.cancelLabel}
      variant={state.opts.variant}
      onConfirm={() => { setState(null); state.resolve(true); }}
      onCancel={() => { setState(null); state.resolve(false); }}
    />
  ) : null;

  return { confirm, dialog };
}
