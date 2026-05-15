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
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/result"
	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/spec"
)

func TestAppendEnablePluginAddsPerfboxBridge(t *testing.T) {
	got, err := AppendEnablePlugin("http://localhost:10000")
	if err != nil {
		t.Fatalf("AppendEnablePlugin returned error: %v", err)
	}
	if got != "http://localhost:10000?enablePlugins=dev.perfbox.UiAutoBridge" {
		t.Fatalf("url = %q", got)
	}
}

func TestAppendEnablePluginPreservesExistingQuery(t *testing.T) {
	got, err := AppendEnablePlugin("http://localhost:10000?testing=1")
	if err != nil {
		t.Fatalf("AppendEnablePlugin returned error: %v", err)
	}
	want := "http://localhost:10000?enablePlugins=dev.perfbox.UiAutoBridge&testing=1"
	if got != want {
		t.Fatalf("url = %q, want %q", got, want)
	}
}

func TestParseViewport(t *testing.T) {
	got, err := ParseViewport("1280x720")
	if err != nil {
		t.Fatalf("ParseViewport returned error: %v", err)
	}
	if got.Width != 1280 || got.Height != 720 {
		t.Fatalf("viewport = %+v", got)
	}
}

func TestFindExecutableReportsMissingExplicitBrowser(t *testing.T) {
	if _, err := FindExecutable("Z:/definitely/missing/browser.exe"); err == nil {
		t.Fatal("FindExecutable returned nil error")
	}
}

func TestCaptureSnapshotRunsHeadedWithoutHeadlessFlags(t *testing.T) {
	args, err := captureWithFakeBrowser(t, Options{Headed: true})
	if err == nil {
		t.Fatal("CaptureSnapshot returned nil error with fake browser")
	}

	for _, flag := range []string{"--headless", "--hide-scrollbars", "--mute-audio"} {
		if hasFlag(args, flag) {
			t.Fatalf("browser args contain %s in headed mode: %v", flag, args)
		}
	}
}

func TestCaptureSnapshotUsesExplicitProfileDir(t *testing.T) {
	profileDir := filepath.Join(t.TempDir(), "profile")

	args, err := captureWithFakeBrowser(t, Options{ProfileDir: profileDir})
	if err == nil {
		t.Fatal("CaptureSnapshot returned nil error with fake browser")
	}

	if _, err := os.Stat(profileDir); err != nil {
		t.Fatalf("explicit profile dir was not created: %v", err)
	}
	got, ok := flagValue(args, "--user-data-dir")
	if !ok {
		t.Fatalf("browser args do not contain --user-data-dir: %v", args)
	}
	if got != profileDir {
		t.Fatalf("user-data-dir = %q, want %q", got, profileDir)
	}
}

func TestErrorCodeForTimeout(t *testing.T) {
	if got := errorCodeFor(context.DeadlineExceeded, result.BridgeNotReady); got != result.Timeout {
		t.Fatalf("code = %s, want TIMEOUT", got)
	}
}

func captureWithFakeBrowser(t *testing.T, opts Options) ([]string, error) {
	t.Helper()

	dir := t.TempDir()
	argsPath := filepath.Join(dir, "browser.args")
	browserPath := buildFakeBrowser(t, argsPath)
	tracePath := filepath.Join(dir, "trace.pftrace")
	if err := os.WriteFile(tracePath, []byte("trace"), 0o644); err != nil {
		t.Fatal(err)
	}

	opts.BrowserPath = browserPath
	opts.TracePath = tracePath
	opts.UIURL = "http://127.0.0.1:1"
	opts.Viewport = "1280x720"

	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel()
	_, _, err := CaptureSnapshot(ctx, opts, spec.SnapshotSpec{Version: spec.Version})

	raw, readErr := os.ReadFile(argsPath)
	if readErr != nil {
		t.Fatalf("fake browser did not write args; capture err = %v; read args: %v", err, readErr)
	}
	return splitArgs(raw), err
}

func buildFakeBrowser(t *testing.T, argsPath string) string {
	t.Helper()

	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "fake_browser.go")
	source := fmt.Sprintf(`package main

import (
	"os"
	"strings"
)

func main() {
	_ = os.WriteFile(%q, []byte(strings.Join(os.Args[1:], "\n")), 0o644)
}
`, argsPath)
	if err := os.WriteFile(sourcePath, []byte(source), 0o644); err != nil {
		t.Fatal(err)
	}

	exePath := filepath.Join(dir, "fake-browser")
	if runtime.GOOS == "windows" {
		exePath += ".exe"
	}
	cmd := exec.Command("go", "build", "-o", exePath, sourcePath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("build fake browser: %v\n%s", err, out)
	}
	return exePath
}

func splitArgs(raw []byte) []string {
	text := strings.TrimSpace(string(raw))
	if text == "" {
		return nil
	}
	return strings.Split(text, "\n")
}

func hasFlag(args []string, flag string) bool {
	for _, arg := range args {
		if arg == flag || strings.HasPrefix(arg, flag+"=") {
			return true
		}
	}
	return false
}

func flagValue(args []string, flag string) (string, bool) {
	prefix := flag + "="
	for _, arg := range args {
		if strings.HasPrefix(arg, prefix) {
			return strings.TrimPrefix(arg, prefix), true
		}
	}
	return "", false
}
