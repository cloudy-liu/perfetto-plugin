package cli

import (
	"errors"
	"flag"
	"fmt"
	"io"

	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/snapshot"
)

const (
	defaultUIURL     = "http://localhost:10000"
	defaultViewport  = "1920x1080"
	defaultTimeoutMS = 60000
)

// SnapshotOptions contains the stable v1 command-line surface for one snapshot
// invocation.
type SnapshotOptions = snapshot.Options

func ParseSnapshotArgs(args []string) (SnapshotOptions, error) {
	opts := SnapshotOptions{
		UIURL:     defaultUIURL,
		Viewport:  defaultViewport,
		TimeoutMS: defaultTimeoutMS,
	}

	fs := flag.NewFlagSet("snapshot", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	fs.StringVar(&opts.UIURL, "ui-url", opts.UIURL, "Perfetto UI URL")
	fs.StringVar(&opts.TracePath, "trace", "", "trace file path")
	fs.StringVar(&opts.SpecPath, "spec", "", "snapshot spec JSON path")
	fs.StringVar(&opts.OutPath, "out", "", "output PNG path")
	fs.StringVar(&opts.ResultPath, "result", "", "optional result JSON path")
	fs.StringVar(&opts.Viewport, "viewport", opts.Viewport, "browser viewport, WIDTHxHEIGHT")
	fs.IntVar(&opts.TimeoutMS, "timeout-ms", opts.TimeoutMS, "timeout in milliseconds")
	fs.StringVar(&opts.BrowserPath, "browser-path", "", "explicit Chrome, Edge, or Chromium path")
	fs.BoolVar(&opts.Headed, "headed", false, "run browser in headed mode")

	if err := fs.Parse(args); err != nil {
		return SnapshotOptions{}, err
	}
	if opts.TracePath == "" {
		return SnapshotOptions{}, errors.New("--trace is required")
	}
	if opts.SpecPath == "" {
		return SnapshotOptions{}, errors.New("--spec is required")
	}
	if opts.OutPath == "" {
		return SnapshotOptions{}, errors.New("--out is required")
	}
	if opts.TimeoutMS <= 0 {
		return SnapshotOptions{}, fmt.Errorf("--timeout-ms must be positive: %d", opts.TimeoutMS)
	}
	return opts, nil
}
