# Opens a card checkout the way the storefront does and prints the Stripe Checkout
# Session URL for you to pay - the first half of the paid card Order -> Seller
# Payable flow.
#
# Run it, open the printed `checkout_session_url`, pay with 4242 4242 4242 4242
# (any future expiry, any CVC), paste the `cs_...` id from that URL into
# `checkout_session_id` in `hurl.variables`, then run
# `finance/settle-paid-card-order.manual.hurl`.
#
# `*.manual.hurl` is a naming convention, not a Hurl feature: `suite` and
# `pnpm test:hurl` run every other `.hurl` file, but cannot run this pair, which
# needs the payment step mid-flight.
#
# Needs the API and a worker process (`pnpm start:worker`): the worker turns the
# checkout outbox row into the Stripe Checkout Session and later the `order.paid`
# money event into the Seller Payable credit. Also needs a test-mode Stripe key
# (`sk_test_...`) with network access, and a seeded seller (`seller_login_email`)
# whose shop has an active, in-stock product.


# 1. Sign in as the seller who owns the shop.
POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{
  "email": "{{seller_login_email}}",
  "password": "{{seller_login_password}}",
  "app": "seller"
}
```
HTTP 200
[Asserts]
cookie "accessToken" exists


# 2. Resolve the seller's own shop: its id addresses the product list and the
# finance reads.
GET {{base_url}}/v1/shops/me
HTTP 200
[Captures]
shop_public_id: jsonpath "$.id"
[Asserts]
jsonpath "$.id" startsWith "shop_"


# 3. Pick an in-stock inventory from the shop's active products.
# The list items carry their inventories, so depleted products are filtered out
# instead of being picked and rejected later. Each confirmed card Order sells one
# unit, so a shop that ran this flow enough times ends up with no stock: Hurl then
# fails on the `nth` capture below with `invalid filter input: out of bound`, and
# the local stock has to be restored (`just db-seed`).
# The category-bearing product list refuses a request that does not declare
# which category identity generation it speaks.
GET {{base_url}}/v1/shops/{{shop_public_id}}/products?state=active&limit=50
x-category-identity-generation: 2
HTTP 200
[Captures]
inventory_id: jsonpath "$.items[*].inventory[?(@.stock > 0)].id" nth 0


# 4. Buyer: registering twice is not an error, so accept any status.
POST {{base_url}}/v1/auth/register
Idempotency-Key: paid-card-order-buyer-register
Content-Type: application/json
```json
{
  "email": "{{buyer_login_email}}",
  "password": "{{buyer_login_password}}",
  "display_name": "Paid Card Order Buyer"
}
```
HTTP *


# 5. Sign the buyer in.
POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{
  "email": "{{buyer_login_email}}",
  "password": "{{buyer_login_password}}",
  "app": "storefront"
}
```
HTTP 200
[Asserts]
cookie "accessToken" exists


# 6. Create the buyer's shipping address.
POST {{base_url}}/v1/me/addresses
Idempotency-Key: paid-card-order-buyer-address
Content-Type: application/json
```json
{
  "full_name": "Paid Card Order Buyer",
  "address_1": "1 Test Street",
  "city": "Portland",
  "state": "OR",
  "zip": "97201",
  "country": "US",
  "phone": "+15550000003",
  "is_primary": true
}
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"


# 7. Add the product to the buyer's cart.
POST {{base_url}}/v1/cart/items
Idempotency-Key: paid-card-order-cart-item
Content-Type: application/json
```json
{
  "inventory_id": "{{inventory_id}}",
  "quantity": 1
}
```
HTTP 201


# 8. Quote the checkout.
POST {{base_url}}/v1/me/checkout/quote
Idempotency-Key: paid-card-order-quote
Content-Type: application/json
```json
{
  "user_address_id": "{{address_id}}"
}
```
HTTP 201
[Captures]
quote_id: jsonpath "$.quote_id"
[Asserts]
jsonpath "$.shops" count > 0


# 9. Confirm the checkout as a card payment.
POST {{base_url}}/v1/me/checkout
Idempotency-Key: paid-card-order-confirm
Content-Type: application/json
```json
{
  "quote_id": "{{quote_id}}",
  "payment_type": "card"
}
```
HTTP 201
[Captures]
order_public_id: jsonpath "$.order_shops[0].id"


# 10. Wait for the Stripe Checkout Session URL.
# The card checkout is asynchronous: the API enqueues a checkout outbox row and
# the worker turns it into the Stripe Checkout Session.
GET {{base_url}}/v1/me/checkout/session/readiness?order_ids={{order_public_id}}
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Captures]
checkout_session_url: jsonpath "$.checkout_session_url"
[Asserts]
jsonpath "$.checkout_session_url" exists
