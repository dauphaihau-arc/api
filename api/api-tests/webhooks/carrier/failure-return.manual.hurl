# Failure and return are recorded as evidence without advancing the journey.
#
# Run via `just carrier failure-return`, which generates the tracking number, event
# ids and signed bodies, then runs prepare, pickup, transit and this file in
# sequence.
#
# Precondition: the Shipment for `carrier_pickup_tracking` is in transit, and the
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

# 4. Confirms the Shipment is in transit before the exception arrives.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[*].tracking_number" contains "{{carrier_pickup_tracking}}"
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "in_transit"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 4

# 5. The carrier reports a failed delivery attempt.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_delivery_failed}}
Content-Type: application/json
file,bodies/delivery-failed.body;
HTTP 200
[Asserts]
jsonpath "$" isEmpty

# 6. Failure does not move the journey; it is recorded on the timeline.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "in_transit"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 5
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].event_code" contains "DELIVERY_FAILED"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].location" contains "Gresham, OR"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].source" contains "carrier"

# 7. The carrier reports the parcel returning to the seller.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_returned}}
Content-Type: application/json
file,bodies/returned.body;
HTTP 200
[Asserts]
jsonpath "$" isEmpty

# 8. Return is recorded too; the status still does not move.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "in_transit"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 6
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].event_code" contains "RETURNED"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].location" contains "Vancouver, WA"
