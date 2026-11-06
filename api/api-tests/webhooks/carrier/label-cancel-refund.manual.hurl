# A purchased label stays refundable after the Order is canceled.
#
# Run via `just carrier label-cancel-refund`. Requires the Mock Carrier and MOCK_CARRIER_URL.


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


# 2. A buyer and a cash Order.
POST {{base_url}}/v1/auth/register
Idempotency-Key: carrier-label-cancel-register-{{carrier_run_id}}
Content-Type: application/json
```json
{ "email": "{{carrier_label_buyer_4_email}}", "password": "{{buyer_login_password}}", "display_name": "Cancel Label Buyer" }
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{carrier_label_buyer_4_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200

POST {{base_url}}/v1/me/addresses
Idempotency-Key: carrier-label-cancel-address
Content-Type: application/json
```json
{ "full_name": "Cancel Label Buyer", "address_1": "1 Test Street", "city": "Portland", "state": "OR", "zip": "97201", "country": "US", "phone": "+14155550104", "is_primary": true }
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"

POST {{base_url}}/v1/cart/items
Idempotency-Key: carrier-label-cancel-cart
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1 }
```
HTTP 201

POST {{base_url}}/v1/me/checkout/quote
Idempotency-Key: carrier-label-cancel-quote
Content-Type: application/json
```json
{ "user_address_id": "{{address_id}}" }
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"

POST {{base_url}}/v1/me/checkout
Idempotency-Key: carrier-label-cancel-checkout
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
quantity: jsonpath "$.order.fulfillment.groups[0].items[0].quantity"


# 3. Quote and buy the label.
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
price_minor: jsonpath "$.rates[0].price_minor"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/label
Idempotency-Key: carrier-label-cancel-purchase
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "quote_id": "{{rate_quote_id}}", "group_id": "{{group_id}}", "items": [{ "order_item_id": "{{order_item_id}}", "quantity": {{quantity}} }] }
```
HTTP 201
[Captures]
shipment_id: jsonpath "$.fulfillment.groups[0].shipments[0].id"


# 4. Cancel the Order while the labeled Shipment is still prepared.
PATCH {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/status
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "status": "canceled", "cancel_reason": "seller cannot ship" }
```
HTTP 200
[Asserts]
jsonpath "$.order.status" == "canceled"


# 5. Refund the label after cancellation.
DELETE {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/{{shipment_id}}/label
Idempotency-Key: carrier-label-cancel-refund
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].status" == "voided"
jsonpath "$.fulfillment.groups[0].shipments[0].label.status" == "voided"


# 6. The refund posts one reversal, visible in the seller timeline.
GET {{base_url}}/v1/shops/{{shop_public_id}}/finance/transactions?limit=20
[Cookies]
accessToken: {{seller_token}}
[Options]
retry: 20
retry-interval: 500
HTTP 200
[Asserts]
jsonpath "$.transactions[0].type" == "label_refund"
jsonpath "$.transactions[0].status" == "refunded"
jsonpath "$.transactions[0].net_amount_minor" == {{price_minor}}
