# Label charge and refund money, plus buyer visibility and released quantities.
#
# Run via `just carrier label-refund`. Requires the Mock Carrier on 4100 and the
# API started with MOCK_CARRIER_URL (see mock-parcel.manual.hurl).
#
# Covers: charge on purchase, order/buyer facts untouched, refund before a scan,
# one reversal, idempotent replay, buyer hiding, PDF access, reprepare.

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
jsonpath "$.items[0].inventory[0].stock" >= 2


# 2. A buyer and a cash Order.
POST {{base_url}}/v1/auth/register
Idempotency-Key: carrier-label-refund-register-{{carrier_run_id}}
Content-Type: application/json
```json
{ "email": "{{carrier_label_buyer_1_email}}", "password": "{{buyer_login_password}}", "display_name": "Label Refund Buyer" }
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{carrier_label_buyer_1_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200

POST {{base_url}}/v1/me/addresses
Idempotency-Key: carrier-label-refund-address
Content-Type: application/json
```json
{ "full_name": "Label Refund Buyer", "address_1": "1 Test Street", "city": "Portland", "state_code": "US-OR", "zip": "97201", "country_code": "US", "phone": "+14155550101", "is_primary": true }
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"

POST {{base_url}}/v1/cart/items
Idempotency-Key: carrier-label-refund-cart
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1 }
```
HTTP 201

POST {{base_url}}/v1/me/checkout/quote
Idempotency-Key: carrier-label-refund-quote
Content-Type: application/json
```json
{ "user_address_id": "{{address_id}}" }
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"

POST {{base_url}}/v1/me/checkout
Idempotency-Key: carrier-label-refund-checkout
Content-Type: application/json
```json
{ "quote_id": "{{quote_id}}", "payment_type": "cash" }
```
HTTP 201
[Captures]
order_public_id: jsonpath "$.order_shops[0].id"


# 3. Baseline order facts and seller payable.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
group_id: jsonpath "$.order.fulfillment.groups[0].id"
order_item_id: jsonpath "$.order.fulfillment.groups[0].items[0].order_item_id"
quantity: jsonpath "$.order.fulfillment.groups[0].items[0].quantity"
order_number: jsonpath "$.order.order_number"
total_minor: jsonpath "$.order.total_minor"
shipping_minor: jsonpath "$.order.shipping_minor"

GET {{base_url}}/v1/shops/{{shop_public_id}}/finance/payable
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
available_before: jsonpath "$.available_minor"

GET {{base_url}}/v1/me/orders/{{order_public_id}}
HTTP 200
[Captures]
buyer_total_minor: jsonpath "$.order_shop.total_minor"

GET {{base_url}}/v1/shops/{{shop_public_id}}/finance/orders/{{order_public_id}}/payout
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
seller_payable_before: jsonpath "$.seller_payable_minor"
availability_before: jsonpath "$.availability"


# 4. Quote and buy the label.
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
[Asserts]
jsonpath "$.rates[0].price_minor" == 980

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/label
Idempotency-Key: carrier-label-refund-purchase
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "quote_id": "{{rate_quote_id}}", "group_id": "{{group_id}}", "items": [{ "order_item_id": "{{order_item_id}}", "quantity": {{quantity}} }] }
```
HTTP 201
[Captures]
shipment_id: jsonpath "$.fulfillment.groups[0].shipments[0].id"
label_public_id: jsonpath "$.fulfillment.groups[0].shipments[0].label.public_id"
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].status" == "prepared"
jsonpath "$.fulfillment.groups[0].shipments[0].label.status" == "purchased"


# 5. Charge: the row and the available balance.
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
jsonpath "$.transactions[0].order_number" == "{{order_number}}"
jsonpath "$.transactions[0].net_amount_minor" == -980

GET {{base_url}}/v1/shops/{{shop_public_id}}/finance/payable
[Cookies]
accessToken: {{seller_token}}
[Options]
retry: 20
retry-interval: 500
HTTP 200
[Asserts]
jsonpath "$.available_minor" < {{available_before}}


# 6. Buyer sees the parcel but not the postage price; order facts unchanged.
GET {{base_url}}/v1/me/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order_shop.total_minor" == {{buyer_total_minor}}
jsonpath "$.order_shop.fulfillment.groups[0].shipments[0].carrier" == "usps"
jsonpath "$.order_shop.fulfillment.groups[0].shipments[0].tracking_number" exists
jsonpath "$.order_shop.fulfillment.groups[0].shipments[0].label" not exists

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.order.total_minor" == {{total_minor}}
jsonpath "$.order.shipping_minor" == {{shipping_minor}}

GET {{base_url}}/v1/shops/{{shop_public_id}}/finance/orders/{{order_public_id}}/payout
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.seller_payable_minor" == {{seller_payable_before}}
jsonpath "$.availability" == {{availability_before}}


# 7. The label PDF is downloadable while purchased.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/{{shipment_id}}/label.pdf
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
header "Content-Type" == "application/pdf"


# 8. Refund before any scan.
DELETE {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/{{shipment_id}}/label
Idempotency-Key: carrier-label-refund-refund
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[0].status" == "voided"
jsonpath "$.fulfillment.groups[0].shipments[0].label.status" == "voided"


# 9. One reversal, visible to the seller, restores the balance.
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
jsonpath "$.transactions[0].order_number" == "{{order_number}}"
jsonpath "$.transactions[0].net_amount_minor" == {{price_minor}}
[Captures]
transactions_after_refund: jsonpath "$.total_results"

GET {{base_url}}/v1/shops/{{shop_public_id}}/finance/payable
[Cookies]
accessToken: {{seller_token}}
[Options]
retry: 20
retry-interval: 500
HTTP 200
[Asserts]
jsonpath "$.available_minor" == {{available_before}}


GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/{{shipment_id}}/label.pdf
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
header "Content-Type" == "application/pdf"


# 10. Replaying the same refund request changes nothing.
DELETE {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments/{{shipment_id}}/label
Idempotency-Key: carrier-label-refund-refund
[Cookies]
accessToken: {{seller_token}}
HTTP 200

GET {{base_url}}/v1/shops/{{shop_public_id}}/finance/transactions?limit=20
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.total_results" == {{transactions_after_refund}}


# 11. Buyer no longer sees the voided shipment; its quantities are free again.
GET {{base_url}}/v1/me/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order_shop.fulfillment.groups[0].shipments" isEmpty

GET {{base_url}}/v1/me/orders
HTTP 200
[Asserts]
jsonpath "$.order_shops[?(@.id == '{{order_public_id}}')].fulfillment.groups[0].shipments" isEmpty

GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.order.fulfillment.progress.outstanding" == {{quantity}}

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments
Idempotency-Key: carrier-label-refund-reprepare
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "group_id": "{{group_id}}", "items": [{ "order_item_id": "{{order_item_id}}", "quantity": {{quantity}} }], "carrier": "usps", "tracking_number": "{{carrier_pickup_tracking}}" }
```
HTTP 201
[Asserts]
jsonpath "$.fulfillment.groups[0].shipments[*].status" contains "voided"
jsonpath "$.fulfillment.groups[0].shipments[*].status" contains "prepared"
