# Transit and out-for-delivery carrier events keep the Shipment in transit.
#
# Run via `just carrier transit`, which generates the tracking number, event ids
# and signed bodies, then runs prepare, pickup and this file in sequence.
#
# Precondition: the Shipment for `carrier_pickup_tracking` is dispatched, and the
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

# 4. Confirms the Shipment this event must reach is dispatched.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[*].tracking_number" contains "{{carrier_pickup_tracking}}"
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "dispatched"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 2

# 5. The carrier reports the parcel is in transit.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_transit}}
Content-Type: application/json
file,bodies/transit.body;
HTTP 200
[Asserts]
jsonpath "$" isEmpty

# 6. The Shipment moved to in transit with one more update.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "in_transit"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 3
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].event_code" contains "IN_TRANSIT"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].location" contains "Salem, OR"

# 7. The carrier reports the parcel is out for delivery.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_ofd}}
Content-Type: application/json
file,bodies/ofd.body;
HTTP 200
[Asserts]
jsonpath "$" isEmpty

# 8. Out for delivery folds into in transit: the status does not move again.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "in_transit"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 4
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].event_code" contains "OUT_FOR_DELIVERY"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].location" contains "Beaverton, OR"
