package spec

import "testing"

func TestParseMinimalSnapshotSpec(t *testing.T) {
	raw := []byte(`{
		"version": 1,
		"title": "minimal track pin",
		"tracks": [
			{
				"key": "focused-app",
				"type": "track",
				"name": "Focused app",
				"unique": true
			}
		],
		"viewport": {"preset": "selection"},
		"screenshot": {"fullPage": false}
	}`)

	got, err := Parse(raw)
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if got.Version != 1 {
		t.Fatalf("Version = %d, want 1", got.Version)
	}
	if got.Title != "minimal track pin" {
		t.Fatalf("Title = %q", got.Title)
	}
	if len(got.Tracks) != 1 {
		t.Fatalf("len(Tracks) = %d, want 1", len(got.Tracks))
	}
	if got.Tracks[0].Type != "track" {
		t.Fatalf("Tracks[0].Type = %q", got.Tracks[0].Type)
	}
	if !got.Tracks[0].Unique {
		t.Fatal("Tracks[0].Unique = false, want true")
	}
}

func TestParseRejectsMissingVersion(t *testing.T) {
	_, err := Parse([]byte(`{"tracks":[]}`))
	if err == nil {
		t.Fatal("Parse returned nil error")
	}
}

func TestParseAllowsUTF8BOM(t *testing.T) {
	raw := append([]byte{0xEF, 0xBB, 0xBF}, []byte(`{"version":1}`)...)
	if _, err := Parse(raw); err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
}
