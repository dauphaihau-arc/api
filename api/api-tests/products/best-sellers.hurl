GET {{base_url}}/v1/products/best-sellers?limit=8
HTTP 200
[Asserts]
duration < 500
header "Content-Type" contains "application/json"
header "Vary" == "x-market-code, x-currency, x-locale, x-channel"
header "Cache-Control" == "public, max-age=60"
jsonpath "$.items" isCollection
