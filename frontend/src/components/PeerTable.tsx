import type { ConsoleController } from "../hooks/useConsole";
import { bytes, states } from "../lib/format";
type Props = Pick<
  ConsoleController,
  | "visible"
  | "busy"
  | "showConfig"
  | "editPeer"
  | "setRemove"
  | "search"
  | "data"
>;
export function PeerTable({
  visible,
  busy,
  showConfig,
  editPeer,
  setRemove,
  search,
  data,
}: Props) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>设备 / 备注</th>
            <th>状态</th>
            <th>接口 / 地址</th>
            <th>流量 ↓ / ↑</th>
            <th>最近握手</th>
            <th className="right">操作</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((p) => (
            <tr key={p.id}>
              <td>
                <div className="device">
                  <span className="device-icon">▧</span>
                  <div>
                    <strong>{p.comment || "未命名设备"}</strong>
                    <small title={p.publicKey}>
                      {p.publicKey.slice(0, 12)}…
                    </small>
                  </div>
                </div>
              </td>
              <td>
                <span className={`badge ${p.status}`}>
                  <b className="dot" />
                  {states[p.status]}
                </span>
              </td>
              <td>
                <span className="interface">{p.interface}</span>
                <small className="address">{p.address}</small>
              </td>
              <td className="traffic">
                <span>↓ {bytes(p.rx)}</span>
                <small>↑ {bytes(p.tx)}</small>
              </td>
              <td>
                <span>{p.lastHandshake || "—"}</span>
                <small className="address">{p.endpoint || "尚无端点"}</small>
              </td>
              <td>
                <div className="actions">
                  <button
                    disabled={busy || !p.hasConfig}
                    title={
                      p.hasConfig
                        ? "二维码与客户端配置"
                        : "RouterOS 未返回此 Peer 的客户端私钥"
                    }
                    onClick={() => void showConfig(p)}
                  >
                    二维码
                  </button>
                  <button disabled={busy} onClick={() => editPeer(p)}>
                    编辑
                  </button>
                  <button
                    className="danger-link"
                    disabled={busy}
                    onClick={() => setRemove(p)}
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {visible.length === 0 && (
        <div className="empty">
          <span>◈</span>
          <h3>
            {search
              ? "没有匹配的设备"
              : data
                ? "还没有 Peer"
                : "正在连接路由器"}
          </h3>
          <p>
            {data
              ? "选择接口并添加一个设备，即可开始连接。"
              : "请等待数据加载；连接失败时可点击刷新重试。"}
          </p>
        </div>
      )}
    </div>
  );
}
