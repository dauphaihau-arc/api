# Prepares a USPS Shipment for the paid Order the card flow produced.
#
# Run via `just carrier prepare` (prepare only) or `just carrier pickup` (prepare
# then pickup). Both generate `carrier_pickup_tracking` and re-sign the pickup
# body, so nothing in this file is edited by hand.
#
# Precondition: the card flow has produced a paid Order whose `cs_...` id is in
# `checkout_session_id`. A card Order only receives its seller fulfillment group
# once payment confirms, so an unpaid session has no group to prepare.


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


# 4. The Order must be paid: a card Order only receives its seller fulfillment
# group once payment confirms, so an unpaid session has no group to prepare.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order.status" == "paid"
jsonpath "$.order.fulfillment.requires_reconciliation" == false
jsonpath "$.order.fulfillment.groups" count > 0

# 5. Read the Order's fulfillment group and the quantities to prepare.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Captures]
group_id: jsonpath "$.order.fulfillment.groups[0].id"
order_item_id: jsonpath "$.order.fulfillment.groups[0].items[0].order_item_id"
quantity: jsonpath "$.order.fulfillment.groups[0].items[0].quantity"
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments" count == 0


# 6. Prepare a USPS Shipment for those quantities.
POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments
Idempotency-Key: carrier-pickup-prepare
Content-Type: application/json
```json
{
  "group_id": "{{group_id}}",
  "items": [{ "order_item_id": "{{order_item_id}}", "quantity": {{quantity}} }],
  "carrier": "usps",
  "tracking_number": "{{carrier_pickup_tracking}}"
}
```
HTTP 201
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].status" == "prepared"
jsonpath "$.fulfillment.groups[0].shipments[0].tracking_number" == "{{carrier_pickup_tracking}}"
jsonpath "$.fulfillment.groups[0].shipments[0].updates" count == 1
