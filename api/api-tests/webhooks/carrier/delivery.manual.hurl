# A delivered carrier event completes the paid Order and releases its payout.
#
# Run via `just carrier delivery`, which generates the tracking number, event ids
# and signed bodies, then runs prepare, pickup, transit and this file in
# sequence.
#
# Precondition: the Shipment for `carrier_pickup_tracking` is in transit and the
# API runs with CARRIER_WEBHOOK_SECRET=carrier-webhook-test-secret. The case drains
# the finance outbox itself with `outbox_drain_secret`, so no worker is required.


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


# 4. Confirms the Shipment this event must reach is in transit.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[*].tracking_number" contains "{{carrier_pickup_tracking}}"
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "in_transit"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 4


# 5. The carrier reports the parcel was delivered.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_delivered}}
Content-Type: application/json
file,bodies/delivered.body;
HTTP 200
[Asserts]
jsonpath "$" isEmpty


# 6. The Shipment is delivered and the fully delivered paid Order completes.
# Completion follows the fulfillment event, so retry until it lands.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Options]
retry: 10
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "delivered"
jsonpath "$.order.fulfillment.groups[0].shipments[0].delivered_at" exists
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 5
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].event_code" contains "DELIVERED"
jsonpath "$.order.status" == "completed"


# 7. Book the delivery money event. Without a worker, the internal drain does the
# same finance tick a cron would; it is idempotent, so running a worker too is fine.
POST {{base_url}}/v1/internal/jobs/drain?tasks=finance&limit=50
x-cron-secret: {{outbox_drain_secret}}
HTTP 200
[Asserts]
jsonpath "$.ok" == true


# 8. Delivery releases the Order's Payout Availability.
GET {{base_url}}/v1/shops/{{shop_public_id}}/finance/orders/{{order_public_id}}/payout
[Options]
retry: 10
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$.availability.recorded" == true
jsonpath "$.availability.available_at" exists
