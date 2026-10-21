import type { ConsoleController } from "../hooks/useConsole";
import { PeerTable } from "./PeerTable";
export function PeerPanel({ controller }: { controller: ConsoleController }) {
  const {
    peers,
    updated,
    search,
    setSearch,
    filter,
    setFilter,
    data,
    busy,
    refresh,
    visible,
  } = controller;
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>
          连接设备 <span>{peers.length}</span>
        </h2>
        <span className="sync">
          <b className="dot" /> {updated ? `更新于 ${updated}` : "等待连接"} ·
          每 10 秒刷新
        </span>
      </div>
      <div className="toolbar">
        <label className="search">
          <span>⌕</span>
          <input
            aria-label="搜索 Peer"
            placeholder="搜索备注、IP 地址或公钥…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="筛选接口"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">所有接口</option>
          {Array.from(
            new Set([
              ...peers.map((p) => p.interface),
              ...(data?.interfaces.map((i) => i.name) ?? []),
            ]),
          ).map((i) => (
            <option key={i}>{i}</option>
          ))}
        </select>
        <button disabled={busy} onClick={() => void refresh()}>
          ↻ 刷新
        </button>
      </div>
      <PeerTable {...controller} />
      <div className="panel-footer">
        <span>
          显示 {visible.length} / {peers.length} 个 Peers
        </span>
        <span>状态依据握手时间估算</span>
      </div>
    </section>
  );
}
