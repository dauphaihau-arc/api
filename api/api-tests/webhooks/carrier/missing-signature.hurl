# A carrier webhook without `x-carrier-signature` is refused before any command runs.
#
# The body is sent from a file so its bytes are exactly what the other cases sign.
POST {{base_url}}/v1/webhooks/carrier
Content-Type: application/json
file,bodies/unknown-tracking.json;
HTTP 401
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$.code" == "INVALID_CARRIER_SIGNATURE"
