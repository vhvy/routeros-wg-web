import { useConsole } from "./hooks/useConsole";
import { LoginPage } from "./pages/LoginPage";
import { ConsoleLayout } from "./components/ConsoleLayout";
import { PeerStats } from "./components/PeerStats";
import { PeerPanel } from "./components/PeerPanel";
import { PeerDialogs } from "./components/PeerDialogs";
export function App() {
  const controller = useConsole();
  const {
    checking,
    logged,
    busy,
    data,
    createPeer,
    error,
    setError,
    notice,
    setNotice,
  } = controller;
  if (checking)
    return (
      <main className="login">
        <p>正在加载控制台…</p>
      </main>
    );
  if (!logged) return <LoginPage {...controller} />;
  return (
    <ConsoleLayout {...controller}>
      <main id="peers">
        <div className="page-title">
          <div>
            <span className="eyebrow">YOUR PRIVATE NETWORK</span>
            <h1>
              Peers 管理<span className="title-dot">.</span>
            </h1>
            <p>集中管理连接设备，让每一次连接清晰可见。</p>
          </div>
          <button
            className="primary"
            disabled={busy || !data?.interfaces.some((i) => !i.disabled)}
            onClick={createPeer}
          >
            ＋ 新增 Peer
          </button>
        </div>
        <PeerStats {...controller} />
        {error && (
          <div className="error banner" role="alert">
            {error}
            <button onClick={() => setError("")}>关闭</button>
          </div>
        )}
        {notice && (
          <div className="success banner" role="status">
            {notice}
            <button onClick={() => setNotice("")}>关闭</button>
          </div>
        )}
        <PeerPanel controller={controller} />
        <div className="footnote">
          <span>◆ 密钥在浏览器生成 · 私钥保存在 RouterOS Peer 中</span>
          <span>WIREGUARD / ROUTEROS</span>
        </div>
      </main>
      <PeerDialogs controller={controller} />
    </ConsoleLayout>
  );
}
