package snapshot

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/result"
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
