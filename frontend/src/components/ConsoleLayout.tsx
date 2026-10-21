import type { ReactNode } from "react";
import type { ConsoleController } from "../hooks/useConsole";
type Props = Pick<
  ConsoleController,
  "peers" | "address" | "username" | "busy" | "logout"
> & { children: ReactNode };
export function ConsoleLayout({
  peers,
  address,
  username,
  busy,
  logout,
  children,
}: Props) {
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="mark">W</span>
          <div>
            WireGuard<small>ROUTEROS CONSOLE</small>
          </div>
        </div>
        <div className="nav-label">工作空间</div>
        <a className="nav active" href="#peers">
          <span>◈</span> Peers 管理{" "}
          <span className="nav-count">{peers.length}</span>
        </a>
        <div className="aside-bottom">
          <span className="dot" /> REST API <small>Go + React</small>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <span>
            网络管理 <span className="slash">/</span>{" "}
            <strong title={address}>
              {username} @ {address}
            </strong>
          </span>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void logout()}
          >
            退出登录 ↗
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
