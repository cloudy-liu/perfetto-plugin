package snapshot

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/browser"
	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/result"
	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/spec"
)

func Run(parent context.Context, opts Options) (result.SnapshotResult, error) {
	timeout := time.Duration(opts.TimeoutMS) * time.Millisecond
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()

	snapshotSpec, err := spec.Load(opts.SpecPath)
	if err != nil {
		snapshotResult := failed(result.InvalidSpec, err.Error())
		writeResultIfRequested(opts.ResultPath, snapshotResult)
		return snapshotResult, err
	}

	tracePath, err := filepath.Abs(opts.TracePath)
	if err != nil {
		snapshotResult := failed(result.TraceLoadFailure, err.Error())
		writeResultIfRequested(opts.ResultPath, snapshotResult)
		return snapshotResult, err
	}

	snapshotResult, png, err := browser.CaptureSnapshot(ctx, browser.Options{
		UIURL:       opts.UIURL,
		TracePath:   tracePath,
		Viewport:    opts.Viewport,
		BrowserPath: opts.BrowserPath,
		Headed:      opts.Headed,
	}, snapshotSpec)
	if err != nil {
		writeResultIfRequested(opts.ResultPath, snapshotResult)
		return snapshotResult, err
	}

	if err := ensureParent(opts.OutPath); err != nil {
		snapshotResult := failed(result.ScreenshotFailed, err.Error())
		writeResultIfRequested(opts.ResultPath, snapshotResult)
		return snapshotResult, err
	}
	if err := os.WriteFile(opts.OutPath, png, 0o644); err != nil {
		snapshotResult := failed(result.ScreenshotFailed, err.Error())
		writeResultIfRequested(opts.ResultPath, snapshotResult)
		return snapshotResult, err
	}

	if opts.ResultPath != "" {
		if err := ensureParent(opts.ResultPath); err != nil {
			return snapshotResult, fmt.Errorf("write result: %w", err)
		}
		if err := result.WriteFile(opts.ResultPath, snapshotResult); err != nil {
			return snapshotResult, fmt.Errorf("write result: %w", err)
		}
	}
	return snapshotResult, nil
}

func failed(code result.ErrorCode, message string) result.SnapshotResult {
	return result.SnapshotResult{
		OK:       false,
		Items:    []result.ItemResult{},
		Warnings: []string{},
		Errors:   []result.Error{{Code: code, Message: message}},
	}
}

func writeResultIfRequested(path string, snapshotResult result.SnapshotResult) {
	if path == "" {
		return
	}
	if err := ensureParent(path); err != nil {
		return
	}
	_ = result.WriteFile(path, snapshotResult)
}

func ensureParent(path string) error {
	parent := filepath.Dir(path)
	if parent == "." || parent == "" {
		return nil
	}
	return os.MkdirAll(parent, 0o755)
}
