package server

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/netip"
	"net/url"
	"path"
	"strconv"
	"strings"
)

// All RouterOS business decisions and authentication headers come from the browser.
// The proxy only checks its transport boundary, then returns the upstream response.
type proxyRequest struct {
	Target  string            `json:"target"`
	Path    string            `json:"path"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
	Body    json.RawMessage   `json:"body,omitempty"`
}

type bootstrap struct {
	Config json.RawMessage `json:"config"`
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func fail(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func targetURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	host := u.Hostname()
	validHost := validHostname(host)
	if ip, e := netip.ParseAddr(host); e == nil {
		validHost = !ip.IsUnspecified() && !ip.IsMulticast() && ip.Zone() == ""
	}
	if !validHost || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || u.Opaque != "" || strings.HasSuffix(u.Host, ":") {
		return nil, &url.Error{Op: "validate", URL: raw, Err: errTarget}
	}
	if port := u.Port(); port != "" {
		n, e := strconv.Atoi(port)
		if e != nil || n < 1 || n > 65535 {
			return nil, errTarget
		}
	}
	return u, nil
}

func validHostname(host string) bool {
	name := strings.TrimSuffix(host, ".")
	if len(name) == 0 || len(name) > 253 || strings.Trim(name, "0123456789.") == "" {
		return false
	}
	for _, label := range strings.Split(name, ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, c := range label {
			if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-') {
				return false
			}
		}
	}
	return true
}

func handler(client *http.Client, settings bootstrap) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /api/bootstrap", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, settings) })
	mux.HandleFunc("POST /api/proxy", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
			fail(w, 403, "跨站转发请求已拒绝")
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" {
			u, err := url.Parse(origin)
			if err != nil || u.Host != r.Host {
				fail(w, 403, "请求来源不匹配")
				return
			}
		}
		var in proxyRequest
		r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&in); err != nil {
			fail(w, 400, "转发请求格式无效或超过 64 KiB")
			return
		}
		if decoder.Decode(&struct{}{}) != io.EOF {
			fail(w, 400, "请求必须是单个 JSON 对象")
			return
		}
		target, err := targetURL(in.Target)
		if err != nil {
			fail(w, 400, "转发目标必须为有效的 RouterOS HTTP(S) IP 地址或域名，可包含端口")
			return
		}
		ref, err := url.Parse(in.Path)
		if err != nil || ref.IsAbs() || ref.Host != "" || ref.Fragment != "" || !strings.HasPrefix(ref.Path, "/rest/") || path.Clean(ref.Path) != ref.Path || strings.Contains(ref.Path, "\\") {
			fail(w, 400, "仅允许转发 /rest/ 下的 API 路径")
			return
		}
		switch in.Method {
		case "GET", "POST", "PUT", "PATCH", "DELETE":
		default:
			fail(w, 400, "转发方法不受支持")
			return
		}
		target.Path, target.RawPath, target.RawQuery = ref.Path, ref.RawPath, ref.RawQuery
		req, err := http.NewRequestWithContext(r.Context(), in.Method, target.String(), bytes.NewReader(in.Body))
		if err != nil {
			fail(w, 400, "转发请求无效")
			return
		}
		for name, value := range in.Headers {
			req.Header.Set(name, value)
		}
		// Never forward connection-specific headers or a caller-controlled Host.
		for _, name := range strings.Split(req.Header.Get("Connection"), ",") {
			req.Header.Del(strings.TrimSpace(name))
		}
		for _, name := range []string{"Connection", "Proxy-Connection", "Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization", "TE", "Trailer", "Transfer-Encoding", "Upgrade", "Host", "Content-Length"} {
			req.Header.Del(name)
		}
		response, err := client.Do(req)
		if err != nil {
			fail(w, 502, "无法连接 RouterOS；修改请求失败时请刷新列表确认结果")
			return
		}
		defer response.Body.Close()
		data, err := io.ReadAll(io.LimitReader(response.Body, (8<<20)+1))
		if err != nil || len(data) > 8<<20 {
			fail(w, 502, "RouterOS 响应读取失败或超过 8 MiB")
			return
		}
		if contentType := response.Header.Get("Content-Type"); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		w.WriteHeader(response.StatusCode)
		_, _ = w.Write(data)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		mux.ServeHTTP(w, r)
	})
}
