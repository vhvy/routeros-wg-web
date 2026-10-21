# RouterOS WireGuard Web

使用 React 管理 RouterOS 的 WireGuard peers。前端直接决定 REST 路径、HTTP 方法、headers 和参数；Go 后端负责同源转发，不保存账号、会话或客户端私钥。

## 职责

- 前端：登录验证、配置与表单校验、浏览器密钥生成、地址分配、Peer 增删改、握手状态、配置与二维码导出。
- RouterOS：Peer 保存客户端公钥和私钥，网页从 REST 返回的 Peer 数据生成客户端配置和二维码。
- 后端：转发请求、读取 config.json 启动配置、健康检查。仅检查目标、路径、方法、来源及大小等转发边界；RouterOS 自己执行账号认证和权限控制。

账号密码仅保留在当前页面内存，每次请求作为 Authorization header 经过代理发送给 RouterOS。刷新页面或退出后需要重新登录。

## 本地开发

需要 Go 1.24+、Node.js 24+ 和 pnpm 12.14.0。

项目根目录启动后端（PowerShell）：

```powershell
Copy-Item config.example.json config.json
# 在 config.json 中设置 router-address
cd backend
go run ./cmd/server
```

另一个终端在项目根目录启动前端：

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Vite 把 `/api` 转发到 `http://localhost:8080`。登录页填写 RouterOS 地址和它自己的账号密码。裸 IP 默认使用 HTTPS；只启用了 HTTP 的测试设备需要填写 `http://IP`。

应用配置统一放在项目根目录的 `config.json`。前端会根据 WireGuard 接口的 IPv4 地址（/16 至 /30）识别地址池，分配时避开网络地址、广播地址、路由器地址及同接口已有 Peer 地址。自动生成的客户端 endpoint 使用登录目标 IP 与该接口的监听端口；公网使用时可通过配置覆盖。

## 配置

项目根目录把 `config.example.json` 复制为 `config.json` 后编辑。后端只把 JSON 提供给前端，字段与业务规则由前端校验。

```json
{
  "router-address": "http://192.168.233.1",
  "allowedIPs": ["10.76.0.0/24"],
  "keepalive": 25,
  "onlineSeconds": 180,
  "interfaces": [
    {
      "name": "wg1",
      "pool": "10.76.0.0/24",
      "start": "10.76.0.2",
      "end": "10.76.0.254",
      "endpoint": "192.168.233.1:57340"
    }
  ]
}
```

配置中没有声明的接口仍可从 RouterOS 的 IPv4 地址自动识别。接口没有有效地址池时只能查看，不能通过控制台创建 Peer。切换 Peer 所属接口会重新分配地址，需要重新导入客户端配置。

本项目不创建 WireGuard 接口，不设置 NAT、路由或防火墙。设备需要支持 WireGuard 和 REST API；实际可执行操作取决于登录用户的 RouterOS 权限。

## Docker Compose

```sh
cp config.example.json config.json
# 编辑默认管理地址，以及 VPN 路由、地址池和 endpoint
docker compose up -d --build
```

访问 `http://部署主机IP:8088`。后端不发布宿主机端口，浏览器经 Nginx 访问 `/api`。跨主机使用时为 Web 控制台配置 HTTPS，保护登录凭据和客户端私钥的传输。

不使用环境变量。`router-address` 控制登录页的默认值，仍可在登录表单中修改。Go 固定监听 `:8080`，Compose 固定发布 `8088:8080`；需要修改对外端口时直接编辑 `compose.yaml`。HTTPS 连接使用系统信任库验证 RouterOS 证书。

本地默认从 `../config.json` 读取配置（在 `backend` 目录启动）；可通过 `go run ./cmd/server -config /path/to/config.json` 指定路径。容器通过启动参数读取 `/app/config.json`。修改配置后重启后端并刷新页面。

## GHCR 自动发布

`.github/workflows/publish-images.yml` 会在推送 `main` / `master`、推送 `v*` 标签或在 Actions 页面手动运行时，分别构建并发布前后端镜像，支持 `linux/amd64` 和 `linux/arm64`：

- `ghcr.io/<owner>/<repo>-backend`
- `ghcr.io/<owner>/<repo>-frontend`

镜像名称自动转为小写。默认分支更新 `latest`，分支构建附带分支名标签，版本标签保留原名（如 `v1.0.0`），每次构建还会生成 `sha-<短提交号>` 标签。版本标签不会覆盖 `latest`。

Workflow 使用内置 `GITHUB_TOKEN` 和 `packages: write` 权限，无需额外配置登录 Secret。首次发布后，如需匿名拉取，在 GitHub Packages 中将两个镜像包的可见性设为 Public；组织仓库还需允许 Actions 发布包。

生产部署使用独立的 `compose.prod.yaml`，直接拉取本仓库的 GHCR 镜像，无需本地构建。首次部署前，先等待 Actions 发布成功；私有镜像需要先执行 `docker login ghcr.io`。

```sh
cp config.example.json config.json
# 编辑 config.json 后部署
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d
```

访问 `http://部署主机IP:8088`。后续更新时重复执行上述 `pull` 和 `up -d`。`config.json` 必须提前创建，生产 Compose 不会自动创建缺失的挂载路径。需要固定版本时，将两个 `image` 的 `latest` 同时改为已发布的版本标签（如 `v1.0.0`）；Fork 仓库时同步修改镜像所属用户和仓库名。需要修改对外端口时编辑 `compose.prod.yaml`。

## 转发协议

- `GET /healthz`：服务存活检查。
- `GET /api/bootstrap`：返回 config.json 内容，前端从 router-address 读取默认路由器地址。
- `POST /api/proxy`：转发前端组装的 RouterOS REST 请求。

```json
{
  "target": "http://192.168.233.1",
  "path": "/rest/interface/wireguard/peers?.proplist=.id,interface,comment",
  "method": "GET",
  "headers": {
    "Authorization": "Basic <由前端生成>",
    "Content-Type": "application/json"
  }
}
```

写入时增加 `body`，值为实际 RouterOS JSON 参数。代理保留 RouterOS 状态码与响应体，拒绝跳转，不把上游 Cookie 设置到控制台域名。目标限 HTTP(S) IP，路径限 `/rest/`，允许 GET、POST、PUT、PATCH、DELETE；请求上限 64 KiB，响应上限 8 MiB。业务处理集中在 `frontend/src/services/wireguard.ts`。

## 私钥与二维码

新增 Peer 时，浏览器生成 X25519 密钥对，将 `public-key` 和 `private-key` 一并通过代理写入 RouterOS。编辑接口和备注时保留原密钥。Go 后端不持久化密钥，浏览器不再维护本地私钥库。

二维码按钮只依据 REST 返回的 Peer 是否包含可读取的客户端 `private-key` 启用。换浏览器或重新登录后仍从 RouterOS 读取私钥；没有私钥、返回 `none` 或掩码时不能生成。账号需要读取敏感字段的权限。

配置导出使用 Peer 返回的客户端私钥、WireGuard 接口公钥以及客户端地址；存在预共享密钥时一并输出 `PresharedKey`。接口没有地址池覆盖时，使用登录 IP 和接口监听端口作为默认 endpoint，仍可导出已有 Peer。

旧版只保存在浏览器或后端私钥库中的密钥不会自动上传到已有 Peer。已有 Peer 若未在 RouterOS 保存客户端私钥，需要补录对应原私钥后才能按新规则导出。

网络中断可能导致 RouterOS 已完成修改但页面没有收到响应，此时先刷新列表确认结果。当前页面会串行执行修改，不同页面或工具同时创建时应协调地址分配。

## 项目结构

```text
backend/
  go.mod
  cmd/server/main.go
  internal/server/
    server.go             # 启动、TLS 与 JSON 配置
    proxy.go              # REST 转发
    proxy_test.go
frontend/src/
  main.tsx                # React 挂载
  App.tsx                 # 页面装配
  pages/                  # 登录页
  components/             # 布局、列表、统计与弹窗
  hooks/                  # 页面状态、凭据内存与轮询
  services/wireguard.ts   # RouterOS 业务请求与流程
  lib/                    # 转发客户端、业务校验与地址分配
  styles/
  types.ts
```

## 验证

```sh
cd backend
go test ./...
go vet ./...
cd ../frontend
pnpm test
pnpm build
```

真机测试需要运行 Go 代理，目标默认读取 `config.json` 中的 `router-address`。测试凭据通过标准输入传入，不写入配置（PowerShell）：

```powershell
cd frontend
$testCredential = Get-Credential -UserName admin
@{
  username = $testCredential.UserName
  password = $testCredential.GetNetworkCredential().Password
  interface = "wg1"
} | ConvertTo-Json -Compress | pnpm test:routeros
```

该测试只创建带本次唯一备注的 Peer，在 finally 中清理。测试验证客户端私钥写入 RouterOS、重新连接读取、预共享密钥导出和无私钥 Peer 的二维码限制。标准输入 JSON 可额外设置 `address` 和 `app` 覆盖测试目标与代理地址；代理默认 `http://127.0.0.1:8080`。真机测试覆盖管理和配置导出，不代表已验证 VPN 隧道的数据连通性。
