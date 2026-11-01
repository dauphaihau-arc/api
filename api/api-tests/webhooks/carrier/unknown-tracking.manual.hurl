# A correctly signed event for a tracking number no Shipment owns is acknowledged
# with an empty object, so the carrier does not retry it.
#
# The signature is a precomputed HMAC-SHA256 of `bodies/unknown-tracking.json`
# with the `CARRIER_WEBHOOK_SECRET` the API was started with. Regenerate it with
# `just carrier sign bodies/unknown-tracking.json` after editing the body.
POST {{base_url}}/v1/webhooks/carrier
Content-Type: application/json
x-carrier-signature: sha256={{carrier_signature_unknown_tracking}}
file,bodies/unknown-tracking.json;
HTTP 200
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$" isEmpty
