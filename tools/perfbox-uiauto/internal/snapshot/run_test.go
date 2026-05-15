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

package snapshot

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/browser"
	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/result"
	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/spec"
)

func TestRunWritesInvalidSpecResult(t *testing.T) {
	dir := t.TempDir()
	specPath := filepath.Join(dir, "bad.snapshot.json")
	resultPath := filepath.Join(dir, "bad.result.json")
	if err := os.WriteFile(specPath, []byte(`{"tracks":[]}`), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := Run(context.Background(), Options{
		SpecPath:   specPath,
		TracePath:  filepath.Join(dir, "trace.pftrace"),
		OutPath:    filepath.Join(dir, "out.png"),
		ResultPath: resultPath,
		TimeoutMS:  1000,
		Viewport:   "1920x1080",
		UIURL:      "http://localhost:10000",
	})
	if err == nil {
		t.Fatal("Run returned nil error")
	}
	if got.OK {
		t.Fatal("SnapshotResult.OK = true, want false")
	}
	if len(got.Errors) != 1 || got.Errors[0].Code != result.InvalidSpec {
		t.Fatalf("Errors = %+v, want INVALID_SPEC", got.Errors)
	}

	raw, err := os.ReadFile(resultPath)
	if err != nil {
		t.Fatal(err)
	}
	var written result.SnapshotResult
	if err := json.Unmarshal(raw, &written); err != nil {
		t.Fatal(err)
	}
	if len(written.Errors) != 1 || written.Errors[0].Code != result.InvalidSpec {
		t.Fatalf("written Errors = %+v, want INVALID_SPEC", written.Errors)
	}
}

func TestRunWithCaptureWritesIndependentConcurrentOutputs(t *testing.T) {
	dir := t.TempDir()
	firstSpec := filepath.Join(dir, "first.snapshot.json")
	secondSpec := filepath.Join(dir, "second.snapshot.json")
	for _, path := range []string{firstSpec, secondSpec} {
		if err := os.WriteFile(path, []byte(`{"version":1}`), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	started := make(chan string, 2)
	release := make(chan struct{})
	capture := func(
		ctx context.Context,
		opts browser.Options,
		_ spec.SnapshotSpec,
	) (result.SnapshotResult, []byte, error) {
		started <- filepath.Base(opts.TracePath)
		select {
		case <-release:
		case <-ctx.Done():
			return failed(result.Timeout, ctx.Err().Error()), nil, ctx.Err()
		}
		if strings.Contains(opts.TracePath, "fail") {
			return failed(result.TraceLoadFailure, "trace load failed"), nil,
				errors.New("trace load failed")
		}
		eventID := int64(7)
		return result.SnapshotResult{
			OK: true,
			Items: []result.ItemResult{{
				Key:      "success",
				Type:     "event",
				OK:       true,
				TrackURI: "track://success",
				EventID:  &eventID,
			}},
			Warnings: []string{},
			Errors:   []result.Error{},
		}, []byte("png-success"), nil
	}

	successOpts := Options{
		UIURL:      "http://localhost:10000",
		TracePath:  filepath.Join(dir, "success.trace"),
		SpecPath:   firstSpec,
		OutPath:    filepath.Join(dir, "success.png"),
		ResultPath: filepath.Join(dir, "success.result.json"),
		Viewport:   "1920x1080",
		TimeoutMS:  1000,
	}
	failureOpts := Options{
		UIURL:      "http://localhost:10000",
		TracePath:  filepath.Join(dir, "fail.trace"),
		SpecPath:   secondSpec,
		OutPath:    filepath.Join(dir, "failure.png"),
		ResultPath: filepath.Join(dir, "failure.result.json"),
		Viewport:   "1920x1080",
		TimeoutMS:  1000,
	}

	type runResult struct {
		name string
		got  result.SnapshotResult
		err  error
	}
	results := make(chan runResult, 2)
	var wg sync.WaitGroup
	for name, opts := range map[string]Options{
		"success": successOpts,
		"failure": failureOpts,
	} {
		wg.Add(1)
		go func(name string, opts Options) {
			defer wg.Done()
			got, err := RunWithCapture(context.Background(), opts, capture)
			results <- runResult{name: name, got: got, err: err}
		}(name, opts)
	}

	seen := map[string]bool{}
	for len(seen) < 2 {
		select {
		case trace := <-started:
			seen[trace] = true
		case <-time.After(2 * time.Second):
			t.Fatal("timed out waiting for both captures to start")
		}
	}
	close(release)
	wg.Wait()
	close(results)

	var success, failure runResult
	for got := range results {
		switch got.name {
		case "success":
			success = got
		case "failure":
			failure = got
		}
	}
	if success.err != nil || !success.got.OK {
		t.Fatalf("success result = %+v, err = %v", success.got, success.err)
	}
	if failure.err == nil || failure.got.OK {
		t.Fatalf("failure result = %+v, err = %v", failure.got, failure.err)
	}
	assertFileBytes(t, successOpts.OutPath, []byte("png-success"))
	assertResultOK(t, successOpts.ResultPath, true)
	if _, err := os.Stat(failureOpts.OutPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("failure PNG exists or stat failed: %v", err)
	}
	assertResultOK(t, failureOpts.ResultPath, false)
}

func TestRunWithCaptureForwardsBrowserLaunchOptions(t *testing.T) {
	dir := t.TempDir()
	specPath := filepath.Join(dir, "snapshot.json")
	if err := os.WriteFile(specPath, []byte(`{"version":1}`), 0o644); err != nil {
		t.Fatal(err)
	}

	var got browser.Options
	capture := func(
		_ context.Context,
		opts browser.Options,
		_ spec.SnapshotSpec,
	) (result.SnapshotResult, []byte, error) {
		got = opts
		return result.SnapshotResult{OK: true}, []byte("png"), nil
	}

	opts := Options{
		UIURL:       "http://localhost:10000",
		TracePath:   filepath.Join(dir, "trace.pftrace"),
		SpecPath:    specPath,
		OutPath:     filepath.Join(dir, "out.png"),
		Viewport:    "1920x1080",
		TimeoutMS:   1000,
		BrowserPath: "C:\\browser\\chrome.exe",
		ProfileDir:  filepath.Join(dir, "profile"),
		Headed:      true,
	}

	if _, err := RunWithCapture(context.Background(), opts, capture); err != nil {
		t.Fatalf("RunWithCapture returned error: %v", err)
	}
	if got.BrowserPath != opts.BrowserPath {
		t.Fatalf("BrowserPath = %q, want %q", got.BrowserPath, opts.BrowserPath)
	}
	if got.ProfileDir != opts.ProfileDir {
		t.Fatalf("ProfileDir = %q, want %q", got.ProfileDir, opts.ProfileDir)
	}
	if !got.Headed {
		t.Fatal("Headed = false, want true")
	}
}

func assertFileBytes(t *testing.T, path string, want []byte) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatalf("%s = %q, want %q", path, got, want)
	}
}

func assertResultOK(t *testing.T, path string, want bool) {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var written result.SnapshotResult
	if err := json.Unmarshal(raw, &written); err != nil {
		t.Fatal(err)
	}
	if written.OK != want {
		t.Fatalf("%s ok = %t, want %t", path, written.OK, want)
	}
}
