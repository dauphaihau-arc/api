# Handover declares dispatch once; later statuses are the carrier's.
#
# Run via `just carrier handover`. Builds its own cash Order, so no paid Order or
# earlier carrier step is required; the API must run with
# CARRIER_WEBHOOK_SECRET=carrier-webhook-test-secret for the pickup replay.
#
# The seller token is captured once and attached with `[Cookies]` per request; the
# buyer login overwrites the shared jar safely.


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
jsonpath "$.items[0].inventory[0].stock" >= 4


# 2. A buyer and a cash Order.
POST {{base_url}}/v1/auth/register
Idempotency-Key: carrier-handover-register-{{carrier_run_id}}
Content-Type: application/json
```json
{ "email": "{{carrier_handover_buyer_1_email}}", "password": "{{buyer_login_password}}", "display_name": "Handover Buyer 1" }
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{carrier_handover_buyer_1_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200

POST {{base_url}}/v1/me/addresses
Idempotency-Key: carrier-handover-address-1
Content-Type: application/json
```json
{ "full_name": "Handover Buyer 1", "address_1": "1 Test Street", "city": "Portland", "state_code": "US-OR", "zip": "97201", "country_code": "US", "phone": "+14155550011", "is_primary": true }
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"

POST {{base_url}}/v1/cart/items
Idempotency-Key: carrier-handover-cart-1
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1 }
```
HTTP 201

POST {{base_url}}/v1/me/checkout/quote
Idempotency-Key: carrier-handover-quote-1
Content-Type: application/json
```json
{ "user_address_id": "{{address_id}}" }
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"

POST {{base_url}}/v1/me/checkout
Idempotency-Key: carrier-handover-checkout-1
Content-Type: application/json
```json
{ "quote_id": "{{quote_id}}", "payment_type": "cash" }
```
HTTP 201
[Captures]
order_a: jsonpath "$.order_shops[0].id"


# 3. Prepare, then declare handover.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_a}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
group_a: jsonpath "$.order.fulfillment.groups[0].id"
item_a: jsonpath "$.order.fulfillment.groups[0].items[0].order_item_id"
qty_a: jsonpath "$.order.fulfillment.groups[0].items[0].quantity"
[Asserts]
jsonpath "$.order.status" == "pending"
jsonpath "$.order.fulfillment.groups[0].shipments" count == 0

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_a}}/fulfillment/shipments
Idempotency-Key: carrier-handover-prepare-a
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "group_id": "{{group_a}}", "items": [{ "order_item_id": "{{item_a}}", "quantity": {{qty_a}} }], "carrier": "usps", "tracking_number": "{{carrier_pickup_tracking}}" }
```
HTTP 201
[Captures]
shipment_a: jsonpath "$.fulfillment.groups[0].shipments[0].id"


# 4. The declaration records exactly one seller-sourced dispatch update.
POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_a}}/fulfillment/shipments/{{shipment_a}}/handover
Idempotency-Key: carrier-handover-a
[Cookies]
accessToken: {{seller_token}}
HTTP 201
[Captures]
dispatched_a: jsonpath "$.fulfillment.groups[0].shipments[0].dispatched_at"
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].status" == "dispatched"
jsonpath "$.fulfillment.groups[0].shipments[0].dispatched_at" exists
jsonpath "$.fulfillment.groups[0].shipments[0].updates" count == 2
jsonpath "$.fulfillment.groups[0].shipments[0].updates[*].actor_type" contains "seller"
jsonpath "$.fulfillment.groups[0].shipments[0].updates[*].source" contains "seller"


# 5. Replaying the declaration changes nothing.
POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_a}}/fulfillment/shipments/{{shipment_a}}/handover
Idempotency-Key: carrier-handover-a-replay
[Cookies]
accessToken: {{seller_token}}
HTTP 201
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].updates" count == 2
jsonpath "$.fulfillment.groups[0].shipments[0].dispatched_at" == "{{dispatched_a}}"


# 6. A carrier already dispatched it: the declaration is a no-op.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_pickup}}
Content-Type: application/json
file,bodies/pickup.body;
HTTP 200
[Asserts]
jsonpath "$" isEmpty

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_a}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 3

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_a}}/fulfillment/shipments/{{shipment_a}}/handover
Idempotency-Key: carrier-handover-a-after-scan
[Cookies]
accessToken: {{seller_token}}
HTTP 201
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].updates" count == 3
jsonpath "$.fulfillment.groups[0].shipments[0].dispatched_at" == "{{dispatched_a}}"


# 7. The removed journey command no longer exists.
POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_a}}/fulfillment/shipments/{{shipment_a}}/journey
Idempotency-Key: carrier-handover-journey
Content-Type: application/json
```json
{ "status": "in_transit" }
```
HTTP 404


# 8. Handover blocks cancellation for the declared quantities.
PATCH {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_a}}/status
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "status": "canceled", "cancel_reason": "customer changed their mind" }
```
HTTP 400
[Asserts]
jsonpath "$.code" == "SELLER_SHIPPED_ORDER_CANCEL_NOT_ALLOWED"
