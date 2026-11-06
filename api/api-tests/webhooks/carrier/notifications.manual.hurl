# Pickup and delivery notify both parties; other scans only refresh their pages.
#
# Run via `just carrier notifications`. Builds its own cash Order; the API must run
# with CARRIER_WEBHOOK_SECRET=carrier-webhook-test-secret. Web-push delivery needs a
# worker; this case asserts the in-app notification rows both recipients share.
#
# The seller token is captured once and attached with `[Cookies]` on seller reads;
# buyer reads use the shared jar, which holds the buyer session.


# 1. Seller session and catalogue facts.
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
shop_slug: jsonpath "$.slug"

GET {{base_url}}/v1/shops/{{shop_public_id}}/products?state=active&limit=20
x-category-identity-generation: 2
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
product_slug: jsonpath "$.items[0].slug"
inventory_id: jsonpath "$.items[0].inventory[0].id"
[Asserts]
jsonpath "$.items[0].inventory[0].stock" >= 1


# 2. Buyer session and a cash Order.
POST {{base_url}}/v1/auth/register
Idempotency-Key: carrier-notifications-register-{{carrier_run_id}}-1
Content-Type: application/json
```json
{ "email": "{{carrier_notifications_buyer_email}}", "password": "{{buyer_login_password}}", "display_name": "Notify Buyer" }
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{carrier_notifications_buyer_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200

POST {{base_url}}/v1/me/addresses
Idempotency-Key: carrier-notifications-address-1
Content-Type: application/json
```json
{ "full_name": "Notify Buyer", "address_1": "1 Test Street", "city": "Portland", "state": "OR", "zip": "97201", "country": "US", "phone": "+14155550031", "is_primary": true }
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"

POST {{base_url}}/v1/cart/items
Idempotency-Key: carrier-notifications-cart-1
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1 }
```
HTTP 201

POST {{base_url}}/v1/me/checkout/quote
Idempotency-Key: carrier-notifications-quote-1
Content-Type: application/json
```json
{ "user_address_id": "{{address_id}}" }
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"

POST {{base_url}}/v1/me/checkout
Idempotency-Key: carrier-notifications-checkout-1
Content-Type: application/json
```json
{ "quote_id": "{{quote_id}}", "payment_type": "cash" }
```
HTTP 201
[Captures]
order_public_id: jsonpath "$.order_shops[0].id"


# 3. Seller prepares the Shipment.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
group_id: jsonpath "$.order.fulfillment.groups[0].id"
order_item_id: jsonpath "$.order.fulfillment.groups[0].items[0].order_item_id"
quantity: jsonpath "$.order.fulfillment.groups[0].items[0].quantity"
order_number: jsonpath "$.order.order_number"

POST {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}/fulfillment/shipments
Idempotency-Key: carrier-notifications-prepare
Content-Type: application/json
[Cookies]
accessToken: {{seller_token}}
```json
{ "group_id": "{{group_id}}", "items": [{ "order_item_id": "{{order_item_id}}", "quantity": {{quantity}} }], "carrier": "usps", "tracking_number": "{{carrier_pickup_tracking}}" }
```
HTTP 201


# 4. Baselines. Preparing already notifies the buyer, asynchronously.
GET {{base_url}}/v1/me/notifications?limit=50
[Options]
retry: 10
retry-interval: 500
HTTP 200
[Captures]
buyer_base: jsonpath "$.total_results"
[Asserts]
jsonpath "$.total_results" > 0

GET {{base_url}}/v1/me/notifications?limit=50
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
seller_base: jsonpath "$.total_results"


# 5. Label creation is preparation evidence: no notification for either party.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_label_created}}
Content-Type: application/json
file,bodies/label-created.body;
HTTP 200

GET {{base_url}}/v1/me/notifications?limit=50
HTTP 200
[Asserts]
jsonpath "$.total_results" == {{buyer_base}}

GET {{base_url}}/v1/me/notifications?limit=50
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.total_results" == {{seller_base}}


# 6. Pickup notifies both parties and names the order and tracking.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_pickup}}
Content-Type: application/json
file,bodies/pickup.body;
HTTP 200

GET {{base_url}}/v1/me/notifications?limit=50
HTTP 200
[Captures]
buyer_after_pickup: jsonpath "$.total_results"
[Asserts]
jsonpath "$.total_results" > {{buyer_base}}
jsonpath "$.results[0].type" == "order.shipment.updated"
jsonpath "$.results[0].title" == "Order on the way"
jsonpath "$.results[0].body" contains "{{order_number}}"

GET {{base_url}}/v1/me/notifications?limit=50
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
seller_after_pickup: jsonpath "$.total_results"
[Asserts]
jsonpath "$.total_results" > {{seller_base}}
jsonpath "$.results[0].type" == "order.shipment.updated"
jsonpath "$.results[0].body" contains "{{order_number}}"


# 7. Transit, out-for-delivery, failure and return add no notification.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_transit}}
Content-Type: application/json
file,bodies/transit.body;
HTTP 200

POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_ofd}}
Content-Type: application/json
file,bodies/ofd.body;
HTTP 200

POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_delivery_failed}}
Content-Type: application/json
file,bodies/delivery-failed.body;
HTTP 200

POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_returned}}
Content-Type: application/json
file,bodies/returned.body;
HTTP 200

GET {{base_url}}/v1/me/notifications?limit=50
HTTP 200
[Asserts]
jsonpath "$.total_results" == {{buyer_after_pickup}}

GET {{base_url}}/v1/me/notifications?limit=50
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.total_results" == {{seller_after_pickup}}


# 8. Delivery notifies both parties once more.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_delivered}}
Content-Type: application/json
file,bodies/delivered.body;
HTTP 200

GET {{base_url}}/v1/me/notifications?limit=50
HTTP 200
[Captures]
buyer_after_delivery: jsonpath "$.total_results"
[Asserts]
jsonpath "$.total_results" > {{buyer_after_pickup}}
jsonpath "$.results[0].type" == "order.shipment.updated"
jsonpath "$.results[0].title" == "Order delivered"

GET {{base_url}}/v1/me/notifications?limit=50
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Captures]
seller_after_delivery: jsonpath "$.total_results"
[Asserts]
jsonpath "$.total_results" > {{seller_after_pickup}}


# 9. Replaying the pickup event id notifies nobody again.
POST {{base_url}}/v1/webhooks/carrier
x-carrier-signature: sha256={{carrier_signature_pickup}}
Content-Type: application/json
file,bodies/pickup.body;
HTTP 200

GET {{base_url}}/v1/me/notifications?limit=50
HTTP 200
[Asserts]
jsonpath "$.total_results" == {{buyer_after_delivery}}

GET {{base_url}}/v1/me/notifications?limit=50
[Cookies]
accessToken: {{seller_token}}
HTTP 200
[Asserts]
jsonpath "$.total_results" == {{seller_after_delivery}}
