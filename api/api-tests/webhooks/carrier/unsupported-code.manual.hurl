# A correctly signed event whose `event_code` is not a supported evidence code is
# rejected with `INVALID_CARRIER_EVENT`.
#
# The signature is a precomputed HMAC-SHA256 of `bodies/unsupported-code.json`
# with the `CARRIER_WEBHOOK_SECRET` the API was started with. Regenerate it with
# `just carrier sign bodies/unsupported-code.json` after editing the body.
POST {{base_url}}/v1/webhooks/carrier
Content-Type: application/json
x-carrier-signature: sha256={{carrier_signature_unsupported_code}}
file,bodies/unsupported-code.json;
HTTP 400
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$.code" == "INVALID_CARRIER_EVENT"
