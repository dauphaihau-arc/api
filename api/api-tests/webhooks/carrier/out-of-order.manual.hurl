# A late event is stored without regressing later evidence.
#
# Run via `just carrier out-of-order`, which generates the tracking number, event
# ids and signed bodies, then runs prepare, pickup, transit, delivery and this
# file in sequence.
#
# Precondition: the Shipment for `carrier_pickup_tracking` is delivered, and the
# API runs with CARRIER_WEBHOOK_SECRET=carrier-webhook-test-secret.

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

# 3. Resolve the paid Order from the card checkout session.
GET {{base_url}}/v1/checkout/session/{{checkout_session_id}}
HTTP 200
[Captures]
order_public_id: jsonpath "$.order_shops[0].id"
[Asserts]
jsonpath "$.order_shops" count > 0

# 4. Confirms the Shipment is delivered before the late event arrives.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[*].tracking_number" contains "{{carrier_pickup_tracking}}"
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "delivered"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 5

# 5. The carrier reports an in-transit scan that occurred before the delivery.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_stale_transit}}
Content-Type: application/json
file,bodies/stale-transit.body;
HTTP 200
[Asserts]
jsonpath "$" isEmpty

# 6. The late event is stored, and the Shipment stays delivered.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "delivered"
jsonpath "$.order.fulfillment.groups[0].shipments[0].delivered_at" exists
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 6
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].event_code" contains "IN_TRANSIT"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].location" contains "Eugene, OR"
