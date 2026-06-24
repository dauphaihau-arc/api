POST {{base_url}}/v1/internal/catalog/best-sellers/refresh
HTTP 201
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$.ok" == true
