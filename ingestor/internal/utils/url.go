package utils

import (
	"net/url"
	"sort"
	"strings"
)

func NormalizeURL(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	
	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = strings.ToLower(u.Host)
	u.Fragment = ""
	
	q := u.Query()
	trackingParams := []string{"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"}
	for _, param := range trackingParams {
		q.Del(param)
	}
	
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	
	newQuery := url.Values{}
	for _, k := range keys {
		newQuery[k] = q[k]
	}
	u.RawQuery = newQuery.Encode()
	
	return u.String()
}
