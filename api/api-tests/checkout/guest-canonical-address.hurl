# Guest cash checkout with canonical country and subdivision codes.
#
# Run after `just db-seed` with the API running. Each successful run creates one
# guest cash Order and consumes one unit of the seeded seller's stock.
#
# The guest cart relies on the cart cookie set by the first cart item request;
# Hurl keeps that cookie for the rest of this file.

# 1. Resolve one public product and its inventory without signing in. A seller
# login would put the cart on that user and leave the guest cart empty.
GET {{base_url}}/v1/products/best-sellers?limit=1
HTTP 200
[Captures]
shop_slug: jsonpath "$.items[0].shop.slug"
product_slug: jsonpath "$.items[0].slug"
[Asserts]
jsonpath "$.items" count > 0


# 2. Read the public product inventory.
GET {{base_url}}/v1/products/by-slug/{{shop_slug}}/{{product_slug}}
HTTP 200
[Captures]
inventory_id: jsonpath "$.inventory[0].id"
[Asserts]
jsonpath "$.inventory" count > 0
jsonpath "$.inventory[0].stock" > 0


# 3. Add one unit to a guest cart.
POST {{base_url}}/v1/cart/items
Content-Type: application/json
```json
{ "inventory_id": "{{inventory_id}}", "quantity": 1 }
```
HTTP 201


# 4. Quote the guest checkout from codes only; the server derives the names.
POST {{base_url}}/v1/checkout/cart/quote
Content-Type: application/json
```json
{
  "shipping_address": {
    "full_name": "Guest Codes Buyer",
    "address_1": "1 Test Street",
    "city": "Los Angeles",
    "country_code": "US",
    "state_code": "US-CA",
    "zip": "90001",
    "phone": "+14155550113"
  }
}
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"
[Asserts]
jsonpath "$.shops" count > 0


# 5. Confirm the guest cash Order.
POST {{base_url}}/v1/checkout/cart
Content-Type: application/json
```json
{
  "payment_type": "cash",
  "quote_id": "{{quote_id}}",
  "guest": { "email": "guest-codes@example.com" }
}
```
HTTP 201
[Captures]
order_public_id: jsonpath "$.order_shops[0].id"
[Asserts]
jsonpath "$.order_shops" count > 0


# 6. Read the guest order. The guest order list is a purchase summary, not the
# full address snapshot; the coded snapshot is covered by the checkout
# integration suite.
GET {{base_url}}/v1/checkout/guest-orders?email=guest-codes@example.com&order_id={{order_public_id}}&zip=90001
HTTP 200
[Asserts]
jsonpath "$.order_shops" count > 0
jsonpath "$.order_shops[0].id" == "{{order_public_id}}"
