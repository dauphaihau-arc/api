# Public caching and conditional requests for both Location endpoints.

# 1. The country list exposes the public cache policy and a strong validator.
GET {{base_url}}/v1/locations/countries
HTTP 200
[Captures]
countries_etag: header "ETag"
[Asserts]
header "Cache-Control" == "public, max-age=86400, stale-while-revalidate=604800"
header "ETag" matches /^"[a-f0-9]{64}"$/


# 2. The area list exposes a different validator for the same dataset.
GET {{base_url}}/v1/locations/countries/us/administrative-areas
HTTP 200
[Captures]
areas_etag: header "ETag"
[Asserts]
header "Cache-Control" == "public, max-age=86400, stale-while-revalidate=604800"
header "ETag" matches /^"[a-f0-9]{64}"$/
variable "countries_etag" != "{{areas_etag}}"


# 3. A matching country validator returns 304 without a body.
GET {{base_url}}/v1/locations/countries
If-None-Match: {{countries_etag}}
HTTP 304
[Asserts]
header "ETag" == "{{countries_etag}}"


# 4. A matching area validator returns 304, including a lowercase country code.
GET {{base_url}}/v1/locations/countries/us/administrative-areas
If-None-Match: {{areas_etag}}
HTTP 304
[Asserts]
header "ETag" == "{{areas_etag}}"
