# The same event id from two carriers is recorded by both: dedupe is per
# (carrier, event_id), not global.
#
# Run via `just carrier cross-carrier`, which generates the USPS and DHL tracking
# numbers and signed bodies, runs the USPS pickup, then this file creates a cash
# Order with a DHL Shipment and replays the pickup event id from DHL.
#
# Precondition: the paid Order behind `checkout_session_id` has a dispatched USPS
# Shipment from `pickup.manual.hurl`, and the API runs with
# CARRIER_WEBHOOK_SECRET=carrier-webhook-test-secret.

# 1. Sign in as the seller who owns the shop.
POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{seller_login_email}}", "password": "{{seller_login_password}}", "app": "seller" }
```
HTTP 200
[Asserts]
cookie "accessToken" exists

# 2. Resolve the seller's shop.
GET {{base_url}}/v1/shops/me
HTTP 200
[Captures]
shop_public_id: jsonpath "$.id"
shop_slug: jsonpath "$.slug"

# 3. The USPS Shipment already holds the shared event id.
GET {{base_url}}/v1/checkout/session/{{checkout_session_id}}
HTTP 200
[Captures]
usps_order_public_id: jsonpath "$.order_shops[0].id"
[Asserts]
jsonpath "$.order_shops" count > 0

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{usps_order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "dispatched"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 2
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].actor_id" contains "usps"

# 4. A run-scoped buyer keeps this cash Order away from other runs' carts.
POST {{base_url}}/v1/auth/register
Content-Type: application/json
```json
{
  "email": "{{carrier_cash_buyer_email}}",
  "password": "{{buyer_login_password}}",
  "display_name": "Carrier Cash Buyer"
}
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{carrier_cash_buyer_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200
[Asserts]
cookie "accessToken" exists

POST {{base_url}}/v1/me/addresses
Content-Type: application/json
```json
{
  "full_name": "Carrier Cash Buyer",
  "address_1": "1 Test Street",
  "city": "Portland",
  "state": "OR",
  "zip": "97201",
  "country": "US",
  "phone": "+15550000009",
  "is_primary": true
}
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"

# 5. Any active product of the shop carries the inventory id a cash Order needs.
GET {{base_url}}/v1/shops/{{shop_public_id}}/products?state=active&limit=1
x-category-identity-generation: 2
HTTP 200
[Captures]
product_slug: jsonpath "$.items[0].slug"
[Asserts]
jsonpath "$.items" count > 0

GET {{base_url}}/v1/products/by-slug/{{shop_slug}}/{{product_slug}}
HTTP 200
[Captures]
inventory_id: jsonpath "$.inventory[0].id"
[Asserts]
jsonpath "$.inventory" count > 0
jsonpath "$.inventory[0].stock" > 0

# 6. A cash checkout is immediate: it needs no payment provider.
POST {{base_url}}/v1/cart/items
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1 }
```
HTTP 201

POST {{base_url}}/v1/me/checkout/quote
Content-Type: application/json
```json
{ "user_address_id": "{{address_id}}" }
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"

POST {{base_url}}/v1/me/checkout
Content-Type: application/json
```json
{ "quote_id": "{{quote_id}}", "payment_type": "cash" }
```
HTTP 201
[Captures]
dhl_order_public_id: jsonpath "$.order_shops[0].id"

# 7. Read the cash Order's fulfillment group and quantities.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{dhl_order_public_id}}
HTTP 200
[Captures]
group_id: jsonpath "$.order.fulfillment.groups[0].id"
order_item_id: jsonpath "$.order.fulfillment.groups[0].items[0].order_item_id"
quantity: jsonpath "$.order.fulfillment.groups[0].items[0].quantity"
[Asserts]
jsonpath "$.order.status" == "pending"
jsonpath "$.order.fulfillment.groups[0].shipments" count == 0

# 8. Prepare a DHL Shipment for the cash Order.
POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{dhl_order_public_id}}/fulfillment/shipments
Idempotency-Key: carrier-cross-carrier-prepare
Content-Type: application/json
```json
{
  "group_id": "{{group_id}}",
  "items": [{ "order_item_id": "{{order_item_id}}", "quantity": {{quantity}} }],
  "carrier": "dhl",
  "tracking_number": "{{carrier_cross_dhl_tracking}}"
}
```
HTTP 201
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].status" == "prepared"
jsonpath "$.fulfillment.groups[0].shipments[0].updates" count == 1

# 9. DHL reports the same event id the USPS Shipment already used.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_shared_dhl}}
Content-Type: application/json
file,bodies/shared-dhl.body;
HTTP 200
[Asserts]
jsonpath "$" isEmpty

# 10. DHL evidence is recorded, not dropped as a duplicate.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{dhl_order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "dispatched"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 2
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].event_code" contains "PICKED_UP"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].actor_id" contains "dhl"

# 11. The USPS Shipment is untouched: same status, same two updates.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{usps_order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "dispatched"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 2
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].actor_id" contains "usps"
