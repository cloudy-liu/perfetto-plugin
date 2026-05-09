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
