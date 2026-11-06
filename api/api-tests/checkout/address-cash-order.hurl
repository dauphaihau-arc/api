# Saved-address create through a member cash checkout.
#
# Run after `just db-seed` with the API running. Each successful run creates one
# cash Order and consumes one unit of the seeded seller's stock; the product list
# below fails when that stock is exhausted, so reseed before rerunning.
#
# Address create/update is covered separately in `addresses/create-update.hurl`.
# The dedicated buyer keeps this flow out of other runs' carts. Registration and
# address creation are idempotent, and the cart item is reset to quantity 1 so a
# rerun does not accumulate quantity.

# 1. Sign in as the seller who owns the seeded shop.
POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{seller_login_email}}", "password": "{{seller_login_password}}", "app": "seller" }
```
HTTP 200
[Asserts]
cookie "accessToken" exists


# 2. Pick an in-stock inventory from the shop's active products.
GET {{base_url}}/v1/shops/me
HTTP 200
[Captures]
shop_public_id: jsonpath "$.id"
shop_slug: jsonpath "$.slug"
[Asserts]
jsonpath "$.id" startsWith "shop_"

GET {{base_url}}/v1/shops/{{shop_public_id}}/products?state=active&limit=1
x-category-identity-generation: 2
HTTP 200
[Captures]
product_slug: jsonpath "$.items[0].slug"
[Asserts]
jsonpath "$.items" count > 0

GET {{base_url}}/v1/products/by-slug/{{shop_slug}}/{{product_slug}}
HTTP 200
[Captures]
inventory_id: jsonpath "$.inventory[0].id"
[Asserts]
jsonpath "$.inventory" count > 0
jsonpath "$.inventory[0].stock" > 0


# 3. Register the dedicated buyer, then sign in as that buyer.
POST {{base_url}}/v1/auth/register
Idempotency-Key: address-cash-order-buyer-register
Content-Type: application/json
```json
{
  "email": "{{buyer_login_email}}",
  "password": "{{buyer_login_password}}",
  "display_name": "Address Cash Order Buyer"
}
```
HTTP *

POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{ "email": "{{buyer_login_email}}", "password": "{{buyer_login_password}}", "app": "storefront" }
```
HTTP 200
[Asserts]
cookie "accessToken" exists


# 4. Create the buyer's saved address with the name-based contract.
POST {{base_url}}/v1/me/addresses
Idempotency-Key: address-cash-order-buyer-address
Content-Type: application/json
```json
{
  "full_name": "Address Cash Order Buyer",
  "address_1": "1 Test Street",
  "city": "Portland",
  "state": "OR",
  "zip": "97201",
  "country": "US",
  "phone": "+15550000011",
  "is_primary": true
}
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"
[Asserts]
jsonpath "$.address.country" == "US"
jsonpath "$.address.state" == "OR"


# 5. Put exactly one unit of the inventory in the cart.
# The delete is optional: an absent item is an expected first-run state.
DELETE {{base_url}}/v1/cart/items?inventory_id={{inventory_id}}
HTTP *

POST {{base_url}}/v1/cart/items
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1 }
```
HTTP 201

PATCH {{base_url}}/v1/cart/items
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1, "is_select_order": true }
```
HTTP 200


# 6. Quote and confirm the checkout with the saved address.
POST {{base_url}}/v1/me/checkout/quote
Content-Type: application/json
```json
{ "user_address_id": "{{address_id}}" }
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"
[Asserts]
jsonpath "$.shops" count > 0

POST {{base_url}}/v1/me/checkout
Content-Type: application/json
```json
{ "quote_id": "{{quote_id}}", "payment_type": "cash" }
```
HTTP 201
[Captures]
order_public_id: jsonpath "$.order_shops[0].id"
[Asserts]
jsonpath "$.order_shops" count > 0


# 7. Read the member order and assert the saved address became its snapshot.
GET {{base_url}}/v1/me/orders/{{order_public_id}}
HTTP 200
[Asserts]
jsonpath "$.order_shop.shipping_address.country" == "US"
jsonpath "$.order_shop.shipping_address.state" == "OR"
jsonpath "$.order_shop.shipping_address.city" == "Portland"
