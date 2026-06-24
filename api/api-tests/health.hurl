GET {{base_url}}/health
HTTP 200
Cache-Control: no-store
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$.status" == "ok"
jsonpath "$.timestamp" isIsoDate
jsonpath "$.components" isObject
