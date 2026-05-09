package browser

import (
	"context"
	"testing"

	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/result"
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

func TestErrorCodeForTimeout(t *testing.T) {
	if got := errorCodeFor(context.DeadlineExceeded, result.BridgeNotReady); got != result.Timeout {
		t.Fatalf("code = %s, want TIMEOUT", got)
	}
}
