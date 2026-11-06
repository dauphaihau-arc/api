# Two parcels in one fulfillment group: refunding one label leaves the other
# shipment, label, charge, and print action intact.
#
# Run via `just carrier label-two-parcels`. Requires the Mock Carrier and MOCK_CARRIER_URL.

# 1. Seller session, catalogue, buyer and a cash Order for two units.
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
jsonpath "$.items[0].inventory[0].stock" >= 3

POST {{base_url}}/v1/auth/register
Idempotency-Key: carrier-label-two-register-{{carrier_run_id}}
Content-Type: application/json
```json
{ "email": "{{carrier_label_buyer_3_email}}", "password": "{{buyer_login_password}}", "display_name": "Two Parcel Buyer" }
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{carrier_label_buyer_3_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200

POST {{base_url}}/v1/me/addresses
Idempotency-Key: carrier-label-two-address
Content-Type: application/json
```json
{ "full_name": "Two Parcel Buyer", "address_1": "1 Test Street", "city": "Portland", "state_code": "US-OR", "zip": "97201", "country_code": "US", "phone": "+14155550103", "is_primary": true }
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"

POST {{base_url}}/v1/cart/items
Idempotency-Key: carrier-label-two-cart
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 2 }
```
HTTP 201

POST {{base_url}}/v1/me/checkout/quote
Idempotency-Key: carrier-label-two-quote
Content-Type: application/json
```json
{ "user_address_id": "{{address_id}}" }
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"

POST {{base_url}}/v1/me/checkout
Idempotency-Key: carrier-label-two-checkout
Content-Type: application/json
```json
{ "quote_id": "{{quote_id}}", "payment_type": "cash" }
```
HTTP 201
[Captures]
order_public_id: jsonpath "$.order_shops[0].id"

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
group_id: jsonpath "$.order.fulfillment.groups[0].id"
order_item_id: jsonpath "$.order.fulfillment.groups[0].items[0].order_item_id"


# 2. Buy two labels, one unit each.
POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipment-rates
[Cookies]
accessToken: {{seller_token}}
Content-Type: application/json
```json
{ "weight_grams": 800, "length_cm": 30, "width_cm": 20, "height_cm": 10 }
```
HTTP 200
[Captures]
rate_quote_id: jsonpath "$.rates[0].quote_id"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/label
Idempotency-Key: carrier-label-two-purchase-1
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "quote_id": "{{rate_quote_id}}", "group_id": "{{group_id}}", "items": [{ "order_item_id": "{{order_item_id}}", "quantity": 1 }] }
```
HTTP 201
[Captures]
shipment_one: jsonpath "$.fulfillment.groups[0].shipments[0].id"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipment-rates
[Cookies]
accessToken: {{seller_token}}
Content-Type: application/json
```json
{ "weight_grams": 800, "length_cm": 30, "width_cm": 20, "height_cm": 10 }
```
HTTP 200
[Captures]
rate_quote_id_2: jsonpath "$.rates[0].quote_id"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/label
Idempotency-Key: carrier-label-two-purchase-2
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "quote_id": "{{rate_quote_id_2}}", "group_id": "{{group_id}}", "items": [{ "order_item_id": "{{order_item_id}}", "quantity": 1 }] }
```
HTTP 201
[Captures]
shipment_two: jsonpath "$.fulfillment.groups[0].shipments[1].id"
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments" count == 2


# 3. Refund one label only.
DELETE {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/{{shipment_one}}/label
Idempotency-Key: carrier-label-two-refund
[Cookies]
accessToken: {{seller_token}}
HTTP 200

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments" count == 2
jsonpath "$.order.fulfillment.groups[0].shipments[*].status" contains "voided"
jsonpath "$.order.fulfillment.groups[0].shipments[*].status" contains "prepared"
jsonpath "$.order.fulfillment.groups[0].shipments[*].label.status" contains "voided"
jsonpath "$.order.fulfillment.groups[0].shipments[*].label.status" contains "purchased"
