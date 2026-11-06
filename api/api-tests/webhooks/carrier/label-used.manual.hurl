# First carrier scan marks the label used; refund after that is refused, and a
# labeled Shipment cannot be voided around the refund path.
#
# Run via `just carrier label-used`. Requires the Mock Carrier and MOCK_CARRIER_URL.

# 1. Seller session, catalogue, buyer and cash Order.
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

POST {{base_url}}/v1/auth/register
Idempotency-Key: carrier-label-used-register-{{carrier_run_id}}
Content-Type: application/json
```json
{ "email": "{{carrier_label_buyer_2_email}}", "password": "{{buyer_login_password}}", "display_name": "Label Used Buyer" }
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{carrier_label_buyer_2_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200

POST {{base_url}}/v1/me/addresses
Idempotency-Key: carrier-label-used-address
Content-Type: application/json
```json
{ "full_name": "Label Used Buyer", "address_1": "1 Test Street", "city": "Portland", "state_code": "US-OR", "zip": "97201", "country_code": "US", "phone": "+14155550102", "is_primary": true }
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"

POST {{base_url}}/v1/cart/items
Idempotency-Key: carrier-label-used-cart
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1 }
```
HTTP 201

POST {{base_url}}/v1/me/checkout/quote
Idempotency-Key: carrier-label-used-quote
Content-Type: application/json
```json
{ "user_address_id": "{{address_id}}" }
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"

POST {{base_url}}/v1/me/checkout
Idempotency-Key: carrier-label-used-checkout
Content-Type: application/json
```json
{ "quote_id": "{{quote_id}}", "payment_type": "cash" }
```
HTTP 201
[Captures]
order_public_id: jsonpath "$.order_shops[0].id"


# 2. Buy the label.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
group_id: jsonpath "$.order.fulfillment.groups[0].id"
order_item_id: jsonpath "$.order.fulfillment.groups[0].items[0].order_item_id"
quantity: jsonpath "$.order.fulfillment.groups[0].items[0].quantity"

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
Idempotency-Key: carrier-label-used-purchase
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "quote_id": "{{rate_quote_id}}", "group_id": "{{group_id}}", "items": [{ "order_item_id": "{{order_item_id}}", "quantity": {{quantity}} }] }
```
HTTP 201
[Captures]
shipment_id: jsonpath "$.fulfillment.groups[0].shipments[0].id"


# 3. A labeled Shipment cannot be voided around its refund.
DELETE {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/{{shipment_id}}
Idempotency-Key: carrier-label-used-void
[Cookies]
accessToken: {{seller_token}}
HTTP 409
[Asserts]
jsonpath "$.code" == "SHIPMENT_LABEL_REFUND_REQUIRED"


# 4. Handover makes the mock emit pickup, which marks the label used.
POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/{{shipment_id}}/handover
Idempotency-Key: carrier-label-used-handover
[Cookies]
accessToken: {{seller_token}}
HTTP 201

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Cookies]
accessToken: {{seller_token}}
[Options]
retry: 10
retry-interval: 500
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "dispatched"
jsonpath "$.order.fulfillment.groups[0].shipments[0].label.status" == "used"


# 5. Refund after a scan is refused and leaves the label and its charge alone.
DELETE {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/{{shipment_id}}/label
Idempotency-Key: carrier-label-used-refund
[Cookies]
accessToken: {{seller_token}}
HTTP 409
[Asserts]
jsonpath "$.code" == "SHIPMENT_LABEL_ALREADY_USED"

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.groups[0].shipments[0].status" == "dispatched"
jsonpath "$.order.fulfillment.groups[0].shipments[0].label.status" == "used"

GET {{base_url}}/v1/shops/{{shop_public_id}}/finance/transactions?limit=20
[Cookies]
accessToken: {{seller_token}}
[Options]
retry: 20
retry-interval: 500
HTTP 200
[Asserts]
jsonpath "$.transactions[0].type" == "label_charge"
jsonpath "$.transactions[0].status" == "deducted"
