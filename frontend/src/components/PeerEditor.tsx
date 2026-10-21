import type { ConsoleController } from "../hooks/useConsole";

type Props = Pick<
  ConsoleController,
  "editor" | "save" | "data" | "setEditor" | "busy" | "close"
>;
export function PeerEditor({
  editor,
  save,
  data,
  setEditor,
  busy,
  close,
}: Props) {
  if (!editor) return null;
  return (
    <form onSubmit={save}>
      <p className="muted">只需设置接口和备注，其他参数自动生成。</p>
      <label>
        WG Interface
        <select
          required
          disabled={busy}
          value={editor.interface}
          onChange={(e) => setEditor({ ...editor, interface: e.target.value })}
        >
          {!data?.interfaces.some((i) => i.name === editor.interface) && (
            <option value={editor.interface}>
              {editor.interface}（未配置）
            </option>
          )}
          {data?.interfaces.map((i) => (
            <option key={i.name} value={i.name} disabled={i.disabled}>
              {i.name}
              {i.disabled ? "（已禁用）" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Comment / 备注
        <input
          autoFocus
          disabled={busy}
          value={editor.comment}
          maxLength={66}
          placeholder="例如：我的 MacBook"
          onChange={(e) => setEditor({ ...editor, comment: e.target.value })}
        />
      </label>
      <div className="auto-settings">
        <span>
          自动分配地址{" "}
          <code>
            {data?.interfaces.find((i) => i.name === editor.interface)?.pool ??
              "未配置"}
          </code>
        </span>
        <span>
          客户端 AllowedIPs <code>{data?.allowedIPs.join(", ")}</code>
        </span>
        <span>
          密钥{" "}
          <code>
            {editor.id
              ? "保留现有密钥"
              : "已生成 X25519 密钥对，将写入 RouterOS Peer"}
          </code>
        </span>
      </div>
      {editor.id && (
        <p className="muted">
          切换接口会重新分配地址，原客户端需要重新导入配置。
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" disabled={busy} onClick={close}>
          取消
        </button>
        <button className="primary" disabled={busy}>
          {busy ? "正在保存…" : "保存 Peer"}
        </button>
      </div>
    </form>
  );
}
