GET {{base_url}}/v1/internal/catalog/status
HTTP 200
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$.driver" isString
jsonpath "$.searchDriver" isString
jsonpath "$.enabled" isBoolean
jsonpath "$.source" isObject
jsonpath "$.source.activeProducts" isInteger
jsonpath "$.projection" isObject
