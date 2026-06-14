-- Revoke EXECUTE on handle_new_user from anon and authenticated roles.
-- This function should only be called by the database trigger (on auth.users insert),
-- not via the REST API (/rest/v1/rpc/handle_new_user).

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
