package main

import (
	"os"

	"github.com/cloudy-liu/perfetto-plugin/tools/perfbox-uiauto/internal/cli"
)

func main() {
	os.Exit(cli.Main(os.Args[1:], os.Stdout, os.Stderr))
}
