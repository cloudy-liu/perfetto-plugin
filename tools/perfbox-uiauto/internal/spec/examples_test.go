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
