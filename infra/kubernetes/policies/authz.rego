package sull.authz

default allow := false

allow if {
  input.principal.typ == "service"
  input.action == "internal"
}

allow if {
  input.principal.typ == "user"
  input.principal.tenantId == input.resource.tenantId
  required_scope := sprintf("%s:%s", [input.resource.type, input.action])
  required_scope in input.principal.scopes
}

allow if {
  input.principal.typ == "user"
  "platform_admin" in input.principal.roles
}

deny_reason := "missing_scope" if {
  not allow
  input.principal.typ == "user"
}

deny_reason := "cross_tenant" if {
  not allow
  input.principal.tenantId != input.resource.tenantId
}
