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

package spec

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestSnapshotSpecExamplesParse(t *testing.T) {
	exampleDir := snapshotSpecExampleDir(t)
	want := []string{
		"minimal_track_pin.snapshot.json",
		"phb110_camera_startup_happy_path.snapshot.json",
		"phb110_launcher_window_animation_slice_137953.snapshot.json",
		"phb110_mms_focused_app_slice_168859.snapshot.json",
		"slice_focus.snapshot.json",
		"slice_highlight.snapshot.json",
		"thread_state_snapshot.snapshot.json",
		"performance_evidence.snapshot.json",
	}

	for _, name := range want {
		path := filepath.Join(exampleDir, name)
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		if _, err := Parse(raw); err != nil {
			t.Fatalf("parse %s: %v", path, err)
		}
	}
}

func snapshotSpecExampleDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Clean(filepath.Join(
		filepath.Dir(file),
		"..",
		"..",
		"examples",
		"snapshot_specs",
	))
}
