import type { ConsoleController } from "../hooks/useConsole";

type Props = Pick<
  ConsoleController,
  "exported" | "copyConfig" | "download" | "busy"
>;
export function ConfigExport({ exported, copyConfig, download, busy }: Props) {
  if (!exported) return null;
  return (
    <div className="export">
      <p>使用 WireGuard 客户端扫描二维码</p>
      <img
        src={exported.qr}
        width="280"
        height="280"
        alt="包含客户端私钥的 WireGuard 配置二维码"
      />
      <p className="muted">二维码和配置包含私钥，请妥善保管。</p>
      <details>
        <summary>查看配置</summary>
        <pre>{exported.config}</pre>
      </details>
      <div className="dialog-actions">
        <button disabled={busy} onClick={() => void copyConfig()}>
          复制配置
        </button>
        <button disabled={busy} className="primary" onClick={download}>
          下载 .conf
        </button>
      </div>
    </div>
  );
}
