import type React from "react";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ApiError } from "../lib/api";
import { generateKeys } from "../keys";
import { useSession } from "./useSession";
import { useOverview } from "./useOverview";
import type { Peer, Editor, ExportedConfig } from "../types";
export function useConsole() {
  const {
    session,
    checking,
    address,
    setAddress,
    username,
    setUsername,
    password,
    setPassword,
    authenticate,
    bootstrapError,
    resetSession,
  } = useSession();
  const logged = !!session;
  const { data, updated, refresh, refreshError, setRefreshError } = useOverview(
    session,
    resetSession,
  );
  const [actionError, setActionError] = useState("");
  const error = actionError || refreshError || bootstrapError;
  function setError(value: string) {
    setActionError(value);
    setRefreshError("");
  }
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState<Editor>();
  const [remove, setRemove] = useState<Peer>();
  const [exported, setExported] = useState<ExportedConfig>();
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!logged) {
      setEditor(undefined);
      setRemove(undefined);
      setExported(undefined);
      setNotice("");
    }
  }, [logged]);
  function close() {
    if (busy) return;
    setEditor(undefined);
    setRemove(undefined);
    setExported(undefined);
    setError("");
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) resetSession();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      await authenticate();
      setFilter("all");
      setSearch("");
      setNotice("");
    });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
    await run(async () => {
      const { id } = editor;
      if (!session) throw new Error("请先登录");
      await session.save(editor);
      setEditor(undefined);
      setNotice(id ? "Peer 配置已更新" : "Peer 已创建，可生成二维码或下载配置");
      await refresh();
    });
  }
  async function showConfig(p: Peer) {
    await run(async () => {
      if (!session) throw new Error("请先登录");
      const config = await session.export(p.id);
      const qr = await QRCode.toDataURL(config, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      setExported({ name: p.comment || p.id, config, qr });
    });
  }
  function download() {
    if (!exported) return;
    const url = URL.createObjectURL(
      new Blob([exported.config], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download =
      (exported.name.replace(/[^\p{L}\p{N}_-]/gu, "_").slice(0, 50) ||
        "wireguard") + ".conf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const peers = data?.peers ?? [],
    online = peers.filter((p) => p.status === "online").length;
  const visible = peers.filter(
    (p) =>
      (filter === "all" || p.interface === filter) &&
      `${p.comment} ${p.interface} ${p.address} ${p.publicKey}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );

  function createPeer() {
    try {
      const iface = data?.interfaces.find((i) => !i.disabled);
      if (iface)
        setEditor({ interface: iface.name, comment: "", ...generateKeys() });
    } catch {
      setError("浏览器无法生成安全随机密钥，请使用现代浏览器");
    }
  }
  function editPeer(peer: Peer) {
    setEditor({
      id: peer.id,
      interface: peer.interface,
      comment: peer.comment,
    });
  }
  async function logout() {
    await run(async () => {
      resetSession();
    });
  }
  async function deletePeer() {
    if (!remove) return;
    await run(async () => {
      if (!session) throw new Error("请先登录");
      await session.remove(remove.id);
      setRemove(undefined);
      setNotice("Peer 已删除");
      await refresh();
    });
  }
  async function copyConfig() {
    if (!exported) return;
    await run(async () => {
      await navigator.clipboard.writeText(exported.config);
      setNotice("配置已复制");
    });
  }
  return {
    address,
    setAddress,
    username,
    setUsername,
    password,
    setPassword,
    logged,
    checking,
    data,
    error,
    setError,
    busy,
    search,
    setSearch,
    filter,
    setFilter,
    updated,
    editor,
    setEditor,
    remove,
    setRemove,
    exported,
    notice,
    setNotice,
    refresh,
    close,
    login,
    save,
    showConfig,
    download,
    peers,
    online,
    visible,
    createPeer,
    editPeer,
    logout,
    deletePeer,
    copyConfig,
  };
}
export type ConsoleController = ReturnType<typeof useConsole>;
