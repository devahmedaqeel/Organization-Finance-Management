import { useEffect } from "react";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { can, Permission } from "@/services/permissionService";
import { showFloatingToast } from "@/utils/toast";

/**
 * Screen-level role guard. Menus already hide screens a role can't use, but a screen can
 * still be reached directly (deep link, back stack, notification), so each restricted
 * screen checks the permission matrix itself and leaves if the user isn't allowed.
 *
 * Returns true while the user is allowed (render the screen), false otherwise.
 */
export function useRequirePermission(permission: Permission): boolean {
  const { user, isLoading } = useAuth();
  const allowed = !!user && can(user, permission);

  useEffect(() => {
    if (isLoading || !user || allowed) return;
    showFloatingToast("Access restricted", "Your role doesn't have access to this section.");
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [isLoading, user, allowed]);

  return allowed;
}
