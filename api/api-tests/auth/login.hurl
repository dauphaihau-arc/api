POST {{base_url}}/v1/auth/login
Content-Type: application/json
```json
{
  "email": "{{auth_login_email}}",
  "password": "{{auth_login_password}}"
}
```
HTTP 200
[Asserts]
duration < 500
header "Content-Type" contains "application/json"
header "Cache-Control" == "no-store"
cookie "accessToken" exists
cookie "refreshToken" exists
jsonpath "$.user.email" == "{{auth_login_email}}"
jsonpath "$.user.id" exists
jsonpath "$.user.session_id" exists
