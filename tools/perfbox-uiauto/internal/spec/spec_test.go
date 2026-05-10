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
