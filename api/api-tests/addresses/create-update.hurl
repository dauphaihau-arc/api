# Saved-address create and update through the member address API.
#
# Run after `just db-seed` with the API running. The dedicated buyer and
# Idempotency-Key keep reruns on the same address; the update is deliberately
# idempotent so the assertion can run every time.

# 1. Register the dedicated buyer, then sign in as that buyer.
POST {{base_url}}/v1/auth/register
Idempotency-Key: address-crud-buyer-register
Content-Type: application/json
```json
{
  "email": "{{buyer_login_email}}",
  "password": "{{buyer_login_password}}",
  "display_name": "Address CRUD Buyer"
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


# 2. Create a saved address with canonical country and subdivision codes.
POST {{base_url}}/v1/me/addresses
Idempotency-Key: address-crud-buyer-address
Content-Type: application/json
```json
{
  "full_name": "Address CRUD Buyer",
  "address_1": "1 Test Street",
  "city": "Los Angeles",
  "country_code": "US",
  "state_code": "US-CA",
  "zip": "90001",
  "phone": "+15550000012",
  "is_primary": true
}
```
HTTP 201
[Captures]
address_id: jsonpath "$.address.id"
[Asserts]
jsonpath "$.address.country" == "United States"
jsonpath "$.address.country_code" == "US"
jsonpath "$.address.state" == "California"
jsonpath "$.address.state_code" == "US-CA"
jsonpath "$.address.city" == "Los Angeles"


# 3. Update only the fields that changed; the untouched address line and country
# remain as they were.
PATCH {{base_url}}/v1/me/addresses/{{address_id}}
Content-Type: application/json
```json
{ "city": "Seattle", "state_code": "US-WA", "zip": "98101" }
```
HTTP 200
[Asserts]
jsonpath "$.address.address_1" == "1 Test Street"
jsonpath "$.address.country" == "United States"
jsonpath "$.address.country_code" == "US"
jsonpath "$.address.city" == "Seattle"
jsonpath "$.address.state" == "Washington"
jsonpath "$.address.state_code" == "US-WA"
jsonpath "$.address.zip" == "98101"


# 4. Read the address back after the update.
GET {{base_url}}/v1/me/addresses/{{address_id}}
HTTP 200
[Asserts]
jsonpath "$.address.id" == "{{address_id}}"
jsonpath "$.address.city" == "Seattle"
jsonpath "$.address.country_code" == "US"
jsonpath "$.address.state" == "Washington"
jsonpath "$.address.state_code" == "US-WA"
jsonpath "$.address.zip" == "98101"
