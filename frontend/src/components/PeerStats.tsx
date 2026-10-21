import type { ConsoleController } from "../hooks/useConsole";

type Props = Pick<ConsoleController, "peers" | "online" | "data">;
export function PeerStats({ peers, online, data }: Props) {
  return (
    <div className="stats">
      <article>
        <span>全部 Peers</span>
        <strong>{peers.length.toString().padStart(2, "0")}</strong>
        <small>已配置的连接设备</small>
        <i>◈</i>
      </article>
      <article>
        <span>
          活跃连接 <b className="dot" />
        </span>
        <strong>{online.toString().padStart(2, "0")}</strong>
        <small>最近 {data?.onlineSeconds ?? 180} 秒内有握手</small>
        <i>↗</i>
      </article>
      <article>
        <span>WireGuard 接口</span>
        <strong>
          {(data?.interfaces.length ?? 0).toString().padStart(2, "0")}
        </strong>
        <small>已配置地址池的接口</small>
        <i>⌘</i>
      </article>
    </div>
  );
}
