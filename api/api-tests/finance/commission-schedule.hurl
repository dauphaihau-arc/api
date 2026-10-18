# The Platform Commission Schedule, recorded by a platform admin.
#
# `finance.manage` is an admin-only permission, so the endpoint is refused for a
# seller and for an unauthenticated caller. The shop is resolved from the
# seeded seller's `GET /v1/shops/me`, the way the seller app finds it.

# An unauthenticated caller cannot record a Commission Schedule.
PUT {{base_url}}/v1/admin/shops/shop_unknown/commission-schedule
Content-Type: application/json
```json
{
  "effective_from": "2020-01-01T00:00:00.000Z",
  "rate_basis_points": 1500
}
```
HTTP 401
[Asserts]
jsonpath "$.code" == "AUTH_REQUIRED"

# A signed-in seller is refused (403, not a 500).
POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{
  "email": "{{seller_login_email}}",
  "password": "{{seller_login_password}}",
  "app": "seller"
}
```
HTTP 200
[Asserts]
cookie "accessToken" exists
jsonpath "$.user.roles" contains "seller"

GET {{base_url}}/v1/shops/me
HTTP 200
[Captures]
shop_public_id: jsonpath "$.id"

PUT {{base_url}}/v1/admin/shops/{{shop_public_id}}/commission-schedule
Content-Type: application/json
```json
{
  "effective_from": "2020-01-01T00:00:00.000Z",
  "rate_basis_points": 1500
}
```
HTTP 403
[Asserts]
jsonpath "$.code" exists

# A signed-in admin records it and the response echoes the request.
POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{
  "email": "{{admin_login_email}}",
  "password": "{{admin_login_password}}",
  "app": "admin"
}
```
HTTP 200
[Asserts]
cookie "accessToken" exists
jsonpath "$.user.roles" contains "admin"

PUT {{base_url}}/v1/admin/shops/{{shop_public_id}}/commission-schedule
Content-Type: application/json
```json
{
  "effective_from": "2020-01-01T00:00:00.000Z",
  "rate_basis_points": 1500
}
```
HTTP 200
[Asserts]
jsonpath "$.shop_id" == "{{shop_public_id}}"
jsonpath "$.effective_from" == "2020-01-01T00:00:00.000Z"
jsonpath "$.rate_basis_points" == 1500
