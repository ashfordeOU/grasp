package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
)

var (
	agentToken = flag.String("token", os.Getenv("GRASP_AGENT_TOKEN"), "Grasp agent token (or GRASP_AGENT_TOKEN env)")
	gitlabHost = flag.String("gitlab-host", os.Getenv("GITLAB_HOST"), "GitLab host (e.g. gitlab.internal.company.com)")
	cloudURL   = flag.String("cloud-url", "wss://agent.grasp.dev", "Grasp cloud WebSocket URL")
)

func main() {
	flag.Parse()

	if *agentToken == "" {
		fmt.Fprintln(os.Stderr, "Error: --token is required (or set GRASP_AGENT_TOKEN)")
		os.Exit(1)
	}
	if *gitlabHost == "" {
		fmt.Fprintln(os.Stderr, "Error: --gitlab-host is required (or set GITLAB_HOST)")
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	log.Printf("Grasp Agent starting — GitLab: %s, Cloud: %s", *gitlabHost, *cloudURL)

	agent := &Agent{
		Token:      *agentToken,
		GitLabHost: *gitlabHost,
		CloudURL:   *cloudURL,
	}

	if err := agent.Run(ctx); err != nil && err != context.Canceled {
		log.Fatalf("Agent error: %v", err)
	}
	log.Println("Agent stopped.")
}
