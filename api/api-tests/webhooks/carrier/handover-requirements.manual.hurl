# A handover needs a carrier, a tracking number, and a non-voided Shipment.
#
# Run via `just carrier handover-requirements`. Builds its own cash Orders; no paid
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
jsonpath "$.items[0].inventory[0].stock" >= 2


# 2. Order B: a carrier with no tracking number cannot be handed over.
POST {{base_url}}/v1/auth/register
Idempotency-Key: carrier-handover-req-register-1-{{carrier_run_id}}
Content-Type: application/json
```json
{ "email": "{{carrier_handover_buyer_2_email}}", "password": "{{buyer_login_password}}", "display_name": "Handover Buyer 2" }
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{carrier_handover_buyer_2_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200

POST {{base_url}}/v1/me/addresses
Idempotency-Key: carrier-handover-req-address-1
Content-Type: application/json
```json
{ "full_name": "Handover Buyer 2", "address_1": "1 Test Street", "city": "Portland", "state_code": "US-OR", "zip": "97201", "country_code": "US", "phone": "+14155550012", "is_primary": true }
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"

POST {{base_url}}/v1/cart/items
Idempotency-Key: carrier-handover-req-cart-1
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1 }
```
HTTP 201

POST {{base_url}}/v1/me/checkout/quote
Idempotency-Key: carrier-handover-req-quote-1
Content-Type: application/json
```json
{ "user_address_id": "{{address_id}}" }
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"

POST {{base_url}}/v1/me/checkout
Idempotency-Key: carrier-handover-req-checkout-1
Content-Type: application/json
```json
{ "quote_id": "{{quote_id}}", "payment_type": "cash" }
```
HTTP 201
[Captures]
order_b: jsonpath "$.order_shops[0].id"

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_b}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
group_b: jsonpath "$.order.fulfillment.groups[0].id"
item_b: jsonpath "$.order.fulfillment.groups[0].items[0].order_item_id"
qty_b: jsonpath "$.order.fulfillment.groups[0].items[0].quantity"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_b}}/fulfillment/shipments
Idempotency-Key: carrier-handover-req-prepare-b
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "group_id": "{{group_b}}", "items": [{ "order_item_id": "{{item_b}}", "quantity": {{qty_b}} }], "carrier": "usps" }
```
HTTP 201
[Captures]
shipment_b: jsonpath "$.fulfillment.groups[0].shipments[0].id"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_b}}/fulfillment/shipments/{{shipment_b}}/handover
Idempotency-Key: carrier-handover-req-b
[Cookies]
accessToken: {{seller_token}}
HTTP 409
[Asserts]
jsonpath "$.code" == "SHIPMENT_HANDOVER_REQUIREMENTS"


# 3. Order C: a voided Shipment cannot be handed over.
POST {{base_url}}/v1/auth/register
Idempotency-Key: carrier-handover-req-register-2-{{carrier_run_id}}
Content-Type: application/json
```json
{ "email": "{{carrier_handover_buyer_3_email}}", "password": "{{buyer_login_password}}", "display_name": "Handover Buyer 3" }
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{carrier_handover_buyer_3_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200

POST {{base_url}}/v1/me/addresses
Idempotency-Key: carrier-handover-req-address-2
Content-Type: application/json
```json
{ "full_name": "Handover Buyer 3", "address_1": "1 Test Street", "city": "Portland", "state_code": "US-OR", "zip": "97201", "country_code": "US", "phone": "+14155550013", "is_primary": true }
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"

POST {{base_url}}/v1/cart/items
Idempotency-Key: carrier-handover-req-cart-2
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1 }
```
HTTP 201

POST {{base_url}}/v1/me/checkout/quote
Idempotency-Key: carrier-handover-req-quote-2
Content-Type: application/json
```json
{ "user_address_id": "{{address_id}}" }
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"

POST {{base_url}}/v1/me/checkout
Idempotency-Key: carrier-handover-req-checkout-2
Content-Type: application/json
```json
{ "quote_id": "{{quote_id}}", "payment_type": "cash" }
```
HTTP 201
[Captures]
order_c: jsonpath "$.order_shops[0].id"

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_c}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
group_c: jsonpath "$.order.fulfillment.groups[0].id"
item_c: jsonpath "$.order.fulfillment.groups[0].items[0].order_item_id"
qty_c: jsonpath "$.order.fulfillment.groups[0].items[0].quantity"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_c}}/fulfillment/shipments
Idempotency-Key: carrier-handover-req-prepare-c
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "group_id": "{{group_c}}", "items": [{ "order_item_id": "{{item_c}}", "quantity": {{qty_c}} }], "carrier": "usps", "tracking_number": "{{carrier_voided_tracking}}" }
```
HTTP 201
[Captures]
shipment_c: jsonpath "$.fulfillment.groups[0].shipments[0].id"

DELETE {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_c}}/fulfillment/shipments/{{shipment_c}}
Idempotency-Key: carrier-handover-req-void-c
[Cookies]
accessToken: {{seller_token}}
HTTP 200

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_c}}/fulfillment/shipments/{{shipment_c}}/handover
Idempotency-Key: carrier-handover-req-c
[Cookies]
accessToken: {{seller_token}}
HTTP 409
[Asserts]
jsonpath "$.code" == "SHIPMENT_ALREADY_VOIDED"
