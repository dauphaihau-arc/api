# An unverified carrier hands over but produces no Carrier Evidence.
#
# Run via `just carrier handover-unverified`. Builds its own cash Order; no paid
# Order or carrier event is involved.
#
# The seller token is captured once and attached with `[Cookies]` per request.


# 1. Seller session, an active product with stock, and its inventory.
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
Idempotency-Key: carrier-handover-unverified-register-{{carrier_run_id}}
Content-Type: application/json
```json
{ "email": "{{carrier_handover_buyer_4_email}}", "password": "{{buyer_login_password}}", "display_name": "Handover Buyer 4" }
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{carrier_handover_buyer_4_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200

POST {{base_url}}/v1/me/addresses
Idempotency-Key: carrier-handover-unverified-address-1
Content-Type: application/json
```json
{ "full_name": "Handover Buyer 4", "address_1": "1 Test Street", "city": "Portland", "state_code": "US-OR", "zip": "97201", "country_code": "US", "phone": "+14155550014", "is_primary": true }
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"

POST {{base_url}}/v1/cart/items
Idempotency-Key: carrier-handover-unverified-cart-1
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1 }
```
HTTP 201

POST {{base_url}}/v1/me/checkout/quote
Idempotency-Key: carrier-handover-unverified-quote-1
Content-Type: application/json
```json
{ "user_address_id": "{{address_id}}" }
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"

POST {{base_url}}/v1/me/checkout
Idempotency-Key: carrier-handover-unverified-checkout-1
Content-Type: application/json
```json
{ "quote_id": "{{quote_id}}", "payment_type": "cash" }
```
HTTP 201
[Captures]
order_d: jsonpath "$.order_shops[0].id"


# 3. Prepare with Other and declare handover.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_d}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
group_d: jsonpath "$.order.fulfillment.groups[0].id"
item_d: jsonpath "$.order.fulfillment.groups[0].items[0].order_item_id"
qty_d: jsonpath "$.order.fulfillment.groups[0].items[0].quantity"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_d}}/fulfillment/shipments
Idempotency-Key: carrier-handover-unverified-prepare-d
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "group_id": "{{group_d}}", "items": [{ "order_item_id": "{{item_d}}", "quantity": {{qty_d}} }], "carrier": "other", "tracking_number": "LOCAL-COURIER-1" }
```
HTTP 201
[Captures]
shipment_d: jsonpath "$.fulfillment.groups[0].shipments[0].id"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_d}}/fulfillment/shipments/{{shipment_d}}/handover
Idempotency-Key: carrier-handover-unverified-d
[Cookies]
accessToken: {{seller_token}}
HTTP 201
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].status" == "dispatched"
jsonpath "$.fulfillment.groups[0].shipments[0].carrier_observable" == false
jsonpath "$.fulfillment.groups[0].shipments[0].updates" count == 2
jsonpath "$.fulfillment.groups[0].shipments[0].updates[*].source" contains "seller"
