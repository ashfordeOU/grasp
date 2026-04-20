package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

// Agent connects to Grasp cloud via WebSocket and proxies webhooks/API calls
// to/from an internal GitLab instance.
type Agent struct {
	Token      string
	GitLabHost string
	CloudURL   string
}

// CloudMessage is a message received from Grasp cloud over the WebSocket.
type CloudMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// WebhookForward is the payload for a "webhook_forward" message.
type WebhookForward struct {
	Event   string          `json:"event"`
	Payload json.RawMessage `json:"payload"`
}

// ApiCallRequest is the payload for an "api_call" message.
type ApiCallRequest struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

// Run connects to Grasp cloud and reconnects with exponential backoff on disconnect.
func (a *Agent) Run(ctx context.Context) error {
	attempt := 0
	for {
		if err := a.connect(ctx); err != nil && ctx.Err() == nil {
			log.Printf("Connection closed: %v", err)
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		attempt++
		backoff := time.Duration(math.Min(float64(attempt)*2, 30)) * time.Second
		log.Printf("Disconnected (attempt %d), reconnecting in %s...", attempt, backoff)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
	}
}

// connect establishes a single WebSocket session and reads messages until the
// connection closes or the context is cancelled.
func (a *Agent) connect(ctx context.Context) error {
	headers := http.Header{}
	headers.Set("Authorization", fmt.Sprintf("Bearer %s", a.Token))
	headers.Set("X-GitLab-Host", a.GitLabHost)

	conn, _, err := websocket.Dial(ctx, a.CloudURL, &websocket.DialOptions{HTTPHeader: headers})
	if err != nil {
		return fmt.Errorf("dial error: %w", err)
	}
	defer conn.CloseNow()

	log.Printf("Connected to Grasp cloud")

	for {
		var msg CloudMessage
		if err := wsjson.Read(ctx, conn, &msg); err != nil {
			return fmt.Errorf("read error: %w", err)
		}
		go a.handleMessage(ctx, conn, msg)
	}
}

// handleMessage dispatches an incoming CloudMessage to the appropriate handler.
func (a *Agent) handleMessage(ctx context.Context, conn *websocket.Conn, msg CloudMessage) {
	switch msg.Type {
	case "webhook_forward":
		var fwd WebhookForward
		if err := json.Unmarshal(msg.Payload, &fwd); err != nil {
			log.Printf("Failed to parse webhook_forward: %v", err)
			return
		}
		// Forward the raw webhook payload to the local gitlab-bot
		resp, err := http.Post(
			"http://localhost:7332/webhook",
			"application/json",
			bytes.NewReader(fwd.Payload),
		)
		if err != nil {
			log.Printf("Failed to forward webhook: %v", err)
			return
		}
		defer resp.Body.Close()
		log.Printf("Forwarded webhook event=%s status=%d", fwd.Event, resp.StatusCode)

	case "api_call":
		var call ApiCallRequest
		if err := json.Unmarshal(msg.Payload, &call); err != nil {
			log.Printf("Failed to parse api_call: %v", err)
			return
		}
		a.proxyApiCall(ctx, conn, call)

	case "ping":
		_ = wsjson.Write(ctx, conn, map[string]string{"type": "pong"})
	}
}

// proxyApiCall forwards an API call to the internal GitLab host, after verifying
// the target URL is within the configured GitLab host (security guard).
func (a *Agent) proxyApiCall(ctx context.Context, conn *websocket.Conn, call ApiCallRequest) {
	// Security: only proxy to the configured GitLab host
	expected := fmt.Sprintf("https://%s/", a.GitLabHost)
	if len(call.URL) < len(expected) || call.URL[:len(expected)] != expected {
		log.Printf("Blocked API call to disallowed host: %s", call.URL)
		return
	}
	log.Printf("Proxying API call: %s %s", call.Method, call.URL)
	// Acknowledge receipt; full proxy response is a future enhancement
	_ = wsjson.Write(ctx, conn, map[string]string{"type": "api_call_ack", "url": call.URL})
}
