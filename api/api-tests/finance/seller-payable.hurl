# The shop's Seller Payable, read by the seller who owns it.
#
# The shop is resolved from the current user (`GET /v1/shops/me`) rather than a
# fixed id, the way the seller app finds it. Requires a seeded seller that owns
# a shop; `seller_login_email` defaults to the seeded Olive Atelier owner.

# An unauthenticated caller cannot read a shop's payable.
GET {{base_url}}/v1/shops/shop_unknown/finance/payable
HTTP 401
[Asserts]
jsonpath "$.code" == "AUTH_REQUIRED"

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
header "Cache-Control" == "no-store"
cookie "accessToken" exists
jsonpath "$.user.roles" contains "seller"

# Resolve the seller's own shop.
GET {{base_url}}/v1/shops/me
HTTP 200
[Captures]
shop_public_id: jsonpath "$.id"
[Asserts]
header "Cache-Control" == "private, no-cache"
jsonpath "$.id" startsWith "shop_"

# Seller Payable is integer minor units per currency; the list is empty until an
# Order is paid.
GET {{base_url}}/v1/shops/{{shop_public_id}}/finance/payable
HTTP 200
[Asserts]
header "Content-Type" contains "application/json"
header "Cache-Control" == "private, no-cache"
jsonpath "$.positions" isCollection
