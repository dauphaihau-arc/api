# A carrier event for a voided Shipment is acknowledged and ignored.
#
# Run via `just carrier voided`, which generates the tracking number, event id
# and signed body, then runs this file. It builds its own cash Order, so no paid
# Order or earlier carrier step is required.
#
# Precondition: the API runs with CARRIER_WEBHOOK_SECRET=carrier-webhook-test-secret.

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

# 3. A run-scoped buyer keeps this cash Order away from other runs' carts.
POST {{base_url}}/v1/auth/register
Content-Type: application/json
```json
{
  "email": "{{carrier_voided_buyer_email}}",
  "password": "{{buyer_login_password}}",
  "display_name": "Carrier Voided Buyer"
}
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{carrier_voided_buyer_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200
[Asserts]
cookie "accessToken" exists

POST {{base_url}}/v1/me/addresses
Content-Type: application/json
```json
{
  "full_name": "Carrier Voided Buyer",
  "address_1": "1 Test Street",
  "city": "Portland",
  "state": "OR",
  "zip": "97201",
  "country": "US",
  "phone": "+14155550010",
  "is_primary": true
}
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"

# 4. Any active product of the shop carries the inventory id a cash Order needs.
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

# 5. A cash checkout is immediate: it needs no payment provider.
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
order_public_id: jsonpath "$.order_shops[0].id"

# 6. Read the cash Order's fulfillment group and quantities.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Captures]
group_id: jsonpath "$.order.fulfillment.groups[0].id"
order_item_id: jsonpath "$.order.fulfillment.groups[0].items[0].order_item_id"
quantity: jsonpath "$.order.fulfillment.groups[0].items[0].quantity"
[Asserts]
jsonpath "$.order.status" == "pending"
jsonpath "$.order.fulfillment.groups[0].shipments" count == 0

# 7. Prepare the Shipment the case then voids.
POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments
Idempotency-Key: carrier-voided-prepare
Content-Type: application/json
```json
{
  "group_id": "{{group_id}}",
  "items": [{ "order_item_id": "{{order_item_id}}", "quantity": {{quantity}} }],
  "carrier": "usps",
  "tracking_number": "{{carrier_voided_tracking}}"
}
```
HTTP 201
[Captures]
shipment_id: jsonpath "$.fulfillment.groups[0].shipments[0].id"
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].status" == "prepared"

# 8. Void it before any carrier handover.
DELETE {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/{{shipment_id}}
Idempotency-Key: carrier-voided-void
HTTP 200
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].status" == "voided"
jsonpath "$.fulfillment.groups[0].shipments[0].voided_at" exists
jsonpath "$.fulfillment.groups[0].shipments[0].updates" count == 2

# 9. The carrier reports a pickup for the voided Shipment's number.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_voided_pickup}}
Content-Type: application/json
file,bodies/voided-pickup.body;
HTTP 200
[Asserts]
jsonpath "$" isEmpty

# 10. The event is ignored: still voided, still the prepared and voided updates.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "voided"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 2
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[1].status" == "voided"
