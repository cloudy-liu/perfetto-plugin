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
