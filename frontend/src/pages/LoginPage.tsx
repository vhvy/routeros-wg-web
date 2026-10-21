import type { ConsoleController } from "../hooks/useConsole";

type Props = Pick<
  ConsoleController,
  | "login"
  | "address"
  | "setAddress"
  | "username"
  | "setUsername"
  | "password"
  | "setPassword"
  | "busy"
  | "error"
>;

export function LoginPage({
  login,
  address,
  setAddress,
  username,
  setUsername,
  password,
  setPassword,
  busy,
  error,
}: Props) {
  return (
    <main className="login">
      <div className="login-intro">
        <div className="brand">
          <span className="mark">W</span> WireGuard <small>FOR ROUTEROS</small>
        </div>
        <h1>
          连接你的网络。
          <br />
          <span>管理每一个连接。</span>
        </h1>
        <p>在一个安静、有序的工作台中管理 WireGuard peers。</p>
        <div className="intro-line">
          ROUTEROS REST API <span>／</span> PRIVATE NETWORK
        </div>
      </div>
      <form className="login-card" onSubmit={login}>
        <span className="eyebrow">WELCOME BACK</span>
        <h2>连接 RouterOS</h2>
        <p>使用路由器的账号密码登录，IP 地址可直接修改。</p>
        <label>
          路由器 IP / 地址
          <input
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="192.168.88.1"
            required
            maxLength={256}
            disabled={busy}
          />
        </label>
        <label>
          RouterOS 账号
          <input
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="输入路由器账号"
            required
            maxLength={128}
            disabled={busy}
          />
        </label>
        <label>
          RouterOS 密码
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            maxLength={1024}
            disabled={busy}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "正在验证…" : "登录路由器 →"}
        </button>
        <small>默认使用 HTTPS · 凭据仅保留在页面内存，刷新后重新登录</small>
      </form>
    </main>
  );
}
