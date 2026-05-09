package paths

import "path/filepath"

func Clean(path string) string {
	if path == "" {
		return ""
	}
	return filepath.Clean(path)
}
