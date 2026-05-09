package cli

import (
	"context"
	"fmt"
	"io"

	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/result"
	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/snapshot"
)

const usage = `perfbox-uiauto controls Perfetto UI through Perfbox UiAuto Bridge.

Usage:
  perfbox-uiauto snapshot --trace TRACE --spec SPEC --out PNG [flags]

Snapshot flags:
  --ui-url URL          Perfetto UI URL (default http://localhost:10000)
  --trace PATH         Trace file path (required)
  --spec PATH          Snapshot Spec JSON path (required)
  --out PATH           Output PNG path (required)
  --result PATH        Optional result JSON path
  --viewport WxH       Browser viewport (default 1920x1080)
  --timeout-ms N       Timeout in milliseconds (default 60000)
  --browser-path PATH  Explicit Chrome, Edge, or Chromium path
  --headed             Run browser in headed mode
`

type SnapshotRunner func(context.Context, SnapshotOptions) (result.SnapshotResult, error)

func Main(args []string, stdout io.Writer, stderr io.Writer) int {
	return MainWithRunner(args, stdout, stderr, snapshot.Run)
}

func MainWithRunner(
	args []string,
	stdout io.Writer,
	stderr io.Writer,
	runSnapshot SnapshotRunner,
) int {
	if len(args) == 0 || args[0] == "help" || args[0] == "--help" || args[0] == "-h" {
		fmt.Fprint(stdout, usage)
		return 0
	}

	switch args[0] {
	case "snapshot":
		opts, err := ParseSnapshotArgs(args[1:])
		if err != nil {
			fmt.Fprintf(stderr, "snapshot: %v\n", err)
			return 2
		}
		snapshotResult, err := runSnapshot(context.Background(), opts)
		if err != nil {
			fmt.Fprintf(stderr, "snapshot: %v\n", err)
			return 1
		}
		if !snapshotResult.OK {
			fmt.Fprintf(stderr, "snapshot: completed with %d error(s)\n", len(snapshotResult.Errors))
			return 1
		}
		fmt.Fprintf(stdout, "snapshot written: %s\n", opts.OutPath)
		return 0
	default:
		fmt.Fprintf(stderr, "unknown command %q\n\n%s", args[0], usage)
		return 2
	}
}
