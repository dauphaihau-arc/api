# Public, seeded Location Reference Data. Run after `just db-seed`.

# 1. US subdivisions include the state code the address form expects.
GET {{base_url}}/v1/locations/countries/us/administrative-areas
HTTP 200
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$" isCollection
jsonpath "$[?(@.code == 'US-CA')].name" == "California"


# 2. The country path segment is case-insensitive.
GET {{base_url}}/v1/locations/countries/US/administrative-areas
HTTP 200
[Asserts]
jsonpath "$" isCollection


# 3. The Vietnam override replaces dr5hn's level-1 rows.
GET {{base_url}}/v1/locations/countries/vn/administrative-areas
HTTP 200
[Asserts]
jsonpath "$" count == 34
jsonpath "$[?(@.code == 'VN-01')].name" == "Hanoi"


# 4. A known country without administrative areas is an empty list, not a 404.
GET {{base_url}}/v1/locations/countries/as/administrative-areas
HTTP 200
[Asserts]
jsonpath "$" isEmpty


# 5. Unknown and inactive countries share the same not-found contract.
GET {{base_url}}/v1/locations/countries/zz/administrative-areas
HTTP 404
[Asserts]
jsonpath "$.code" == "LOCATION_COUNTRY_NOT_FOUND"
