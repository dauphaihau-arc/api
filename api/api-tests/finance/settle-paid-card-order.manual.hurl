# Settles the card checkout opened by `checkout/create-card-order.manual.hurl` and
# asserts the Seller Payable the paid Order credits - the second half of that
# flow.
#
# Before running: pay the Checkout Session URL the first half printed, and paste
# its `cs_...` id into `checkout_session_id` in `hurl.variables`.
#
# Reading the session is what marks the Order paid when the provider reports it
# as paid, so no webhook and no Stripe signature is involved.
#
# Needs the API and a worker process (`pnpm start:worker`) to credit the payable.
# The payable assertion is a floor, not an equality: positions accumulate per shop
# and currency, and Hurl cannot add. That a paid Order credits exactly once, by
# exactly its own amount, is asserted by
# `test/integration/finance-seller-payable.int-spec.ts`, which starts empty.
#
# Paste only the `cs_...` part of the URL, without the `#...` fragment.

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

GET {{base_url}}/v1/shops/me
HTTP 200
[Captures]
shop_public_id: jsonpath "$.id"

# Reading the session asks the provider what actually happened, and marks the
# Order paid itself when the session is paid - no webhook, and therefore no
# Stripe signature, is involved.
GET {{base_url}}/v1/checkout/session/{{checkout_session_id}}
HTTP 200
[Captures]
order_public_id: jsonpath "$.order_shops[0].id"
[Asserts]
jsonpath "$.order_shops" count > 0

# As the owner: the Order's frozen money facts, and proof the payment landed.
# `total_minor` is `subtotal_minor - discount_minor + shipping_minor`, which is
# the amount this Order credits Seller Payable.
GET {{base_url}}/v1/shops/{{shop_public_id}}/orders/{{order_public_id}}
HTTP 200
[Captures]
currency: jsonpath "$.order.currency"
expected_minor: jsonpath "$.order.total_minor"
[Asserts]
jsonpath "$.order.status" == "paid"

# The credit appears once the worker ticks; a failed assertion is what retries.
GET {{base_url}}/v1/shops/{{shop_public_id}}/finance/payable
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
header "Cache-Control" == "private, no-cache"
jsonpath "$.positions" count > 0
jsonpath "$.positions[0].currency" == {{currency}}
jsonpath "$.positions[0].available_minor" == 0
# At least this Order's amount is there, in its currency, with nothing available
# yet. It cannot be an equality: a shop's position accumulates, and Hurl has no
# arithmetic to add the previous position. Credited exactly once is asserted by
# the integration spec, which starts from an empty position.
jsonpath "$.positions[0].not_yet_available_minor" >= {{expected_minor}}
