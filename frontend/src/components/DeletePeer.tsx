import type { ConsoleController } from "../hooks/useConsole";

type Props = Pick<
  ConsoleController,
  "remove" | "busy" | "close" | "deletePeer"
>;
export function DeletePeer({ remove, busy, close, deletePeer }: Props) {
  if (!remove) return null;
  return (
    <>
      <p>
        确定删除 <strong>{remove.comment || remove.id}</strong>
        ？设备将无法继续通过此 Peer 连接。
      </p>
      <div className="dialog-actions">
        <button disabled={busy} onClick={close}>
          取消
        </button>
        <button
          className="danger"
          disabled={busy}
          onClick={() => void deletePeer()}
        >
          {busy ? "正在删除…" : "确认删除"}
        </button>
      </div>
    </>
  );
}
