package server

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

var errTarget = errors.New("invalid RouterOS target")

func transport() *http.Client {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.Proxy = nil
	tr.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	return &http.Client{Transport: tr, Timeout: 15 * time.Second, CheckRedirect: func(r *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}
}

func loadConfig(file string) (bootstrap, error) {
	config, err := os.ReadFile(file)
	if err != nil {
		return bootstrap{}, fmt.Errorf("read config.json (copy config.example.json first): %w", err)
	}
	if !json.Valid(config) {
		return bootstrap{}, errors.New("config.json 不是有效 JSON")
	}
	return bootstrap{Config: config}, nil
}

// Run has no RouterOS sessions, business validation, IP allocation or key storage.
func Run(configFile string) error {
	settings, err := loadConfig(configFile)
	if err != nil {
		return err
	}
	client := transport()
	defer client.CloseIdleConnections()
	srv := &http.Server{Addr: ":8080", Handler: handler(client, settings), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second, WriteTimeout: 25 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16384}
	lifetime, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	stopped, shutdownDone := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(shutdownDone)
		select {
		case <-lifetime.Done():
		case <-stopped:
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("HTTP shutdown: %v", err)
		}
	}()
	log.Printf("RouterOS proxy listening on %s", srv.Addr)
	err = srv.ListenAndServe()
	close(stopped)
	<-shutdownDone
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
