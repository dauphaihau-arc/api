# Quantities are locked once the seller declares handover.
#
# Run via `just carrier amend-locks`. Builds its own cash Order; no paid Order or
# earlier carrier step is required.
#
# The seller token is captured once and attached with `[Cookies]` per request.


# 1. Seller session and catalogue facts.
POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{seller_login_email}}", "password": "{{seller_login_password}}", "app": "seller" }
```
HTTP 200
[Captures]
seller_token: cookie "accessToken"

GET {{base_url}}/v1/shops/me
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
shop_public_id: jsonpath "$.id"

GET {{base_url}}/v1/shops/{{shop_public_id}}/products?state=active&limit=20
x-category-identity-generation: 2
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
inventory_id: jsonpath "$.items[0].inventory[0].id"
[Asserts]
jsonpath "$.items[0].inventory[0].stock" >= 1


# 2. A buyer and a cash Order.
POST {{base_url}}/v1/auth/register
Idempotency-Key: carrier-amend-lock-register-{{carrier_run_id}}
Content-Type: application/json
```json
{ "email": "{{carrier_amend_buyer_2_email}}", "password": "{{buyer_login_password}}", "display_name": "Amend Buyer 2" }
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{carrier_amend_buyer_2_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200

POST {{base_url}}/v1/me/addresses
Idempotency-Key: carrier-amend-lock-address-1
Content-Type: application/json
```json
{ "full_name": "Amend Buyer 2", "address_1": "1 Test Street", "city": "Portland", "state": "OR", "zip": "97201", "country": "US", "phone": "+15550000022", "is_primary": true }
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"

POST {{base_url}}/v1/cart/items
Idempotency-Key: carrier-amend-lock-cart-1
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1 }
```
HTTP 201

POST {{base_url}}/v1/me/checkout/quote
Idempotency-Key: carrier-amend-lock-quote-1
Content-Type: application/json
```json
{ "user_address_id": "{{address_id}}" }
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"

POST {{base_url}}/v1/me/checkout
Idempotency-Key: carrier-amend-lock-checkout-1
Content-Type: application/json
```json
{ "quote_id": "{{quote_id}}", "payment_type": "cash" }
```
HTTP 201
[Captures]
order_b: jsonpath "$.order_shops[0].id"


# 3. Prepare, then declare handover.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_b}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
group_b: jsonpath "$.order.fulfillment.groups[0].id"
item_b: jsonpath "$.order.fulfillment.groups[0].items[0].order_item_id"
qty_b: jsonpath "$.order.fulfillment.groups[0].items[0].quantity"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_b}}/fulfillment/shipments
Idempotency-Key: carrier-amend-lock-prepare
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "group_id": "{{group_b}}", "items": [{ "order_item_id": "{{item_b}}", "quantity": {{qty_b}} }], "carrier": "usps", "tracking_number": "{{carrier_voided_tracking}}" }
```
HTTP 201
[Captures]
shipment_b: jsonpath "$.fulfillment.groups[0].shipments[0].id"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_b}}/fulfillment/shipments/{{shipment_b}}/handover
Idempotency-Key: carrier-amend-lock-handover
[Cookies]
accessToken: {{seller_token}}
HTTP 201


# 4. Changing the quantities is rejected and leaves the Shipment untouched.
PATCH {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_b}}/fulfillment/shipments/{{shipment_b}}
Idempotency-Key: carrier-amend-lock-items
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "items": [{ "order_item_id": "{{item_b}}", "quantity": 1 }] }
```
HTTP 409
[Asserts]
jsonpath "$.code" == "SHIPMENT_NOT_PREPARED"

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_b}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].items[0].order_item_id" == "{{item_b}}"
jsonpath "$.order.fulfillment.groups[0].shipments[0].items[0].quantity" == {{qty_b}}
