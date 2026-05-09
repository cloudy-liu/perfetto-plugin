package result

import (
	"encoding/json"
	"testing"
)

func TestSnapshotResultJSONShape(t *testing.T) {
	eventID := int64(7)
	got := SnapshotResult{
		OK: true,
		Items: []ItemResult{
			{Key: "focused-app", Type: "track", OK: true, TrackURI: "track://1"},
			{Key: "slice", Type: "event", OK: true, TrackURI: "track://2", EventID: &eventID},
		},
		Warnings: []string{"kept viewport default"},
		Errors:   []Error{},
	}

	raw, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("Marshal returned error: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}

	for _, key := range []string{"ok", "items", "warnings", "errors"} {
		if _, ok := decoded[key]; !ok {
			t.Fatalf("result JSON missing %q: %s", key, raw)
		}
	}
}
