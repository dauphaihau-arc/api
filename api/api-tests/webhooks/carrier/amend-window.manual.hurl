# Carrier and tracking stay amendable for three days after handover, until a scan.
#
# Run via `just carrier amend-window`. Builds its own cash Order; the API must run
# with CARRIER_WEBHOOK_SECRET=carrier-webhook-test-secret for the transit scan.
#
# The seller access token is captured once and attached per request with
# `[Cookies]`, so buyer logins can overwrite the shared jar safely.


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
shop_slug: jsonpath "$.slug"

GET {{base_url}}/v1/shops/{{shop_public_id}}/products?state=active&limit=20
x-category-identity-generation: 2
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
product_slug: jsonpath "$.items[0].slug"
inventory_id: jsonpath "$.items[0].inventory[0].id"
[Asserts]
jsonpath "$.items[0].inventory[0].stock" >= 1


# 2. Order A: correct the tracking after handover, then close the window with a scan.
POST {{base_url}}/v1/auth/register
Idempotency-Key: carrier-amend-window-register-{{carrier_run_id}}-1
Content-Type: application/json
```json
{ "email": "{{carrier_amend_buyer_1_email}}", "password": "{{buyer_login_password}}", "display_name": "Amend Buyer 1" }
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{carrier_amend_buyer_1_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200

POST {{base_url}}/v1/me/addresses
Idempotency-Key: carrier-amend-window-address-1
Content-Type: application/json
```json
{ "full_name": "Amend Buyer 1", "address_1": "1 Test Street", "city": "Portland", "state": "OR", "zip": "97201", "country": "US", "phone": "+14155550021", "is_primary": true }
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"

POST {{base_url}}/v1/cart/items
Idempotency-Key: carrier-amend-window-cart-1
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1 }
```
HTTP 201

POST {{base_url}}/v1/me/checkout/quote
Idempotency-Key: carrier-amend-window-quote-1
Content-Type: application/json
```json
{ "user_address_id": "{{address_id}}" }
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"

POST {{base_url}}/v1/me/checkout
Idempotency-Key: carrier-amend-window-checkout-1
Content-Type: application/json
```json
{ "quote_id": "{{quote_id}}", "payment_type": "cash" }
```
HTTP 201
[Captures]
order_a: jsonpath "$.order_shops[0].id"

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_a}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
group_a: jsonpath "$.order.fulfillment.groups[0].id"
item_a: jsonpath "$.order.fulfillment.groups[0].items[0].order_item_id"
qty_a: jsonpath "$.order.fulfillment.groups[0].items[0].quantity"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_a}}/fulfillment/shipments
Idempotency-Key: carrier-amend-prepare-a
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "group_id": "{{group_a}}", "items": [{ "order_item_id": "{{item_a}}", "quantity": {{qty_a}} }], "carrier": "usps", "tracking_number": "{{carrier_pickup_tracking}}" }
```
HTTP 201
[Captures]
shipment_a: jsonpath "$.fulfillment.groups[0].shipments[0].id"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_a}}/fulfillment/shipments/{{shipment_a}}/handover
Idempotency-Key: carrier-amend-handover-a
[Cookies]
accessToken: {{seller_token}}
HTTP 201
[Captures]
dispatched_a: jsonpath "$.fulfillment.groups[0].shipments[0].dispatched_at"

PATCH {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_a}}/fulfillment/shipments/{{shipment_a}}
Idempotency-Key: carrier-amend-a
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "carrier": "usps", "tracking_number": "{{carrier_amend_tracking}}" }
```
HTTP 200
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].status" == "dispatched"
jsonpath "$.fulfillment.groups[0].shipments[0].dispatched_at" == "{{dispatched_a}}"
jsonpath "$.fulfillment.groups[0].shipments[0].tracking_number" == "{{carrier_amend_tracking}}"

# The carrier event matches the original number, so the label goes back first.
PATCH {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_a}}/fulfillment/shipments/{{shipment_a}}
Idempotency-Key: carrier-amend-a-back
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "carrier": "usps", "tracking_number": "{{carrier_pickup_tracking}}" }
```
HTTP 200

POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_transit}}
Content-Type: application/json
file,bodies/transit.body;
HTTP 200

PATCH {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_a}}/fulfillment/shipments/{{shipment_a}}
Idempotency-Key: carrier-amend-a-after-scan
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "tracking_number": "{{carrier_amend_tracking}}" }
```
HTTP 409
[Asserts]
jsonpath "$.code" == "SHIPMENT_NOT_PREPARED"
