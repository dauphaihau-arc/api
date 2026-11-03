# A signature that is well-formed hex but does not match the body is refused.
#
# The value is `sha256=` followed by 64 zeros, so it can never be the digest of
# the signed body.
POST {{base_url}}/v1/webhooks/carrier
Content-Type: application/json
x-carrier-signature: sha256=0000000000000000000000000000000000000000000000000000000000000000
file,bodies/unknown-tracking.json;
HTTP 401
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$.code" == "INVALID_CARRIER_SIGNATURE"
