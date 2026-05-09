package spec

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
)

const Version = 1

type SnapshotSpec struct {
	Version    int            `json:"version"`
	Title      string         `json:"title,omitempty"`
	Tracks     []TrackSpec    `json:"tracks,omitempty"`
	Events     []EventSpec    `json:"events,omitempty"`
	Viewport   ViewportSpec   `json:"viewport,omitempty"`
	Screenshot ScreenshotSpec `json:"screenshot,omitempty"`
}

type TrackSpec struct {
	Key       string `json:"key,omitempty"`
	Type      string `json:"type"`
	Name      string `json:"name,omitempty"`
	URI       string `json:"uri,omitempty"`
	TrackKind string `json:"trackKind,omitempty"`
	Unique    bool   `json:"unique,omitempty"`
	Pin       *bool  `json:"pin,omitempty"`
}

type EventSpec struct {
	Key            string   `json:"key,omitempty"`
	Type           string   `json:"type"`
	Event          EventRef `json:"event"`
	PinOwningTrack bool     `json:"pinOwningTrack,omitempty"`
	Focus          bool     `json:"focus,omitempty"`
	Highlight      bool     `json:"highlight,omitempty"`
}

type EventRef struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
}

type ViewportSpec struct {
	Preset  string `json:"preset,omitempty"`
	StartNs string `json:"startNs,omitempty"`
	EndNs   string `json:"endNs,omitempty"`
}

type ScreenshotSpec struct {
	FullPage bool `json:"fullPage,omitempty"`
}

func Load(path string) (SnapshotSpec, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return SnapshotSpec{}, err
	}
	return Parse(raw)
}

func Parse(raw []byte) (SnapshotSpec, error) {
	raw = bytes.TrimPrefix(raw, []byte{0xEF, 0xBB, 0xBF})
	var got SnapshotSpec
	if err := json.Unmarshal(raw, &got); err != nil {
		return SnapshotSpec{}, err
	}
	if err := got.Validate(); err != nil {
		return SnapshotSpec{}, err
	}
	return got, nil
}

func (s SnapshotSpec) Validate() error {
	if s.Version == 0 {
		return errors.New("version is required")
	}
	if s.Version != Version {
		return fmt.Errorf("unsupported snapshot spec version %d", s.Version)
	}
	for i, track := range s.Tracks {
		if track.Type == "" {
			return fmt.Errorf("tracks[%d].type is required", i)
		}
	}
	for i, event := range s.Events {
		if event.Type == "" {
			return fmt.Errorf("events[%d].type is required", i)
		}
		if event.Event.Type == "" {
			return fmt.Errorf("events[%d].event.type is required", i)
		}
	}
	return nil
}
