import { useEffect, useRef } from "react";
import type { ConsoleController } from "../hooks/useConsole";
import { PeerEditor } from "./PeerEditor";
import { DeletePeer } from "./DeletePeer";
import { ConfigExport } from "./ConfigExport";
export function PeerDialogs({ controller }: { controller: ConsoleController }) {
  const { editor, remove, exported, busy, close, error } = controller;
  const ref = useRef<HTMLDialogElement>(null);
  const open = !!(editor || remove || exported);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  const title = editor
    ? editor.id
      ? "编辑 Peer"
      : "新增 Peer"
    : remove
      ? "删除 Peer"
      : "客户端配置";
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-label={title}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button aria-label="关闭弹窗" disabled={busy} onClick={close}>
          ✕
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <PeerEditor {...controller} />
      <DeletePeer {...controller} />
      <ConfigExport {...controller} />
    </dialog>
  );
}
