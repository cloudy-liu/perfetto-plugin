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

package cli

import (
	"bytes"
	"context"
	"errors"
	"testing"

	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/result"
)

func TestParseSnapshotArgsUsesDefaults(t *testing.T) {
	opts, err := ParseSnapshotArgs([]string{
		"--trace", "sample.trace",
		"--spec", "sample.snapshot.json",
		"--out", "sample.png",
	})
	if err != nil {
		t.Fatalf("ParseSnapshotArgs returned error: %v", err)
	}

	if opts.UIURL != "http://localhost:10000" {
		t.Fatalf("UIURL = %q, want default", opts.UIURL)
	}
	if opts.TracePath != "sample.trace" {
		t.Fatalf("TracePath = %q", opts.TracePath)
	}
	if opts.SpecPath != "sample.snapshot.json" {
		t.Fatalf("SpecPath = %q", opts.SpecPath)
	}
	if opts.OutPath != "sample.png" {
		t.Fatalf("OutPath = %q", opts.OutPath)
	}
	if opts.Viewport != "1920x1080" {
		t.Fatalf("Viewport = %q, want default", opts.Viewport)
	}
	if opts.TimeoutMS != 60000 {
		t.Fatalf("TimeoutMS = %d, want default", opts.TimeoutMS)
	}
	if opts.Headed {
		t.Fatal("Headed = true, want false by default")
	}
	if opts.ProfileDir != "" {
		t.Fatalf("ProfileDir = %q, want empty by default", opts.ProfileDir)
	}
}

func TestParseSnapshotArgsParsesBrowserLaunchFlags(t *testing.T) {
	opts, err := ParseSnapshotArgs([]string{
		"--trace", "sample.trace",
		"--spec", "sample.snapshot.json",
		"--out", "sample.png",
		"--browser-path", "C:\\browser\\chrome.exe",
		"--profile-dir", "D:\\cache\\perfbox-profile",
		"--headed",
	})
	if err != nil {
		t.Fatalf("ParseSnapshotArgs returned error: %v", err)
	}

	if opts.BrowserPath != "C:\\browser\\chrome.exe" {
		t.Fatalf("BrowserPath = %q", opts.BrowserPath)
	}
	if opts.ProfileDir != "D:\\cache\\perfbox-profile" {
		t.Fatalf("ProfileDir = %q", opts.ProfileDir)
	}
	if !opts.Headed {
		t.Fatal("Headed = false, want true")
	}
}

func TestMainSnapshotReturnsFailureForRunnerError(t *testing.T) {
	runner := func(_ context.Context, _ SnapshotOptions) (result.SnapshotResult, error) {
		return result.SnapshotResult{}, errors.New("boom")
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := MainWithRunner([]string{
		"snapshot",
		"--trace", "sample.trace",
		"--spec", "sample.snapshot.json",
		"--out", "sample.png",
	}, &stdout, &stderr, runner)

	if code != 1 {
		t.Fatalf("code = %d, want 1", code)
	}
}

func TestMainSnapshotReturnsFailureForUnsuccessfulResult(t *testing.T) {
	runner := func(_ context.Context, _ SnapshotOptions) (result.SnapshotResult, error) {
		return result.SnapshotResult{
			OK: false,
			Errors: []result.Error{
				{Code: result.TrackNotFound, Message: "missing"},
			},
		}, nil
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := MainWithRunner([]string{
		"snapshot",
		"--trace", "sample.trace",
		"--spec", "sample.snapshot.json",
		"--out", "sample.png",
	}, &stdout, &stderr, runner)

	if code != 1 {
		t.Fatalf("code = %d, want 1", code)
	}
}

func TestParseSnapshotArgsRequiresNormalModeInputs(t *testing.T) {
	tests := []struct {
		name string
		args []string
	}{
		{
			name: "missing trace",
			args: []string{"--spec", "spec.json", "--out", "out.png"},
		},
		{
			name: "missing spec",
			args: []string{"--trace", "trace", "--out", "out.png"},
		},
		{
			name: "missing out",
			args: []string{"--trace", "trace", "--spec", "spec.json"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := ParseSnapshotArgs(tt.args); err == nil {
				t.Fatal("ParseSnapshotArgs returned nil error")
			}
		})
	}
}

func TestMainSnapshotInvokesRunner(t *testing.T) {
	var got SnapshotOptions
	runner := func(_ context.Context, opts SnapshotOptions) (result.SnapshotResult, error) {
		got = opts
		return result.SnapshotResult{OK: true, Items: []result.ItemResult{}}, nil
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := MainWithRunner([]string{
		"snapshot",
		"--trace", "sample.trace",
		"--spec", "sample.snapshot.json",
		"--out", "sample.png",
	}, &stdout, &stderr, runner)

	if code != 0 {
		t.Fatalf("code = %d, stderr = %q", code, stderr.String())
	}
	if got.TracePath != "sample.trace" {
		t.Fatalf("TracePath = %q", got.TracePath)
	}
	if got.SpecPath != "sample.snapshot.json" {
		t.Fatalf("SpecPath = %q", got.SpecPath)
	}
	if got.OutPath != "sample.png" {
		t.Fatalf("OutPath = %q", got.OutPath)
	}
}
