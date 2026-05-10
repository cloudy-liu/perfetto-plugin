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
	"os"
)

type ErrorCode string

const (
	InvalidSpec      ErrorCode = "INVALID_SPEC"
	BrowserNotFound  ErrorCode = "BROWSER_NOT_FOUND"
	TraceLoadFailure ErrorCode = "TRACE_LOAD_FAILURE"
	BridgeNotReady   ErrorCode = "BRIDGE_NOT_READY"
	EventNotResolved ErrorCode = "EVENT_NOT_RESOLVED"
	TrackNotFound    ErrorCode = "TRACK_NOT_FOUND"
	TrackNotUnique   ErrorCode = "TRACK_NOT_UNIQUE"
	ScreenshotFailed ErrorCode = "SCREENSHOT_FAILURE"
	Timeout          ErrorCode = "TIMEOUT"
)

type SnapshotResult struct {
	OK       bool         `json:"ok"`
	Items    []ItemResult `json:"items"`
	Warnings []string     `json:"warnings"`
	Errors   []Error      `json:"errors"`
}

type ItemResult struct {
	Key         string `json:"key,omitempty"`
	Type        string `json:"type,omitempty"`
	OK          bool   `json:"ok"`
	TrackURI    string `json:"trackUri,omitempty"`
	EventID     *int64 `json:"eventId,omitempty"`
	Highlighted bool   `json:"highlighted,omitempty"`
	Message     string `json:"message,omitempty"`
}

type Error struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	Key     string    `json:"key,omitempty"`
}

func WriteFile(path string, result SnapshotResult) error {
	raw, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	return os.WriteFile(path, raw, 0o644)
}
