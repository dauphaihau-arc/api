# Public, seeded Location Reference Data. Run after `just db-seed`.

# 1. The country list carries the fields the address form reads.
GET {{base_url}}/v1/locations/countries
HTTP 200
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$" count == 250
jsonpath "$[0].code" isString
jsonpath "$[0].name" isString
jsonpath "$[0].has_administrative_areas" isBoolean
jsonpath "$[0].postal_code_required" isBoolean
jsonpath "$[?(@.code == 'US')].name" == "United States"
jsonpath "$[?(@.code == 'US')].has_administrative_areas" == true
jsonpath "$[?(@.code == 'US')].postal_code_required" == true
jsonpath "$[?(@.code == 'AS')].has_administrative_areas" == false
jsonpath "$[?(@.code == 'VN')].postal_code_required" == false
