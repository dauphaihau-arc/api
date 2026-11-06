# The Mock Carrier drives a real parcel end to end.
#
# Requires both services:
#   just mock-carrier                      # from apps/api, port 4100
#   MOCK_CARRIER_URL=http://127.0.0.1:4100 in api/.env, then restart the API
#   just carrier mock-parcel               # from api-tests
#
# The seller prepares a USPS Shipment with a generated tracking number, declares
# handover, and then never sets another status: the Mock Carrier reports pickup,
# transit and delivery through the signed webhook.

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
jsonpath "$.items[0].inventory[0].stock" >= 1


# 2. A buyer and a cash Order.
POST {{base_url}}/v1/auth/register
Idempotency-Key: carrier-mock-register-{{carrier_run_id}}
Content-Type: application/json
```json
{ "email": "{{carrier_notifications_buyer_email}}", "password": "{{buyer_login_password}}", "display_name": "Mock Parcel Buyer" }
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{carrier_notifications_buyer_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200

POST {{base_url}}/v1/me/addresses
Idempotency-Key: carrier-mock-address
Content-Type: application/json
```json
{ "full_name": "Mock Parcel Buyer", "address_1": "1 Test Street", "city": "Portland", "state": "OR", "zip": "97201", "country": "US", "phone": "+14155550041", "is_primary": true }
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"

POST {{base_url}}/v1/cart/items
Idempotency-Key: carrier-mock-cart
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1 }
```
HTTP 201

POST {{base_url}}/v1/me/checkout/quote
Idempotency-Key: carrier-mock-quote
Content-Type: application/json
```json
{ "user_address_id": "{{address_id}}" }
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"

POST {{base_url}}/v1/me/checkout
Idempotency-Key: carrier-mock-checkout
Content-Type: application/json
```json
{ "quote_id": "{{quote_id}}", "payment_type": "cash" }
```
HTTP 201
[Captures]
order_public_id: jsonpath "$.order_shops[0].id"


# 3. Preparing a supported Shipment registers the parcel with the carrier.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
group_id: jsonpath "$.order.fulfillment.groups[0].id"
order_item_id: jsonpath "$.order.fulfillment.groups[0].items[0].order_item_id"
quantity: jsonpath "$.order.fulfillment.groups[0].items[0].quantity"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments
Idempotency-Key: carrier-mock-prepare
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "group_id": "{{group_id}}", "items": [{ "order_item_id": "{{order_item_id}}", "quantity": {{quantity}} }], "carrier": "usps", "tracking_number": "{{carrier_pickup_tracking}}" }
```
HTTP 201
[Captures]
shipment_id: jsonpath "$.fulfillment.groups[0].shipments[0].id"
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].status" == "prepared"
jsonpath "$.fulfillment.groups[0].shipments[0].updates" count == 1

GET {{mock_carrier_url}}/parcels/{{carrier_pickup_tracking}}
HTTP 200
[Asserts]
jsonpath "$.parcel.carrier" == "usps"
jsonpath "$.parcel.handed_over_at" == null
jsonpath "$.parcel.events" count == 0


# 4. A corrected tracking number is registered with the carrier too.
PATCH {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/{{shipment_id}}
Idempotency-Key: carrier-mock-amend
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "carrier": "usps", "tracking_number": "{{carrier_amend_tracking}}" }
```
HTTP 200
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].tracking_number" == "{{carrier_amend_tracking}}"

GET {{mock_carrier_url}}/parcels/{{carrier_amend_tracking}}
HTTP 200
[Asserts]
jsonpath "$.parcel.handed_over_at" == null
jsonpath "$.parcel.events" count == 0


# 5. Handover signals the carrier, which reports pickup immediately.
POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/{{shipment_id}}/handover
Idempotency-Key: carrier-mock-handover
[Cookies]
accessToken: {{seller_token}}
HTTP 201
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].status" == "dispatched"

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "dispatched"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 4
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].event_code" contains "PICKED_UP"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].actor_id" contains "usps"


# 6. The carrier advances the parcel; the seller does nothing.
POST {{mock_carrier_url}}/parcels/{{carrier_amend_tracking}}/advance
Content-Type: application/json
```json
{ "carrier": "usps", "event_code": "IN_TRANSIT" }
```
HTTP 200
[Asserts]
jsonpath "$.emitted.event_code" == "IN_TRANSIT"

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "in_transit"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 5

POST {{mock_carrier_url}}/parcels/{{carrier_amend_tracking}}/advance
Content-Type: application/json
```json
{ "carrier": "usps", "event_code": "OUT_FOR_DELIVERY" }
```
HTTP 200
[Asserts]
jsonpath "$.emitted.event_code" == "OUT_FOR_DELIVERY"

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "in_transit"
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 6

POST {{mock_carrier_url}}/parcels/{{carrier_amend_tracking}}/advance
Content-Type: application/json
```json
{ "carrier": "usps", "event_code": "DELIVERED" }
```
HTTP 200
[Asserts]
jsonpath "$.emitted.event_code" == "DELIVERED"


# 7. The buyer sees the delivered Shipment, still with no seller status action.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "delivered"
jsonpath "$.order.fulfillment.groups[0].shipments[0].dispatched_at" exists
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates" count == 7
jsonpath "$.order.fulfillment.groups[0].shipments[0].updates[*].event_code" contains "DELIVERED"

GET {{base_url}}/v1/me/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order_shop.fulfillment.groups[0].shipments[0].status" == "delivered"
jsonpath "$.order_shop.fulfillment.groups[0].shipments[0].carrier" == "usps"
jsonpath "$.order_shop.fulfillment.groups[0].shipments[0].tracking_number" == "{{carrier_amend_tracking}}"

GET {{mock_carrier_url}}/parcels/{{carrier_amend_tracking}}
HTTP 200
[Asserts]
jsonpath "$.parcel.auto" == false
jsonpath "$.parcel.events[*].event_code" contains "PICKED_UP"
jsonpath "$.parcel.events[*].event_code" contains "DELIVERED"
