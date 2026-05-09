package browser

import "net/url"

type parsedURL = url.URL

func urlParse(rawURL string) (*parsedURL, error) {
	return url.Parse(rawURL)
}
