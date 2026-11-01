# A repeated carrier event id is acknowledged without writing a second update.
#
# Run via `just carrier duplicate`, which generates the tracking number, event id
# and signed body, then runs prepare, pickup and this file in sequence.
#
# Precondition: the Shipment for `carrier_pickup_tracking` is dispatched and its
# `PICKED_UP` event has been accepted, and the API runs with
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


# 3. Resolve the paid Order from the card checkout session.
GET {{base_url}}/v1/checkout/session/{{checkout_session_id}}
HTTP 200
[Captures]
order_public_id: jsonpath "$.order_shops[0].id"
[Asserts]
jsonpath "$.order_shops" count > 0


# 4. Confirms the state the replay must leave untouched.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[*].tracking_number" contains "{{carrier_pickup_tracking}}"
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "dispatched"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 2


# 5. Replays the exact signed body: same event id, same bytes.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_pickup}}
Content-Type: application/json
file,bodies/pickup.body;
HTTP 200
[Asserts]
jsonpath "$" isEmpty


# 6. The duplicate is acknowledged, not applied: status and history are unchanged.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "dispatched"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 2
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].event_code" contains "PICKED_UP"
