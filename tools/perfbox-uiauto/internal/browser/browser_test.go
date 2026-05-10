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
