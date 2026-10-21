package server

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProxyForwardsBrowserRequest(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "PATCH" || r.URL.Path != "/rest/interface/wireguard/peers/*1" || r.URL.Query().Get(".proplist") != ".id,name" {
			t.Errorf("request changed: %s %s", r.Method, r.URL)
		}
		if r.Header.Get("Authorization") != "Basic dGVzdDp0ZXN0" || r.Header.Get("X-Request-ID") != "test-request" {
			t.Error("browser headers not forwarded")
		}
		if r.Header.Get("X-Hop") != "" || r.Host == "evil.example" {
			t.Error("connection-specific headers forwarded")
		}
		data, _ := io.ReadAll(r.Body)
		if string(data) != `{"comment":"hello"}` {
			t.Errorf("payload changed: %s", data)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Set-Cookie", "secret=upstream")
		w.WriteHeader(201)
		_, _ = w.Write([]byte(`{".id":"*1"}`))
	}))
	defer upstream.Close()
	input := proxyRequest{Target: upstream.URL, Path: "/rest/interface/wireguard/peers/*1?.proplist=.id%2Cname", Method: "PATCH", Headers: map[string]string{"Authorization": "Basic dGVzdDp0ZXN0", "X-Request-ID": "test-request", "Host": "evil.example", "Connection": "X-Hop", "X-Hop": "drop"}, Body: json.RawMessage(`{"comment":"hello"}`)}
	encoded, _ := json.Marshal(input)
	req := httptest.NewRequest("POST", "/api/proxy", bytes.NewReader(encoded))
	res := httptest.NewRecorder()
	handler(upstream.Client(), bootstrap{}).ServeHTTP(res, req)
	if res.Code != 201 || res.Body.String() != `{".id":"*1"}` {
		t.Fatalf("upstream response changed: %d %s", res.Code, res.Body.String())
	}
	if res.Header().Get("Set-Cookie") != "" {
		t.Fatal("upstream cookie escaped onto application origin")
	}
}

func TestProxyRejectsInvalidTransportBoundary(t *testing.T) {
	for _, test := range []struct{ name, target, path, method string }{
		{"external URL path", "http://127.0.0.1", "http://example.com/rest/x", "GET"},
		{"outside REST", "http://127.0.0.1", "/system/resource", "GET"},
		{"traversal", "http://127.0.0.1", "/rest/../secret", "GET"},
		{"escaped traversal", "http://127.0.0.1", "/rest/%2e%2e/secret", "GET"},
		{"network URL", "http://127.0.0.1", "//example.com/rest/x", "GET"},
		{"unsupported scheme", "file://127.0.0.1", "/rest/system/resource", "GET"},
		{"DNS target", "https://example.com", "/rest/system/resource", "GET"},
		{"credentials in target", "http://user:password@127.0.0.1", "/rest/system/resource", "GET"},
		{"unsupported method", "http://127.0.0.1", "/rest/system/resource", "CONNECT"},
	} {
		t.Run(test.name, func(t *testing.T) {
			b, _ := json.Marshal(proxyRequest{Target: test.target, Path: test.path, Method: test.method})
			req := httptest.NewRequest("POST", "/api/proxy", bytes.NewReader(b))
			res := httptest.NewRecorder()
			handler(http.DefaultClient, bootstrap{}).ServeHTTP(res, req)
			if res.Code != 400 {
				t.Fatalf("got %d: %s", res.Code, res.Body.String())
			}
		})
	}
}
func TestProxyOriginAndSizeChecks(t *testing.T) {
	h := handler(http.DefaultClient, bootstrap{})
	for _, header := range []map[string]string{{"Origin": "http://evil.example"}, {"Sec-Fetch-Site": "cross-site"}} {
		req := httptest.NewRequest("POST", "/api/proxy", strings.NewReader(`{}`))
		for k, v := range header {
			req.Header.Set(k, v)
		}
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != 403 {
			t.Fatalf("cross-site request accepted: %d", res.Code)
		}
	}
	for _, body := range []string{`{} {}`, `{"unknown":1}`, `{"body":"` + strings.Repeat("x", 65<<10) + `"}`} {
		req := httptest.NewRequest("POST", "/api/proxy", strings.NewReader(body))
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != 400 {
			t.Fatalf("invalid envelope accepted: %d", res.Code)
		}
	}
}
func TestProxyPreservesRouterErrorAndDoesNotFollowRedirects(t *testing.T) {
	for _, status := range []int{204, 401, 409, 302} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Location", "http://192.0.2.1/")
				w.WriteHeader(status)
				if status != 204 {
					_, _ = w.Write([]byte(`{"message":"upstream"}`))
				}
			}))
			defer router.Close()
			client := transport()
			defer client.CloseIdleConnections()
			b, _ := json.Marshal(proxyRequest{Target: router.URL, Path: "/rest/interface/wireguard", Method: "GET"})
			res := httptest.NewRecorder()
			handler(client, bootstrap{}).ServeHTTP(res, httptest.NewRequest("POST", "/api/proxy", bytes.NewReader(b)))
			if res.Code != status {
				t.Fatalf("got %d want %d: %s", res.Code, status, res.Body.String())
			}
		})
	}
}
