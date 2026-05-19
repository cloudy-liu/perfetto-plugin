// Copyright (C) 2026 cloudy.liu
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package browser

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	cdpruntime "github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"
	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/result"
	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/spec"
)

const bridgePluginID = "dev.perfbox.UiAutoBridge"

type Options struct {
	UIURL       string
	TracePath   string
	Viewport    string
	BrowserPath string
	ProfileDir  string
	Headed      bool
}

type Viewport struct {
	Width  int64
	Height int64
}

func CaptureSnapshot(
	ctx context.Context,
	opts Options,
	snapshotSpec spec.SnapshotSpec,
) (result.SnapshotResult, []byte, error) {
	browserPath, err := FindExecutable(opts.BrowserPath)
	if err != nil {
		return failed(result.BrowserNotFound, err.Error()), nil, err
	}

	viewport, err := ParseViewport(opts.Viewport)
	if err != nil {
		return failed(result.InvalidSpec, err.Error()), nil, err
	}

	uiURL, err := AppendEnablePlugin(opts.UIURL)
	if err != nil {
		return failed(result.InvalidSpec, err.Error()), nil, err
	}

	profileDir, cleanupProfile, err := prepareProfileDir(opts.ProfileDir)
	if err != nil {
		return failed(result.BrowserNotFound, err.Error()), nil, err
	}
	defer cleanupProfile()

	allocatorOptions := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(browserPath),
		chromedp.UserDataDir(profileDir),
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
	)
	if opts.Headed {
		allocatorOptions = append(allocatorOptions,
			chromedp.Flag("headless", false),
			chromedp.Flag("hide-scrollbars", false),
			chromedp.Flag("mute-audio", false),
		)
	}

	allocCtx, cancelAllocator := chromedp.NewExecAllocator(ctx, allocatorOptions...)
	defer cancelAllocator()
	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
	defer cancelBrowser()

	if err := chromedp.Run(browserCtx,
		chromedp.EmulateViewport(viewport.Width, viewport.Height),
		chromedp.Navigate(uiURL),
		acknowledgeCookieConsent(),
		chromedp.WaitReady("input.trace_file", chromedp.ByQuery),
		uploadTraceFile("input.trace_file", opts.TracePath),
	); err != nil {
		return failed(errorCodeFor(err, result.TraceLoadFailure), err.Error()), nil, err
	}

	if err := waitForReady(browserCtx); err != nil {
		return failed(errorCodeFor(err, result.BridgeNotReady), err.Error()), nil, err
	}

	snapshotResult, err := applySnapshot(browserCtx, snapshotSpec)
	if err != nil {
		return failed(errorCodeFor(err, result.BridgeNotReady), err.Error()), nil, err
	}

	if err := chromedp.Run(browserCtx, acknowledgeCookieConsent()); err != nil {
		return failed(errorCodeFor(err, result.ScreenshotFailed), err.Error()), nil, err
	}

	var png []byte
	if snapshotSpec.Screenshot.FullPage {
		err = chromedp.Run(browserCtx, chromedp.FullScreenshot(&png, 95))
	} else {
		err = chromedp.Run(browserCtx, chromedp.CaptureScreenshot(&png))
	}
	if err != nil {
		return failed(errorCodeFor(err, result.ScreenshotFailed), err.Error()), nil, err
	}
	return snapshotResult, png, nil
}

func AppendEnablePlugin(rawURL string) (string, error) {
	parsed, err := urlParse(rawURL)
	if err != nil {
		return "", err
	}
	query := parsed.Query()
	enabled := splitCSV(query.Get("enablePlugins"))
	if !contains(enabled, bridgePluginID) {
		enabled = append(enabled, bridgePluginID)
	}
	query.Set("enablePlugins", strings.Join(enabled, ","))
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func ParseViewport(raw string) (Viewport, error) {
	parts := strings.Split(raw, "x")
	if len(parts) != 2 {
		return Viewport{}, fmt.Errorf("invalid viewport %q, expected WIDTHxHEIGHT", raw)
	}
	width, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || width <= 0 {
		return Viewport{}, fmt.Errorf("invalid viewport width %q", parts[0])
	}
	height, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || height <= 0 {
		return Viewport{}, fmt.Errorf("invalid viewport height %q", parts[1])
	}
	return Viewport{Width: width, Height: height}, nil
}

func FindExecutable(explicit string) (string, error) {
	if explicit != "" {
		if fileExists(explicit) {
			return explicit, nil
		}
		return "", fmt.Errorf("browser not found at %q", explicit)
	}

	for _, name := range []string{
		"chrome.exe",
		"msedge.exe",
		"chromium.exe",
		"google-chrome",
		"chromium",
		"chromium-browser",
		"msedge",
	} {
		if path, err := exec.LookPath(name); err == nil {
			return path, nil
		}
	}

	for _, path := range commonBrowserPaths() {
		if fileExists(path) {
			return path, nil
		}
	}

	return "", errors.New("Chrome, Edge, or Chromium executable was not found")
}

func prepareProfileDir(explicit string) (string, func(), error) {
	if explicit == "" {
		profileDir, err := os.MkdirTemp("", "perfbox-uiauto-*")
		if err != nil {
			return "", func() {}, err
		}
		return profileDir, func() { _ = os.RemoveAll(profileDir) }, nil
	}

	profileDir, err := filepath.Abs(explicit)
	if err != nil {
		return "", func() {}, err
	}
	if err := os.MkdirAll(profileDir, 0o755); err != nil {
		return "", func() {}, err
	}
	return profileDir, func() {}, nil
}

func acknowledgeCookieConsent() chromedp.Action {
	return chromedp.Evaluate(cookieConsentAckScript(), nil)
}

func cookieConsentAckScript() string {
	return `(() => {
  try {
    localStorage.setItem('cookieAck', 'true');
  } catch (_) {
  }
  const banner = document.querySelector('.pf-cookie-consent');
  if (banner === null) return true;
  const buttons = Array.from(banner.querySelectorAll('button'));
  const okButton = buttons.find((button) => button.textContent?.trim() === 'OK');
  if (okButton instanceof HTMLElement) {
    okButton.click();
  } else if (banner instanceof HTMLElement) {
    banner.style.display = 'none';
  }
  return true;
})()`
}

func showTraceFileInput() chromedp.Action {
	return chromedp.Evaluate(`(() => {
  const input = document.querySelector('input.trace_file');
  if (!input) return false;
  input.style.display = 'block';
  input.style.position = 'fixed';
  input.style.left = '0';
  input.style.top = '0';
  input.style.width = '1px';
  input.style.height = '1px';
  input.style.opacity = '0.01';
  return true;
})()`, nil)
}

func uploadTraceFile(selector string, path string) chromedp.Action {
	return chromedp.ActionFunc(func(ctx context.Context) error {
		if err := chromedp.Run(ctx,
			showTraceFileInput(),
			chromedp.SetUploadFiles(
				selector,
				[]string{path},
				chromedp.ByQuery,
				chromedp.NodeVisible,
			),
		); err != nil {
			return err
		}

		count, err := inputFileCount(ctx, selector)
		if err != nil {
			return err
		}
		if count == 0 {
			if err := injectFileIntoInput(ctx, selector, path); err != nil {
				return err
			}
		}
		return dispatchChange(selector).Do(ctx)
	})
}

func inputFileCount(ctx context.Context, selector string) (int, error) {
	js := fmt.Sprintf(`(() => {
  const input = document.querySelector(%q);
  return input?.files?.length ?? 0;
})()`, selector)
	var count int
	if err := chromedp.Evaluate(js, &count).Do(ctx); err != nil {
		return 0, err
	}
	return count, nil
}

func injectFileIntoInput(ctx context.Context, selector string, path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	selectorJSON, err := json.Marshal(selector)
	if err != nil {
		return err
	}
	nameJSON, err := json.Marshal(filepath.Base(path))
	if err != nil {
		return err
	}
	encoded := base64.StdEncoding.EncodeToString(raw)
	const chunkSize = 256 * 1024

	if err := chromedp.Run(ctx, chromedp.Evaluate(`window.__perfboxUiAutoTraceChunks = []`, nil)); err != nil {
		return err
	}
	for start := 0; start < len(encoded); start += chunkSize {
		end := start + chunkSize
		if end > len(encoded) {
			end = len(encoded)
		}
		chunkJSON, err := json.Marshal(encoded[start:end])
		if err != nil {
			return err
		}
		if err := chromedp.Run(ctx, chromedp.Evaluate(
			fmt.Sprintf(`window.__perfboxUiAutoTraceChunks.push(%s)`, chunkJSON),
			nil,
		)); err != nil {
			return err
		}
	}

	js := fmt.Sprintf(`(() => {
  const input = document.querySelector(%s);
  if (!input) return false;
  const binary = atob(window.__perfboxUiAutoTraceChunks.join(''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const file = new File([bytes], %s, {type: 'application/octet-stream'});
  const data = new DataTransfer();
  data.items.add(file);
  input.files = data.files;
  delete window.__perfboxUiAutoTraceChunks;
  return input.files.length === 1;
})()`, selectorJSON, nameJSON)

	var ok bool
	if err := chromedp.Run(ctx, chromedp.Evaluate(js, &ok)); err != nil {
		return err
	}
	if !ok {
		return errors.New("failed to inject trace file into input")
	}
	return nil
}

func dispatchChange(selector string) chromedp.Action {
	js := fmt.Sprintf(`(() => {
  const input = document.querySelector(%q);
  if (!input || !input.files || input.files.length === 0) return false;
  input.dispatchEvent(new Event('change', {bubbles: true}));
  return true;
})()`, selector)
	return chromedp.ActionFunc(func(ctx context.Context) error {
		var dispatched bool
		if err := chromedp.Evaluate(js, &dispatched).Do(ctx); err != nil {
			return err
		}
		if !dispatched {
			return errors.New("trace file input was not populated")
		}
		return nil
	})
}

func waitForReady(ctx context.Context) error {
	deadline, hasDeadline := ctx.Deadline()
	lastState := ""
	for {
		var ready bool
		err := chromedp.Run(ctx, chromedp.Evaluate(
			`window.perfboxUiAuto?.isReady() === true`,
			&ready,
		))
		if err == nil && ready {
			return nil
		}
		_ = chromedp.Run(ctx, chromedp.Evaluate(`JSON.stringify({
  title: document.title,
  url: location.href,
  hasBridge: typeof window.perfboxUiAuto,
  inputFiles: document.querySelector('input.trace_file')?.files?.length ?? null,
})`, &lastState))
		if hasDeadline && time.Now().After(deadline) {
			return fmt.Errorf(
				"%w: waiting for window.perfboxUiAuto?.isReady(); last page state: %s",
				context.DeadlineExceeded,
				lastState,
			)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
}

func applySnapshot(
	ctx context.Context,
	snapshotSpec spec.SnapshotSpec,
) (result.SnapshotResult, error) {
	rawSpec, err := json.Marshal(snapshotSpec)
	if err != nil {
		return result.SnapshotResult{}, err
	}

	expr := fmt.Sprintf(`(async () => JSON.stringify(await window.perfboxUiAuto.applySnapshot(%s)))()`, rawSpec)
	var rawResult string
	if err := chromedp.Run(ctx, chromedp.Evaluate(
		expr,
		&rawResult,
		func(params *cdpruntime.EvaluateParams) *cdpruntime.EvaluateParams {
			return params.WithAwaitPromise(true)
		},
	)); err != nil {
		return result.SnapshotResult{}, err
	}

	var snapshotResult result.SnapshotResult
	if err := json.Unmarshal([]byte(rawResult), &snapshotResult); err != nil {
		return result.SnapshotResult{}, err
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

func errorCodeFor(err error, fallback result.ErrorCode) result.ErrorCode {
	if errors.Is(err, context.DeadlineExceeded) {
		return result.Timeout
	}
	return fallback
}

func commonBrowserPaths() []string {
	if runtime.GOOS != "windows" {
		return nil
	}
	return []string{
		filepath.Join(os.Getenv("PROGRAMFILES"), "Google", "Chrome", "Application", "chrome.exe"),
		filepath.Join(os.Getenv("PROGRAMFILES(X86)"), "Google", "Chrome", "Application", "chrome.exe"),
		filepath.Join(os.Getenv("PROGRAMFILES"), "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(os.Getenv("PROGRAMFILES(X86)"), "Microsoft", "Edge", "Application", "msedge.exe"),
	}
}

func fileExists(path string) bool {
	if path == "" {
		return false
	}
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func splitCSV(raw string) []string {
	if raw == "" {
		return nil
	}
	var out []string
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func contains(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}
